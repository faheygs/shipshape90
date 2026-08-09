import type { TaskCatalogItem } from "@shipshape/api";
import type { CreateChallengeInput } from "../challenges/challengeRepository";

export const stepLabels = ["Basics", "Stakes", "Check-ins", "Tasks", "Rules"] as const;
export const visibilityOptions = ["public", "private"] as const;

export type Visibility = (typeof visibilityOptions)[number];
export type RewardType = "bragging" | "prize";
export type BonusCalculation = "percentage" | "total_change";
export type OpenDate = "start" | "end" | null;
export type CheckpointPreset = "simple" | "halfway" | "milestones" | "custom";

export interface CheckpointDraft {
  id: string;
  kind: "start" | "milestone" | "final";
  label: string;
  dayNumber: string;
  requiresWeight: boolean;
  requiresBodyFat: boolean;
  requiresPhoto: boolean;
}

export interface TaskConfiguration {
  instructions: string;
  targetValue: string;
  unit: string;
}

export interface ChallengeDraftSnapshot {
  name: string;
  description: string;
  visibility: Visibility;
  startsOn: string;
  endsOn: string;
  rewardType: RewardType;
  weightBonusCalculation: BonusCalculation | null;
  bodyFatBonusCalculation: BonusCalculation | null;
  checkpoints: CheckpointDraft[];
  selectedIds: string[];
  taskConfig: Record<string, TaskConfiguration>;
}

export const dateValue = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

export const dateFromValue = (value: string) => new Date(`${value}T12:00:00`);
export const isMeasurableTask = (task: TaskCatalogItem) => ["count", "quantity", "duration"].includes(task.taskType);
export const challengeDays = (start: string, end: string) => Math.max(2, Math.round((dateFromValue(end).getTime() - dateFromValue(start).getTime()) / 86_400_000) + 1);

export const checkpointDraft = (id: string, kind: CheckpointDraft["kind"], label: string, dayNumber: number): CheckpointDraft => ({
  id,
  kind,
  label,
  dayNumber: String(dayNumber),
  requiresWeight: true,
  requiresBodyFat: kind !== "milestone",
  requiresPhoto: kind !== "milestone",
});

export function checkpointsForPreset(preset: CheckpointPreset, durationDays: number): CheckpointDraft[] {
  const start = checkpointDraft("start", "start", "Start", 1);
  const final = checkpointDraft("final", "final", "Final", durationDays);
  if (durationDays <= 2) return [start, final];
  const halfway = Math.max(2, Math.min(durationDays - 1, Math.round((durationDays + 1) / 2)));
  const firstThird = Math.max(2, Math.round(durationDays / 3));
  const secondThird = Math.min(durationDays - 1, Math.round(durationDays * 2 / 3));
  if (preset === "simple" || preset === "custom") return [start, final];
  if (preset === "halfway") return [start, checkpointDraft("milestone-1", "milestone", "Halfway", halfway), final];
  if (firstThird === secondThird) return [start, checkpointDraft("milestone-1", "milestone", "Halfway", firstThird), final];
  return [start, checkpointDraft("milestone-1", "milestone", "First milestone", firstThird), checkpointDraft("milestone-2", "milestone", "Second milestone", secondThird), final];
}

export function checkpointsAreValid(draft: ChallengeDraftSnapshot, durationDays: number): boolean {
  const { checkpoints, weightBonusCalculation, bodyFatBonusCalculation } = draft;
  return checkpoints.length >= 2 && checkpoints.length <= 5
    && checkpoints.filter((checkpoint) => checkpoint.kind === "start").length === 1
    && checkpoints.filter((checkpoint) => checkpoint.kind === "final").length === 1
    && new Set(checkpoints.map((checkpoint) => Number(checkpoint.dayNumber))).size === checkpoints.length
    && checkpoints.every((checkpoint) => {
      const day = Number(checkpoint.dayNumber);
      const forcedWeight = checkpoint.kind !== "milestone" && weightBonusCalculation !== null;
      const forcedBodyFat = checkpoint.kind !== "milestone" && bodyFatBonusCalculation !== null;
      return Number.isInteger(day) && day >= 1 && day <= durationDays
        && (checkpoint.kind !== "milestone" || (day > 1 && day < durationDays))
        && (checkpoint.requiresPhoto || checkpoint.requiresWeight || checkpoint.requiresBodyFat || forcedWeight || forcedBodyFat);
    });
}

export function tasksAreValid(draft: ChallengeDraftSnapshot, catalog: TaskCatalogItem[]): boolean {
  return draft.selectedIds.every((id) => {
    const task = catalog.find((item) => item.id === id);
    const config = draft.taskConfig[id];
    if (!task || !config) return false;
    return !isMeasurableTask(task) || (Number(config.targetValue) > 0 && Boolean(config.unit));
  });
}

export function buildCreateChallengeInput(draft: ChallengeDraftSnapshot, allowAutoSwitch: boolean, replaceExistingQueue: boolean): CreateChallengeInput {
  return {
    name: draft.name,
    description: draft.description,
    visibility: draft.visibility,
    joinPolicy: draft.visibility === "private" ? "approval" : "open",
    startsOn: draft.startsOn,
    endsOn: draft.endsOn,
    reward: draft.rewardType === "bragging" ? "Bragging rights" : "Prize",
    weightBonusCalculation: draft.weightBonusCalculation,
    bodyFatBonusCalculation: draft.bodyFatBonusCalculation,
    checkpoints: draft.checkpoints.map((checkpoint) => ({
      kind: checkpoint.kind,
      label: checkpoint.label.trim(),
      dayNumber: Number(checkpoint.dayNumber),
      requiresWeight: checkpoint.kind === "milestone" ? checkpoint.requiresWeight : true,
      requiresBodyFat: checkpoint.kind === "milestone" ? checkpoint.requiresBodyFat : true,
      requiresPhoto: checkpoint.kind === "milestone" ? checkpoint.requiresPhoto : true,
    })).sort((left, right) => left.dayNumber - right.dayNumber),
    tasks: draft.selectedIds.map((catalogTaskId) => ({
      catalogTaskId,
      instructions: draft.taskConfig[catalogTaskId]?.instructions.trim() ?? "",
      targetValue: draft.taskConfig[catalogTaskId]?.targetValue ? Number(draft.taskConfig[catalogTaskId].targetValue) : null,
      unit: draft.taskConfig[catalogTaskId]?.unit || null,
    })),
    allowAutoSwitch,
    replaceExistingQueue,
  };
}
