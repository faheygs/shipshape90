import { describe, expect, it } from "vitest";
import { isChallengeActivityEventType } from "./activityFeedPolicy";

describe("challenge activity feed policy", () => {
  it("includes challenge-level actions", () => {
    expect(isChallengeActivityEventType("day_submitted")).toBe(true);
    expect(isChallengeActivityEventType("checkin_completed")).toBe(true);
    expect(isChallengeActivityEventType("member_joined")).toBe(true);
    expect(isChallengeActivityEventType("streak")).toBe(true);
  });

  it("excludes noisy or redundant events", () => {
    expect(isChallengeActivityEventType("task_completed")).toBe(false);
    expect(isChallengeActivityEventType("perfect_day")).toBe(false);
    expect(isChallengeActivityEventType("rank_change")).toBe(false);
  });
});
