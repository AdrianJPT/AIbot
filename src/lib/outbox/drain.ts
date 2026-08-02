import { processWebhookPayload, reapStrandedSends } from "../message-handler";
import { sweepDueConversations } from "../reply-window-scheduler";
import { claimBatch, complete, expireStale, fail } from "./repository";

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_BUDGET_MS = 50_000;

/**
 * How long a claimed row stays leased before `expireStale` reclaims it.
 * Must comfortably exceed the slowest single-message ingest step (audio
 * transcription, the true worst case) and exceed the inline webhook budget
 * (12s) so the drain can never steal a row the webhook is actively working.
 */
const LEASE_TTL_SECONDS = 90;

export interface DrainResult {
  claimed: number;
  processed: number;
  failed: number;
  /** True when the time budget ran out before the queue was drained. */
  remaining: boolean;
}

export interface DrainOptions {
  /** Max rows claimed per batch. Defaults to 10. */
  batchSize?: number;
  /** Wall-clock budget for this call, in ms. Defaults to 50s. */
  budgetMs?: number;
  /**
   * Scopes the drain to a single row — used by the inline webhook path to
   * process exactly the event it just enqueued, instead of also picking up
   * unrelated pending work from other requests.
   */
  eventId?: string;
}

/**
 * Recovers orphaned leases, then claims and processes pending `WebhookEvent`
 * rows one batch at a time until the queue is empty or the time budget runs
 * out. Budget enforcement is cooperative (checked at batch/event
 * boundaries), not a race — nothing keeps running after this promise
 * resolves, which is what makes it safe to await inline in the webhook
 * request.
 */
export async function runDrain(
  options: DrainOptions = {},
): Promise<DrainResult> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const { eventId } = options;
  const startedAt = Date.now();
  const workerId = `drain-${startedAt}-${Math.random().toString(36).slice(2)}`;

  const result: DrainResult = {
    claimed: 0,
    processed: 0,
    failed: 0,
    remaining: false,
  };
  const touchedConversationIds = new Set<string>();

  await expireStale();

  for (;;) {
    if (Date.now() - startedAt >= budgetMs) {
      result.remaining = true;
      break;
    }

    const batch = await claimBatch(
      batchSize,
      LEASE_TTL_SECONDS,
      workerId,
      eventId,
    );
    if (batch.length === 0) break;
    result.claimed += batch.length;

    for (const event of batch) {
      if (Date.now() - startedAt >= budgetMs) {
        // Release unprocessed rows immediately rather than letting them sit
        // as "processing" until their lease expires — the sweep/next drain
        // tick can pick them up right away instead of waiting out the TTL.
        await fail(event.id, "drain budget exceeded before processing");
        result.remaining = true;
        continue;
      }

      try {
        const touched = await processWebhookPayload(event.payload);
        for (const id of touched) touchedConversationIds.add(id);
        await complete(event.id);
        result.processed += 1;
      } catch (err) {
        await fail(event.id, describeError(err));
        result.failed += 1;
      }
    }

    // A single scoped event is always a complete drain regardless of what
    // else is pending; an under-full batch means the queue is empty.
    if (eventId || batch.length < batchSize) break;
  }

  // Dispatch is entirely event-driven now — nothing sends inline during
  // ingest (see message-handler.ts's processWebhookPayload). The inline
  // webhook path scopes the sweep to exactly the conversations its own
  // payload touched (never other businesses' pending work, inside a request
  // Meta is timing); the scheduled/external drain sweeps unscoped, which is
  // what replaces the removed setInterval — see design §5-6.
  if (eventId) {
    if (touchedConversationIds.size > 0) {
      await sweepDueConversations({
        conversationIds: [...touchedConversationIds],
      });
    }
  } else {
    // Stranded-send recovery only runs on the unscoped (scheduled/dev
    // ticker) path, never inline — a stranded row by definition belongs to
    // some earlier request that already returned, so recovering it can't
    // improve this request's latency and shouldn't eat into its 12s budget.
    // See message-handler.ts's reapStrandedSends for the crash window this
    // closes.
    await reapStrandedSends();
    await sweepDueConversations();
  }

  return result;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
