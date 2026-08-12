export const challengeActivityEventTypes = [
  "day_submitted",
  "checkin_completed",
  "streak",
  "member_joined",
  "announcement",
] as const;

export function isChallengeActivityEventType(eventType: string): boolean {
  return (challengeActivityEventTypes as readonly string[]).includes(eventType);
}
