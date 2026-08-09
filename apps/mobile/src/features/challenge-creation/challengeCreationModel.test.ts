import type { TaskCatalogItem } from "@shipshape/api";
import { describe, expect, it } from "vitest";
import { buildCreateChallengeInput, checkpointsAreValid, checkpointsForPreset, tasksAreValid, type ChallengeDraftSnapshot } from "./challengeCreationModel";

const task = (taskType: TaskCatalogItem["taskType"] = "count"): TaskCatalogItem => ({
  id: "00000000-0000-4000-8000-000000000001",
  category: "fitness",
  title: "Steps",
  description: "Walk every day",
  taskType,
  defaultTargetValue: 10_000,
  defaultUnit: "steps",
  allowedUnits: ["steps"],
  defaultProofPolicy: "none",
  safetyNote: null,
});

const draft = (): ChallengeDraftSnapshot => ({
  name: "90 Strong",
  description: "Build consistency",
  visibility: "public",
  startsOn: "2026-08-10",
  endsOn: "2026-11-07",
  rewardType: "bragging",
  weightBonusCalculation: null,
  bodyFatBonusCalculation: null,
  checkpoints: checkpointsForPreset("milestones", 90),
  selectedIds: [task().id],
  taskConfig: { [task().id]: { instructions: "Walk 10,000 steps", targetValue: "10000", unit: "steps" } },
});

describe("challenge creation model", () => {
  it("creates predictable preset schedules", () => {
    expect(checkpointsForPreset("simple", 30).map((item) => Number(item.dayNumber))).toEqual([1, 30]);
    expect(checkpointsForPreset("halfway", 30).map((item) => Number(item.dayNumber))).toEqual([1, 16, 30]);
    expect(checkpointsForPreset("milestones", 90).map((item) => Number(item.dayNumber))).toEqual([1, 30, 60, 90]);
  });

  it("keeps preset schedules valid for very short challenges", () => {
    expect(checkpointsForPreset("milestones", 2).map((item) => Number(item.dayNumber))).toEqual([1, 2]);
    expect(checkpointsForPreset("milestones", 3).map((item) => Number(item.dayNumber))).toEqual([1, 2, 3]);
  });

  it("rejects duplicate or empty checkpoints", () => {
    const valid = draft();
    expect(checkpointsAreValid(valid, 90)).toBe(true);
    valid.checkpoints[1].dayNumber = valid.checkpoints[2].dayNumber;
    expect(checkpointsAreValid(valid, 90)).toBe(false);
    valid.checkpoints[1].dayNumber = "30";
    valid.checkpoints[1].requiresWeight = false;
    valid.checkpoints[1].requiresBodyFat = false;
    valid.checkpoints[1].requiresPhoto = false;
    expect(checkpointsAreValid(valid, 90)).toBe(false);
  });

  it("requires a positive target for measurable tasks", () => {
    const value = draft();
    expect(tasksAreValid(value, [task()])).toBe(true);
    value.taskConfig[task().id].targetValue = "0";
    expect(tasksAreValid(value, [task()])).toBe(false);
    expect(tasksAreValid(value, [task("boolean")])).toBe(true);
  });

  it("forces complete start and final check-ins in the request", () => {
    const value = draft();
    value.visibility = "private";
    value.checkpoints[0].requiresPhoto = false;
    const input = buildCreateChallengeInput(value, true, true);
    expect(input.joinPolicy).toBe("approval");
    expect(input.checkpoints[0]).toMatchObject({ requiresWeight: true, requiresBodyFat: true, requiresPhoto: true });
    expect(input.allowAutoSwitch).toBe(true);
    expect(input.replaceExistingQueue).toBe(true);
  });
});
