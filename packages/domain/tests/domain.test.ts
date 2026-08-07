import { describe, expect, it } from "vitest";
import { buildDayLedger, canJoinChallenge, dateInTimeZone, firstMemberScoringDate, getShipShapePointRules, isMemberScoringDate, materializeOccurrences, rankParticipants, sumLedger, withdrawMembership } from "../src";
import type { TaskDefinition } from "../src";

const tasks: TaskDefinition[] = [
  { id: "water", title: "Drink 100 oz water", points: 1, required: true, schedule: { kind: "daily" }, proofPolicy: "optional" },
  { id: "workout", title: "Complete workout", points: 1, required: true, schedule: { kind: "weekdays", weekdays: [1, 2, 3, 4, 5] }, proofPolicy: "required" },
];

describe("schedule materialization", () => {
  it("honors selected weekdays", () => {
    const occurrences = materializeOccurrences(tasks, "2026-08-07", "2026-08-09");
    expect(occurrences.filter((item) => item.taskId === "water")).toHaveLength(3);
    expect(occurrences.filter((item) => item.taskId === "workout")).toHaveLength(1);
  });
});

describe("ledger scoring", () => {
  it("awards task, perfect-day, and streak bonuses once", () => {
    const occurrences = materializeOccurrences(tasks, "2026-08-07", "2026-08-07").map((item) => ({ ...item, status: "complete" as const }));
    const first = buildDayLedger({ challengeId: "c1", memberId: "m1", date: "2026-08-07", tasks, occurrences, currentPerfectDayStreak: 6, rules: { perfectDayBonus: 3, missedRequiredPenalty: 1, streakBonus: { everyDays: 7, points: 5 } } });
    const second = buildDayLedger({ challengeId: "c1", memberId: "m1", date: "2026-08-07", tasks, occurrences, existingEntries: first, currentPerfectDayStreak: 6, rules: { perfectDayBonus: 3, missedRequiredPenalty: 1, streakBonus: { everyDays: 7, points: 5 } } });
    expect(sumLedger(first)).toBe(10);
    expect(second).toEqual([]);
  });

  it("deducts three points for every missed required task", () => {
    const occurrences = materializeOccurrences(tasks, "2026-08-07", "2026-08-07").map((item) => ({ ...item, status: "missed" as const }));
    const ledger = buildDayLedger({ challengeId: "c1", memberId: "m1", date: "2026-08-07", tasks, occurrences, rules: { perfectDayBonus: 3, missedRequiredPenalty: 3, streakBonus: { everyDays: 7, points: 5 } } });
    expect(sumLedger(ledger)).toBe(-6);
  });
});

describe("dynamic ShipShape point rules", () => {
  it("preserves the seven-task reference and scales smaller and larger challenges", () => {
    expect(getShipShapePointRules(3)).toMatchObject({ perfectDayBonus: 1, sevenDayStreakBonus: 2, perfectDayTotal: 4, allMissedTotal: -9 });
    expect(getShipShapePointRules(7)).toMatchObject({ perfectDayBonus: 3, sevenDayStreakBonus: 5, perfectDayTotal: 10, allMissedTotal: -21 });
    expect(getShipShapePointRules(12)).toMatchObject({ perfectDayBonus: 5, sevenDayStreakBonus: 9, perfectDayTotal: 17, allMissedTotal: -36 });
  });
});

describe("winner ranking", () => {
  it("uses deterministic ordered tie-breakers", () => {
    const ranked = rankParticipants([
      { memberId: "b", totalPoints: 100, completionPercentage: 90, perfectDays: 20 },
      { memberId: "a", totalPoints: 100, completionPercentage: 92, perfectDays: 18 },
    ], { primary: "totalPoints", tieBreakers: ["completionPercentage"] });
    expect(ranked.map((item) => item.memberId)).toEqual(["a", "b"]);
  });
});

describe("exclusive challenge membership", () => {
  it("blocks another challenge while a membership is pending or active", () => {
    expect(canJoinChallenge([
      { challengeId: "current", status: "active", prizeEligible: true },
    ], "next")).toEqual({ allowed: false, reason: "active_challenge" });
  });

  it("allows a different challenge after withdrawal but never the same challenge", () => {
    const withdrawn = withdrawMembership({
      challengeId: "current",
      status: "active",
      prizeEligible: true,
    });

    expect(withdrawn).toEqual({
      challengeId: "current",
      status: "withdrawn",
      prizeEligible: false,
    });
    expect(canJoinChallenge([withdrawn], "current")).toEqual({
      allowed: false,
      reason: "cannot_rejoin",
    });
    expect(canJoinChallenge([withdrawn], "next")).toEqual({ allowed: true });
  });
});

describe("member-local scoring time", () => {
  it("gives Utah and India independent calendar days at the same instant", () => {
    const instant = "2026-08-07T01:00:00.000Z";
    expect(dateInTimeZone(instant, "America/Denver")).toBe("2026-08-06");
    expect(dateInTimeZone(instant, "Asia/Kolkata")).toBe("2026-08-07");
  });

  it("starts a late member on their join date without creating prior days", () => {
    const input = {
      challengeStartsOn: "2026-08-01",
      challengeEndsOn: "2026-10-29",
      joinedAt: "2026-08-20T17:30:00.000Z",
      scoringTimeZone: "Asia/Kolkata",
    };
    expect(firstMemberScoringDate(input)).toBe("2026-08-20");
    expect(isMemberScoringDate({ ...input, localDate: "2026-08-19" })).toBe(false);
    expect(isMemberScoringDate({ ...input, localDate: "2026-08-20" })).toBe(true);
  });

  it("fully scores the local join day even when little time remains", () => {
    const input = {
      challengeStartsOn: "2026-08-01",
      challengeEndsOn: "2026-10-29",
      joinedAt: "2026-08-21T05:59:00.000Z",
      scoringTimeZone: "America/Denver",
    };
    expect(firstMemberScoringDate(input)).toBe("2026-08-20");
    expect(isMemberScoringDate({ ...input, localDate: "2026-08-20" })).toBe(true);
  });
});
