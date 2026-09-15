/**
 * Renders a `ToolResult` as the fenced, untrusted block a model would be
 * shown for it. A tool result is not customer-authored, but it is exactly as
 * untrusted: a lookup can echo a customer's own text back, a third-party API
 * can return anything, and a compromised or malicious record can plant a
 * sentence built to look like an instruction. It gets the same fence as every
 * other untrusted string that reaches the model — `renderUntrustedBlock`
 * (`../prompt.ts`), which wraps it behind a per-render random id no
 * attacker-controlled text can guess — rather than a second, parallel
 * implementation of the same idea.
 *
 * On top of the fence, this also runs the result through `sanitizeToolInput`
 * (`./audit.ts`), the same redaction already applied to raw tool *input*
 * before it is persisted to the audit trail. A customer's chat message is
 * deliberately NOT redacted for phone numbers before reaching the model —
 * that is legitimate business data the customer typed about themselves — but
 * a tool result comes from code, not from someone describing themselves. An
 * access token or an internal id leaking into an API response has no
 * legitimate reason to reach the model at all, so the stricter treatment
 * belongs here, not on customer text.
 */
import { renderUntrustedBlock } from "../prompt";
import { sanitizeToolInput } from "./audit";
import type { ToolResult } from "./contracts";

/**
 * `toolName` is caller-supplied and trusted — the name of a registered tool,
 * never customer-derived — same contract as `renderUntrustedBlock`'s label.
 */
export function renderToolResultBlock(
  toolName: string,
  result: ToolResult,
): string {
  const payload = result.ok ? result.data : { error: result.failure };
  const sanitized = sanitizeToolInput(payload) ?? "null";
  return renderUntrustedBlock(
    `RESULTADO DE HERRAMIENTA ${toolName}`,
    sanitized,
  );
}
