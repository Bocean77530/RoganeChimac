export const DEFAULT_RETRY_DELAYS_MS = [5_000, 30_000, 120_000, 600_000, 1_800_000] as const;

export type RetryDecision =
  | { action: "retry"; delayMs: number; nextAttemptAt: string }
  | { action: "manual_action_required"; reason: "not_retryable" }
  | { action: "dead_letter"; reason: "attempts_exhausted" };

type RetryDecisionInput = {
  attemptCount: number;
  maxAttempts: number;
  retryable: boolean;
  nowMs: number;
  randomUnit?: number;
  jitterRatio?: number;
  delaysMs?: readonly number[];
};

/**
 * Returns a deterministic retry decision when `randomUnit` and `nowMs` are
 * supplied. `attemptCount` is the number of attempts that have already failed.
 */
export function decideIntegrationRetry({
  attemptCount,
  maxAttempts,
  retryable,
  nowMs,
  randomUnit = 0.5,
  jitterRatio = 0.2,
  delaysMs = DEFAULT_RETRY_DELAYS_MS,
}: RetryDecisionInput): RetryDecision {
  if (!retryable) {
    return { action: "manual_action_required", reason: "not_retryable" };
  }

  if (attemptCount >= maxAttempts) {
    return { action: "dead_letter", reason: "attempts_exhausted" };
  }

  if (!Number.isFinite(nowMs)) {
    throw new RangeError("nowMs must be finite");
  }
  if (!Number.isInteger(attemptCount) || attemptCount < 1) {
    throw new RangeError("attemptCount must be a positive integer");
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError("maxAttempts must be a positive integer");
  }
  if (!Number.isFinite(randomUnit) || randomUnit < 0 || randomUnit > 1) {
    throw new RangeError("randomUnit must be between 0 and 1");
  }
  if (!Number.isFinite(jitterRatio) || jitterRatio < 0 || jitterRatio > 1) {
    throw new RangeError("jitterRatio must be between 0 and 1");
  }
  if (delaysMs.length === 0 || delaysMs.some((delay) => !Number.isFinite(delay) || delay < 0)) {
    throw new RangeError("delaysMs must contain non-negative finite values");
  }

  const delayIndex = Math.min(attemptCount - 1, delaysMs.length - 1);
  const baseDelayMs = delaysMs[delayIndex] ?? 0;
  const jitterMultiplier = 1 + (randomUnit * 2 - 1) * jitterRatio;
  const delayMs = Math.max(0, Math.round(baseDelayMs * jitterMultiplier));

  return {
    action: "retry",
    delayMs,
    nextAttemptAt: new Date(nowMs + delayMs).toISOString(),
  };
}
