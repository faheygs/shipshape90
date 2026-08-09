import { describe, expect, it } from "vitest";
import { realtimeInvalidationTargets } from "./realtimeInvalidation";

describe("realtimeInvalidationTargets", () => {
  it("keeps score events away from management and checkpoint queries", () => {
    expect(realtimeInvalidationTargets("score.day_submitted")).toMatchObject({ activity: true, challenge: false, management: false, progress: false, score: true, history: true });
  });

  it("refreshes gated progress and scoring after a check-in", () => {
    expect(realtimeInvalidationTargets("progress.checkpoint_completed")).toMatchObject({ progress: true, score: true, history: true, management: false });
  });

  it("refreshes roster and rankings after membership changes", () => {
    expect(realtimeInvalidationTargets("member.joined")).toMatchObject({ challenge: true, management: true, score: true, progress: false });
  });

  it("falls back safely for new event types", () => {
    expect(realtimeInvalidationTargets("future.event")).toEqual({ activity: true, challenge: true, history: true, management: true, progress: true, score: true });
  });
});
