import Constants from "expo-constants";
import type * as ExpoNotifications from "expo-notifications";
import { Platform } from "react-native";
import { disableAllPushDevices, hasEnabledPushDevice, savePushDevice } from "./notificationRepository";

declare const require: (moduleName: string) => typeof ExpoNotifications;

let Notifications: typeof ExpoNotifications | null = null;
try { Notifications = require("expo-notifications"); } catch { Notifications = null; }

Notifications?.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: true, shouldShowBanner: true, shouldShowList: true }),
});

export async function notificationsAreEnabled(): Promise<boolean> {
  if (!Notifications) return false;
  const permission = await Notifications.getPermissionsAsync();
  return permission.granted;
}

export async function pushNotificationsAreEnabled(): Promise<boolean> {
  return (await notificationsAreEnabled()) && await hasEnabledPushDevice();
}

export async function enablePushNotifications(): Promise<string> {
  if (!Notifications) throw new Error("Install the latest ShipShape 90 build to turn on device notifications.");
  if (Platform.OS !== "ios" && Platform.OS !== "android") throw new Error("Push notifications require a mobile device.");

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("challenge-updates", {
      name: "Challenge updates",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 120, 180],
      lightColor: "#BF4D22",
    });
  }

  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error("Notifications are turned off. You can enable them in your phone settings.");

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error("The notification project is not configured.");

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await savePushDevice(token, Platform.OS);
  return token;
}

export async function syncAppBadge(unreadCount: number): Promise<void> {
  if (!Notifications) return;
  await Notifications.setBadgeCountAsync(Math.max(0, unreadCount));
}

export async function disablePushNotifications(): Promise<void> {
  await disableAllPushDevices();
  await syncAppBadge(0);
}

export { Notifications };
export type { NotificationResponse } from "expo-notifications";
