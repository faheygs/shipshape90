export function dateInTimeZone(instant: Date | string, timeZone: string): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) throw new Error("Invalid scoring instant");

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function firstMemberScoringDate(input: {
  challengeStartsOn: string;
  joinedAt: Date | string;
  scoringTimeZone: string;
}): string {
  const joinedDate = dateInTimeZone(input.joinedAt, input.scoringTimeZone);
  return joinedDate > input.challengeStartsOn ? joinedDate : input.challengeStartsOn;
}

export function isMemberScoringDate(input: {
  challengeStartsOn: string;
  challengeEndsOn: string;
  joinedAt: Date | string;
  scoringTimeZone: string;
  localDate: string;
}): boolean {
  const firstDate = firstMemberScoringDate(input);
  return input.localDate >= firstDate && input.localDate <= input.challengeEndsOn;
}
