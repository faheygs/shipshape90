import type { IsoDate, LedgerEntry, ScoreRuleSet, TaskDefinition, TaskOccurrence } from "./types";

interface DayLedgerInput {
  challengeId: string;
  memberId: string;
  date: IsoDate;
  rules: ScoreRuleSet;
  tasks: readonly TaskDefinition[];
  occurrences: readonly TaskOccurrence[];
  existingEntries?: readonly LedgerEntry[];
  currentPerfectDayStreak?: number;
}

function entryId(key: string): string {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return `ledger_${(hash >>> 0).toString(16)}`;
}

export function buildDayLedger(input: DayLedgerInput): LedgerEntry[] {
  const taskById = new Map(input.tasks.map((task) => [task.id, task]));
  const existing = new Set((input.existingEntries ?? []).map((entry) => entry.idempotencyKey));
  const entries: LedgerEntry[] = [];

  const add = (entry: Omit<LedgerEntry, "id">) => {
    if (existing.has(entry.idempotencyKey)) return;
    existing.add(entry.idempotencyKey);
    entries.push({ ...entry, id: entryId(entry.idempotencyKey) });
  };

  for (const occurrence of input.occurrences) {
    const task = taskById.get(occurrence.taskId);
    if (!task) continue;
    if (occurrence.status === "complete") {
      add({
        challengeId: input.challengeId,
        memberId: input.memberId,
        occurrenceId: occurrence.id,
        type: "task_complete",
        points: task.points,
        effectiveDate: input.date,
        idempotencyKey: `task:${input.memberId}:${occurrence.id}`,
        metadata: { taskId: task.id },
      });
    }
    if (occurrence.status === "missed" && task.required && input.rules.missedRequiredPenalty !== 0) {
      add({
        challengeId: input.challengeId,
        memberId: input.memberId,
        occurrenceId: occurrence.id,
        type: "missed_penalty",
        points: -Math.abs(input.rules.missedRequiredPenalty),
        effectiveDate: input.date,
        idempotencyKey: `missed:${input.memberId}:${occurrence.id}`,
        metadata: { taskId: task.id },
      });
    }
  }

  const required = input.occurrences.filter((occurrence) => taskById.get(occurrence.taskId)?.required);
  const perfect = required.length > 0 && required.every((occurrence) => occurrence.status === "complete");
  if (perfect && input.rules.perfectDayBonus !== 0) {
    add({
      challengeId: input.challengeId,
      memberId: input.memberId,
      type: "perfect_day",
      points: input.rules.perfectDayBonus,
      effectiveDate: input.date,
      idempotencyKey: `perfect:${input.memberId}:${input.date}`,
      metadata: { completedRequiredTasks: required.length },
    });

    const streak = (input.currentPerfectDayStreak ?? 0) + 1;
    const bonus = input.rules.streakBonus;
    if (bonus && streak % bonus.everyDays === 0) {
      add({
        challengeId: input.challengeId,
        memberId: input.memberId,
        type: "streak_bonus",
        points: bonus.points,
        effectiveDate: input.date,
        idempotencyKey: `streak:${input.memberId}:${input.date}:${streak}`,
        metadata: { streak },
      });
    }
  }

  return entries;
}

export function sumLedger(entries: readonly LedgerEntry[]): number {
  return entries.reduce((total, entry) => total + entry.points, 0);
}
