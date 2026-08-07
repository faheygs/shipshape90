import { z } from "zod";

export type {
  CompositeTypes,
  Database,
  Enums,
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
} from "./database.types";

export const challengeSummarySchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(2),
  name: z.string().min(2).max(80),
  visibility: z.enum(["public", "unlisted", "private"]),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  participantCount: z.number().int().nonnegative(),
  membershipStatus: z.enum(["none", "pending", "active", "withdrawn", "removed", "disqualified", "completed"]),
});

export const completeTaskCommandSchema = z.object({
  occurrenceId: z.string().uuid(),
  idempotencyKey: z.string().min(16).max(128),
  completedAt: z.iso.datetime(),
  value: z.number().nonnegative().optional(),
  evidenceId: z.string().uuid().optional(),
});

export const leaderboardEntrySchema = z.object({
  rank: z.number().int().positive(),
  memberId: z.string().uuid(),
  displayName: z.string(),
  avatarUrl: z.url().nullable(),
  totalPoints: z.number().int(),
  completionPercentage: z.number().min(0).max(100),
  perfectDays: z.number().int().nonnegative(),
  rankMovement: z.number().int(),
});

export const leaveChallengeCommandSchema = z.object({
  challengeId: z.string().uuid(),
  acknowledgePrizeForfeiture: z.literal(true),
});

export const joinChallengeCommandSchema = z.object({
  challengeId: z.string().uuid(),
  inviteCode: z.string().trim().min(6).max(12).optional(),
});

export const taskCatalogItemSchema = z.object({
  id: z.string().uuid(),
  category: z.enum(["fitness", "nutrition", "hydration", "recovery", "mindset", "habits", "outdoor", "team"]),
  title: z.string().min(2).max(100),
  description: z.string(),
  taskType: z.enum(["boolean", "count", "quantity", "duration", "evidence", "checkpoint"]),
  defaultTargetValue: z.number().nullable(),
  defaultUnit: z.string().nullable(),
  allowedUnits: z.array(z.string()),
  defaultProofPolicy: z.enum(["none", "optional", "required"]),
  safetyNote: z.string().nullable(),
});

export const activityEntrySchema = z.object({
  id: z.string().uuid(),
  challengeId: z.string().uuid().nullable(),
  actorProfileId: z.string().uuid(),
  actorName: z.string(),
  actorHandle: z.string(),
  actorAvatarPath: z.string().nullable(),
  eventType: z.enum(["member_joined", "task_completed", "perfect_day", "streak", "rank_change", "announcement", "post"]),
  body: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
});

export type ChallengeSummary = z.infer<typeof challengeSummarySchema>;
export type CompleteTaskCommand = z.infer<typeof completeTaskCommandSchema>;
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;
export type LeaveChallengeCommand = z.infer<typeof leaveChallengeCommandSchema>;
export type JoinChallengeCommand = z.infer<typeof joinChallengeCommandSchema>;
export type TaskCatalogItem = z.infer<typeof taskCatalogItemSchema>;
export type ActivityEntry = z.infer<typeof activityEntrySchema>;

export interface ShipShapeApi {
  listChallenges(): Promise<ChallengeSummary[]>;
  completeTask(command: CompleteTaskCommand): Promise<void>;
  leaveChallenge(command: LeaveChallengeCommand): Promise<void>;
  joinChallenge(command: JoinChallengeCommand): Promise<void>;
  listTaskCatalog(): Promise<TaskCatalogItem[]>;
  listCommunityActivity(): Promise<ActivityEntry[]>;
  getLeaderboard(challengeId: string): Promise<LeaderboardEntry[]>;
}
