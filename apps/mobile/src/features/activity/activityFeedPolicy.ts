export const challengeActivityEventTypes = [
  "day_submitted",
  "perfect_day",
  "streak",
  "rank_change",
  "member_joined",
  "announcement",
] as const;

export function isChallengeActivityEventType(eventType: string): boolean {
  return (challengeActivityEventTypes as readonly string[]).includes(eventType);
}
