import { describe, expect, it } from "vitest";

import { decideIntegrationRetry } from "./backoff.ts";

describe("decideIntegrationRetry", () => {
  it("uses the configured delay without jitter at the midpoint", () => {
    const result = decideIntegrationRetry({
      attemptCount: 2,
      maxAttempts: 6,
      retryable: true,
      nowMs: Date.parse("2026-08-14T00:00:00.000Z"),
      randomUnit: 0.5,
    });

    expect(result).toEqual({
      action: "retry",
      delayMs: 30_000,
      nextAttemptAt: "2026-08-14T00:00:30.000Z",
    });
  });

  it("adds bounded jitter", () => {
    const earliest = decideIntegrationRetry({
      attemptCount: 1,
      maxAttempts: 6,
      retryable: true,
      nowMs: 0,
      randomUnit: 0,
    });
    const latest = decideIntegrationRetry({
      attemptCount: 1,
      maxAttempts: 6,
      retryable: true,
      nowMs: 0,
      randomUnit: 1,
    });

    expect(earliest.action === "retry" && earliest.delayMs).toBe(4_000);
    expect(latest.action === "retry" && latest.delayMs).toBe(6_000);
  });

  it("routes permanent failures to manual action", () => {
    expect(
      decideIntegrationRetry({
        attemptCount: 1,
        maxAttempts: 6,
        retryable: false,
        nowMs: 0,
      }),
    ).toEqual({ action: "manual_action_required", reason: "not_retryable" });
  });

  it("dead-letters a job after its final attempt", () => {
    expect(
      decideIntegrationRetry({
        attemptCount: 6,
        maxAttempts: 6,
        retryable: true,
        nowMs: 0,
      }),
    ).toEqual({ action: "dead_letter", reason: "attempts_exhausted" });
  });
});
