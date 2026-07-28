import { processWebhookPayload } from "../message-handler";
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

  await expireStale();

  for (;;) {
    if (Date.now() - startedAt >= budgetMs) {
      result.remaining = true;
      break;
    }

    const batch = await claimBatch(batchSize, LEASE_TTL_SECONDS, workerId, eventId);
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
        await processWebhookPayload(event.payload);
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

  return result;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
