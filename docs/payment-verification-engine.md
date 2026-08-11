# AI Payment Verification Engine

The AI pre-verifies every payment proof a customer sends over WhatsApp and drives
the conversation until the payment is clean, so the business owner only confirms
ready-to-approve payments instead of reviewing every screenshot. The AI filters;
the human approves. Nothing continues until the owner confirms.

This document is the consolidated product + technical design for the
`payment-verification-engine` change (SDD artifacts: proposal, spec, design —
stored in Engram under `sdd/payment-verification-engine/*`).

## Quick path

1. Customer sends a payment proof (screenshot/PDF) in the WhatsApp thread.
2. The AI extracts structured payment data (perception) and a deterministic rule
   engine issues a verdict (decision).
3. Clean payments land in the owner's inbox (`ready_to_confirm`). Problematic
   ones are handled by the AI with the customer, never reaching the owner.
4. The owner confirms (dashboard or inline chat card). Only then does the AI tell
   the customer the payment is confirmed and the business flow continues.

## Goals and non-goals

| Goals | Non-goals (v1) |
|---|---|
| Owner reviews only mostly-good payments ("clean inbox") | Bank/gateway integration (true money verification) — phase 3 |
| AI drives the customer toward a `valid` payment state | Auto-confirmation — AI verdict never confirms a payment |
| Partial/fake/invalid handled autonomously, bounded | Catalog management UI polish (API/seed first) |
| Auditable: every AI message, verdict, transition logged | Multi-currency auto-conversion |
| Balance counts only human-confirmed payments | Customer-facing AI verdict exposure (customers never see verdicts) |

## Core concept: the PaymentSession, not the proof

The unit of work is a **PaymentSession** — a debt — not an individual proof.
One session can hold N proofs (partial payments, re-sends), which is what
enables "you still owe X" without double counting, and keeps a re-send from
creating a new queue row.

Expected amounts come from a **structured product catalog** (`CatalogItem`),
not from free-text `knowledgeDoc`/`businessInfo`. Today prices exist only as
prose (e.g. `Servicios: "Corte $150 | Barba $100"` in `prisma/seed.ts:47`);
a structured catalog makes the `Expected` column hard and auditable.

## Layered engine

Deterministic core, probabilistic edges. The LLM never decides state
transitions — it only perceives (extracts) and speaks (writes customer
messages). This keeps the engine testable, lets models be upgraded without
breaking guarantees, and makes every decision auditable.

| Layer | Owner | Job |
|---|---|---|
| Perception | AI (vision) | Extract typed fields from the proof + per-field confidence (`EvidenceAnalysis`) |
| Decision | Deterministic rules | `EvidenceAnalysis` + catalog + session context → verdict |
| Voice | AI (chat) | Drive the customer toward `valid`, bounded autonomy |
| Authority | Human owner | Confirm/reject — the only trigger that continues the flow |

## Verdict taxonomy

| Verdict | Meaning | Destination |
|---|---|---|
| `valid` | Matches catalog price, correct account, completed transfer, unique reference | Owner inbox (green, 1-tap confirm) |
| `needs_attention` | Partial, overpaid, product mismatch, stale proof, in-flight transfer, third-party payer, low confidence | Owner inbox, flagged with reason + AI suggestion |
| `suspicious` | Tampering signals, wrong destination account, known-fake patterns | Audit queue; AI stalls the customer politely, never accuses |
| `invalid` | Not a proof at all, unreadable, unrelated photo | No row; AI asks the customer to resend, bounded retries |

**Golden rule: when in doubt, escalate to the human — never auto-approve.**
Error asymmetry: telling a real payer "you didn't pay" is far worse than one
extra row for the owner, so autonomous pushback requires high confidence.

## State machine

```text
awaiting_proof ──proof arrives──▶ analyzing
analyzing ──valid/needs_attention──▶ ready_to_confirm ──owner──▶ confirmed
                                              └─────owner──────▶ rejected
analyzing ──suspicious/invalid──▶ customer_action_required
customer_action_required ──fixed proof──▶ analyzing        (bounded retries)
customer_action_required ──refusal / budget exhausted / low confidence──▶ escalated
escalated ──owner takes over the conversation
any open state ──timeout──▶ expired
```

Session statuses: `awaiting_proof`, `analyzing`, `customer_action`,
`ready_to_confirm`, `confirmed`, `rejected`, `escalated`, `expired`.

## Scenario handling

| Scenario | AI verdict | What happens |
|---|---|---|
| Valid payment | `valid` | Inbox green; customer hears "we're confirming your payment shortly" |
| Partial payment | `needs_attention` | AI tells customer the remaining X; session surfaces to owner with [received, remaining, what AI said] |
| Overpayment | `needs_attention` | Owner decides: refund difference or credit |
| Fake payment | `suspicious` | Audit queue; AI: "we couldn't verify it, we'll contact you" — no accusation |
| Wrong destination account | `suspicious` | Money never reached the business account → reject path |
| Wrong product | `needs_attention` | Owner decides |
| No payment sent | `invalid` | No row; agent keeps the conversation, asks for the proof |
| Unrelated/garbled photo | `invalid` | Agent asks for a resend; N retries → escalate |
| Duplicate resubmission | `duplicate` (reference/image-hash match) | Never double-counts; "we already registered it" |
| In-flight/scheduled transfer | `needs_attention` | Money hasn't moved; wait for completion |
| Third-party payer | `needs_attention` | Common case — flag, don't auto-reject |
| Low extraction confidence | `needs_attention` → escalate | Safety valve: always human |
| Prompt injection (text in image or chat) | n/a | OCR text is data, never instructions; customer input always fenced |

## Data model (new)

```prisma
model CatalogItem {
  id         String   @id @default(cuid())
  businessId String
  name       String
  price      Int      // minor units (cents/centavos)
  currency   String   @default("MXN")
  isActive   Boolean  @default(true)
  sessions   PaymentSession[]
  // @@index([businessId])
}

model PaymentSession {
  id             String   @id @default(cuid())
  businessId     String
  conversationId String
  customerPhone  String
  catalogItemId  String?          // matched product; null = unmatched
  expectedAmount Int?             // minor units, snapshot at creation
  receivedAmount Int      @default(0) // sum of confirmed-valid proofs
  status         String   @default("awaiting_proof")
  statusReason   String?          // machine-readable flag: partial|overpaid|mismatch|stale|in_flight|third_party|low_confidence
  autonomyRounds Int      @default(0) // AI<->customer correction rounds used
  proofs         PaymentProof[]
  audit          PaymentAuditEntry[]
  confirmedById  String?
  confirmedAt    DateTime?
  expiresAt      DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  // @@index([businessId, status])
}

model PaymentProof {
  id          String   @id @default(cuid())
  sessionId   String
  messageId   String?  // link to the WhatsApp Message that carried it
  waMediaId   String?  // WhatsApp media id — enables re-download for preview
  extracted   Json     // EvidenceAnalysis — readers MUST re-validate (see summary Json precedent)
  verdict     String   // valid|needs_attention|suspicious|invalid|duplicate
  confidence  Float
  reference   String?  // bank operation reference — uniqueness guard
  imageHash   String?  // dedup identical re-sends
  paidAt      DateTime?
  createdAt   DateTime @default(now())
  // @@unique([sessionId, reference]) where reference non-null (enforced in app layer on Prisma 5.22)
}

model PaymentAuditEntry {
  id        String   @id @default(cuid())
  sessionId String
  actor     String   // "ai" | "human" | "system"
  action    String   // proof_received|verdict_issued|message_sent|transition|owner_confirmed|owner_rejected|override
  detail    Json?
  createdAt DateTime @default(now())
  // @@index([sessionId, createdAt])
}
```

Amounts are stored as integers in minor units to avoid float drift.

## Integration with the existing codebase (verified)

| Concern | Existing code | Change |
|---|---|---|
| Image ingest | `parseUserContent`, `src/lib/message-handler.ts:898-923` | After `describeImageFromBuffer`, enqueue proof analysis when the description/image looks payment-like |
| PDF proofs | `document` case, `message-handler.ts:957-958` — currently ignored | Download + analyze documents too (gap: PDFs are invisible today) |
| Vision extraction | `describeImageFromBuffer`, `src/lib/media.ts:32` | New `extractPaymentEvidence()` alongside it: same `resolveModels().visionModel` + `callWithAiCredential`, but `response_format: json_object` (summarize.ts precedent) with reader-side validation |
| Raw image storage | Received images are NOT linked to the `Message` row — only the description persists | Store `waMediaId` on `PaymentProof` for owner preview |
| Structured output | No tool-calling anywhere; only `response_format: json_object` in `src/lib/ai/summarize.ts:232` | Extraction returns JSON + a `validateEvidenceAnalysis` guard (mirror `validateConversationSummary` convention) |
| Trust boundary | Branded `SystemPrompt` + `renderUntrustedBlock` + `sanitizeUntrusted`, `src/lib/prompt.ts:18,139,98` | Customer text and OCR text always fenced; extraction prompt minted separately, never includes customer text outside fences |
| Async analysis | Outbox: `WebhookEvent` + `src/lib/outbox/{repository.ts,drain.ts}` (claim leases, backoff, resumable) | Proof-analysis jobs follow the same claim/lease pattern (new job type or parallel table) |
| Tenant scoping | `businessScope`/`appointmentScope`, `src/lib/scope.ts:21-43` | New `paymentSessionScope(user)` — same shape |
| Route auth | `requireAdmin` / client scope, `src/lib/auth.ts`; appointments routes pattern | `/api/payments/*` mirrors `/api/appointments/*` |
| Feature module | `src/features/appointments/{api.ts,types.ts,components/,containers/}` (container-presentational) | New `src/features/payments/` with the same layout |
| Chat inline card | `message-bubble.tsx` / `conversation-thread.tsx`, `src/features/conversations/components/` | Payment card rendered under the media message carrying the proof: image + extracted data + confirm/reject buttons |
| Customer notify | bot reply path (`sendAndPersistReply` in message-handler) | Confirmations/"we're reviewing" messages go through the normal send path |
| AI budgets | `dailyAiLimit` per business | Per-session `autonomyRounds` cap + extraction cost counted against the same budget |
| Downstream link | `Appointment.status` (`src/lib/appointment-status.ts`) | A confirmed session can mark a linked appointment paid (v1: manual link optional) |

## Known gaps and risks

1. **False negatives are the worst error.** High confidence threshold before the
   AI pushes back on a customer; below it, escalate. Never auto-approve.
2. **Screenshots ≠ money.** `valid` means "the proof looks valid", not "the money
   arrived". True verification requires bank/gateway integration (phase 3).
3. **The AI promises on the owner's behalf** ("we'll confirm shortly") — needs an
   owner SLA/nudge so the promise doesn't break.
4. **Per-business prompt quality.** Escalation rules driven by each business's
   prompt need a shared, well-tested payment-handling prompt module rather than
   free-text authoring.
5. **Feedback loop.** Owner overrides must feed back into the filter, or the AI
   repeats mistakes.
6. **Cost/latency.** Multiple vision calls per session; budget per session.
7. **"Valid" ambiguity.** Full-amount vs owner-acceptable (partials an owner may
   confirm as-is) — see open decisions.

## Phasing

| Phase | Scope |
|---|---|
| 1 (v1) | Models (CatalogItem, PaymentSession, PaymentProof, PaymentAuditEntry), extraction + validation, verdict engine, owner dashboard (filtered inbox, preview, confirm/reject), audit log, bounded AI handling of suspicious/invalid |
| 2 | Inline chat payment card + confirm shortcut, feedback loop from overrides, catalog management UI, owner SLA nudges |
| 3 | Bank/payment-gateway integration for true money verification; auto-reconciliation |

## Open decisions

- [ ] Partial-payment semantics: confirm-as-partial (close row, track remaining)
      vs hold-until-complete (row confirms only at full amount).
- [ ] Catalog bootstrap: seed/API-only in v1 vs minimal CRUD UI.
- [ ] Autonomy budget default: proposed 3 correction rounds per session.
- [ ] Session expiry: proposed 72h timeout for `customer_action`/`awaiting_proof`.

## Acceptance criteria (v1)

- [ ] An inbound image/PDF that looks like a payment proof creates a
      PaymentSession (or attaches to an open one) and a PaymentProof row.
- [ ] Extraction yields typed fields with per-field confidence; malformed JSON
      from the model is rejected, never trusted.
- [ ] Verdict categories map to the destinations above; `ready_to_confirm` is the
      only state that appears in the owner inbox.
- [ ] Balance/total shown to the owner counts `confirmed` sessions only.
- [ ] Duplicate references/image hashes never count twice.
- [ ] Customer text and OCR content reach the model only inside untrusted fences.
- [ ] Every verdict, AI customer message, state transition, and owner action has
      an audit entry.
- [ ] The agent stops after N rounds or on refusal/low confidence and escalates.
- [ ] All new queries are tenant-scoped (`paymentSessionScope`); routes gated.
- [ ] vitest integration coverage for verdict rules, dedup, scoping; lint and
      typecheck pass.
