import { supabase } from "../../lib/supabase";

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  challengeId: string | null;
  actionPath: string | null;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

const requireDatabase = () => {
  if (!supabase) throw new Error("Notifications are unavailable in preview mode.");
  return supabase;
};

export async function listMyNotifications(): Promise<AppNotification[]> {
  const { data, error } = await requireDatabase().rpc("list_my_notifications", { page_size: 75 });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    type: row.notification_type,
    title: row.title,
    body: row.body,
    challengeId: row.challenge_id,
    actionPath: row.action_path,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));
}

export async function getUnreadNotificationCount(): Promise<number> {
  const { data, error } = await requireDatabase().rpc("get_my_notification_unread_count");
  if (error) throw error;
  return data ?? 0;
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await requireDatabase().rpc("mark_notification_read", { target_notification_id: notificationId });
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await requireDatabase().rpc("mark_all_notifications_read");
  if (error) throw error;
}

export async function deleteNotification(notificationId: string): Promise<void> {
  const { data, error } = await requireDatabase().rpc("delete_my_notification", { target_notification_id: notificationId });
  if (error) throw error;
  if (!data) throw new Error("That notification could not be cleared.");
}

export async function clearNotifications(): Promise<void> {
  const { error } = await requireDatabase().rpc("clear_my_notifications");
  if (error) throw error;
}

export async function savePushDevice(token: string, platform: "ios" | "android"): Promise<void> {
  const { error } = await requireDatabase().rpc("register_push_device", { submitted_token: token, submitted_platform: platform });
  if (error) throw error;
}

export async function removePushDevice(token: string): Promise<void> {
  const { error } = await requireDatabase().rpc("disable_push_device", { submitted_token: token });
  if (error) throw error;
}

export async function hasEnabledPushDevice(): Promise<boolean> {
  const { data, error } = await requireDatabase().rpc("has_enabled_push_device");
  if (error) throw error;
  return Boolean(data);
}

export async function disableAllPushDevices(): Promise<void> {
  const { error } = await requireDatabase().rpc("disable_all_push_devices");
  if (error) throw error;
}
