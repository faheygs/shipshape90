export type IsoDate = `${number}-${number}-${number}`;

export type TaskSchedule =
  | { kind: "daily" }
  | { kind: "weekdays"; weekdays: readonly number[] }
  | { kind: "weekly-count"; count: number }
  | { kind: "once"; date: IsoDate };

export type ProofPolicy = "none" | "optional" | "required";

export interface TaskDefinition {
  id: string;
  title: string;
  points: number;
  required: boolean;
  schedule: TaskSchedule;
  proofPolicy: ProofPolicy;
}

export type OccurrenceStatus = "pending" | "complete" | "missed" | "excused";

export interface TaskOccurrence {
  id: string;
  taskId: string;
  date: IsoDate;
  status: OccurrenceStatus;
  completedAt?: string;
  evidenceId?: string;
}

export interface ScoreRuleSet {
  perfectDayBonus: number;
  missedRequiredPenalty: number;
  streakBonus?: { everyDays: number; points: number };
}

export type LedgerEntryType =
  | "task_complete"
  | "perfect_day"
  | "streak_bonus"
  | "missed_penalty"
  | "manual_adjustment";

export interface LedgerEntry {
  id: string;
  challengeId: string;
  memberId: string;
  occurrenceId?: string;
  type: LedgerEntryType;
  points: number;
  effectiveDate: IsoDate;
  idempotencyKey: string;
  metadata: Readonly<Record<string, string | number | boolean>>;
}

export interface ParticipantMetrics {
  memberId: string;
  totalPoints: number;
  completionPercentage: number;
  perfectDays: number;
  reachedTargetAt?: string;
}

export type WinnerMetric =
  | "totalPoints"
  | "completionPercentage"
  | "perfectDays"
  | "reachedTargetAt";

export interface WinnerRule {
  primary: WinnerMetric;
  tieBreakers: readonly WinnerMetric[];
  direction?: "highest" | "lowest";
}
