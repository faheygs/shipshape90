import type { IsoDate, TaskDefinition, TaskOccurrence, TaskSchedule } from "./types";

const DAY_MS = 86_400_000;

function parseDate(date: IsoDate): Date {
  return new Date(`${date}T12:00:00.000Z`);
}

export function isScheduledOn(schedule: TaskSchedule, date: IsoDate): boolean {
  if (schedule.kind === "daily") return true;
  if (schedule.kind === "once") return schedule.date === date;
  if (schedule.kind === "weekdays") return schedule.weekdays.includes(parseDate(date).getUTCDay());
  return true;
}

export function enumerateDates(start: IsoDate, end: IsoDate): IsoDate[] {
  const dates: IsoDate[] = [];
  for (let cursor = parseDate(start).getTime(), last = parseDate(end).getTime(); cursor <= last; cursor += DAY_MS) {
    dates.push(new Date(cursor).toISOString().slice(0, 10) as IsoDate);
  }
  return dates;
}

export function materializeOccurrences(
  tasks: readonly TaskDefinition[],
  start: IsoDate,
  end: IsoDate,
): TaskOccurrence[] {
  return enumerateDates(start, end).flatMap((date) =>
    tasks
      .filter((task) => isScheduledOn(task.schedule, date))
      .map((task) => ({
        id: `${task.id}:${date}`,
        taskId: task.id,
        date,
        status: "pending" as const,
      })),
  );
}
