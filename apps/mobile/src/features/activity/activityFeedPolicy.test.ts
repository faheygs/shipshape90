import { describe, expect, it } from "vitest";
import { isChallengeActivityEventType } from "./activityFeedPolicy";

describe("challenge activity feed policy", () => {
  it("includes challenge-level actions", () => {
    expect(isChallengeActivityEventType("day_submitted")).toBe(true);
    expect(isChallengeActivityEventType("perfect_day")).toBe(true);
    expect(isChallengeActivityEventType("member_joined")).toBe(true);
  });

  it("excludes individual task completions", () => {
    expect(isChallengeActivityEventType("task_completed")).toBe(false);
  });
});
