import type { TaskCatalogItem } from "@shipshape/api";
import { useMemo, useState } from "react";
import { useTaskCatalog } from "../catalog/useTaskCatalog";
import {
  challengeDays,
  checkpointDraft,
  checkpointsAreValid,
  checkpointsForPreset,
  dateFromValue,
  dateValue,
  tasksAreValid,
  type BonusCalculation,
  type ChallengeDraftSnapshot,
  type CheckpointDraft,
  type CheckpointPreset,
  type OpenDate,
  type RewardType,
  type TaskConfiguration,
  type Visibility,
} from "./challengeCreationModel";

export function useChallengeBuilder() {
  const catalog = useTaskCatalog();
  const defaults = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + 89);
    return { startsOn: dateValue(today), endsOn: dateValue(end), today };
  }, []);
  const [step, setStep] = useState(0);
  const [openDate, setOpenDate] = useState<OpenDate>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [startsOn, setStartsOn] = useState(defaults.startsOn);
  const [endsOn, setEndsOn] = useState(defaults.endsOn);
  const [rewardType, setRewardType] = useState<RewardType>("bragging");
  const [weightBonusCalculation, setWeightBonusCalculation] = useState<BonusCalculation | null>(null);
  const [bodyFatBonusCalculation, setBodyFatBonusCalculation] = useState<BonusCalculation | null>(null);
  const [checkpointPreset, setCheckpointPreset] = useState<CheckpointPreset>("milestones");
  const [checkpoints, setCheckpoints] = useState<CheckpointDraft[]>(() => checkpointsForPreset("milestones", 90));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [taskConfig, setTaskConfig] = useState<Record<string, TaskConfiguration>>({});
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const durationDays = challengeDays(startsOn, endsOn);
  const endMinimumDate = dateFromValue(startsOn);
  endMinimumDate.setDate(endMinimumDate.getDate() + 1);

  const draft: ChallengeDraftSnapshot = {
    name, description, visibility, startsOn, endsOn, rewardType,
    weightBonusCalculation, bodyFatBonusCalculation, checkpoints, selectedIds, taskConfig,
  };
  const stepValid = [
    name.trim().length >= 2,
    endsOn > startsOn && endsOn >= defaults.startsOn,
    checkpointsAreValid(draft, durationDays),
    selectedIds.length > 0,
    tasksAreValid(draft, catalog.data ?? []),
  ][step];
  const activeTaskId = selectedIds.includes(editingTaskId ?? "") ? editingTaskId : selectedIds[0] ?? null;
  const activeTask = catalog.data?.find((task) => task.id === activeTaskId);
  const activeConfig = activeTaskId ? taskConfig[activeTaskId] : undefined;

  const applyCheckpointPreset = (preset: CheckpointPreset) => {
    setCheckpointPreset(preset);
    setCheckpoints(checkpointsForPreset(preset, durationDays));
    setError(null);
  };
  const updateCheckpoint = (id: string, update: Partial<CheckpointDraft>) => {
    setCheckpoints((current) => current.map((checkpoint) => checkpoint.id === id ? { ...checkpoint, ...update } : checkpoint));
    setError(null);
  };
  const addCheckpoint = () => {
    const milestones = checkpoints.filter((checkpoint) => checkpoint.kind === "milestone");
    if (milestones.length >= 3 || durationDays <= 2) return;
    const candidate = Math.max(2, Math.min(durationDays - 1, Math.round(durationDays * (milestones.length + 1) / (milestones.length + 2))));
    setCheckpointPreset("custom");
    setCheckpoints((current) => [
      ...current.filter((item) => item.kind !== "final"),
      checkpointDraft(`milestone-${Date.now()}`, "milestone", `Milestone ${milestones.length + 1}`, candidate),
      current.find((item) => item.kind === "final")!,
    ]);
  };
  const removeCheckpoint = (id: string) => {
    setCheckpointPreset("custom");
    setCheckpoints((current) => current.filter((checkpoint) => checkpoint.id !== id));
  };
  const toggleTask = (task: TaskCatalogItem) => {
    setError(null);
    setSelectedIds((current) => {
      if (current.includes(task.id)) {
        const next = current.filter((id) => id !== task.id);
        if (editingTaskId === task.id) setEditingTaskId(next[0] ?? null);
        return next;
      }
      if (current.length >= 20) return current;
      setTaskConfig((config) => ({
        ...config,
        [task.id]: config[task.id] ?? {
          instructions: task.description,
          targetValue: task.defaultTargetValue?.toString() ?? "",
          unit: task.defaultUnit ?? task.allowedUnits[0] ?? "",
        },
      }));
      return [...current, task.id];
    });
  };
  const updateTask = (id: string, update: Partial<TaskConfiguration>) => {
    setTaskConfig((current) => ({ ...current, [id]: { ...current[id], ...update } }));
    setError(null);
  };
  const resizeCheckpoints = (nextDuration: number) => {
    setCheckpoints((current) => {
      if (checkpointPreset === "custom") return current.map((checkpoint) => checkpoint.kind === "final" ? { ...checkpoint, dayNumber: String(nextDuration) } : checkpoint);
      return checkpointsForPreset(checkpointPreset, nextDuration).map((checkpoint) => {
        const existing = current.find((item) => item.id === checkpoint.id);
        return existing ? { ...checkpoint, requiresWeight: existing.requiresWeight, requiresBodyFat: existing.requiresBodyFat, requiresPhoto: existing.requiresPhoto } : checkpoint;
      });
    });
  };
  const changeStartDate = (next: string) => {
    setStartsOn(next);
    const minimumEnd = dateFromValue(next);
    minimumEnd.setDate(minimumEnd.getDate() + 1);
    const nextEnd = endsOn <= next ? dateValue(minimumEnd) : endsOn;
    if (endsOn <= next) setEndsOn(nextEnd);
    const nextDuration = challengeDays(next, nextEnd);
    resizeCheckpoints(nextDuration);
  };
  const changeEndDate = (next: string) => {
    setEndsOn(next);
    const nextDuration = challengeDays(startsOn, next);
    resizeCheckpoints(nextDuration);
  };

  return {
    catalog, defaults, draft, step, setStep, openDate, setOpenDate, name, setName, description, setDescription,
    visibility, setVisibility, startsOn, endsOn, rewardType, setRewardType, weightBonusCalculation,
    setWeightBonusCalculation, bodyFatBonusCalculation, setBodyFatBonusCalculation, checkpointPreset,
    checkpoints, selectedIds, editingTaskId, setEditingTaskId, error, setError, durationDays, endMinimumDate,
    stepValid, activeTaskId, activeTask, activeConfig, applyCheckpointPreset, updateCheckpoint, addCheckpoint,
    removeCheckpoint, toggleTask, updateTask, changeStartDate, changeEndDate,
  };
}

export type ChallengeBuilder = ReturnType<typeof useChallengeBuilder>;
