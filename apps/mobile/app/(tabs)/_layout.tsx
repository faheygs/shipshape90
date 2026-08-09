import { Icon, theme, type IconName } from "@shipshape/ui-mobile";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs } from "expo-router";
import * as Haptics from "expo-haptics";
import { useEffect } from "react";
import { StyleSheet } from "react-native";
import { challengeKeys, useChallenges } from "../../src/features/challenges/useChallenges";
import { useAuth } from "../../src/features/auth/AuthProvider";
import { communityKeys } from "../../src/features/community/useCommunityActivity";
import { leaderboardKeys } from "../../src/features/leaderboard/useChallengeLeaderboard";
import { challengeHistoryKeys } from "../../src/features/history/useChallengeHistory";
import { managementKeys } from "../../src/features/management/useChallengeManagement";
import { notificationKeys, useUnreadNotificationCount } from "../../src/features/notifications/useNotifications";
import { closeRealtimeConnection, refreshRealtimeAuthorization, subscribeToChallenge, subscribeToUserNotifications } from "../../src/features/realtime/realtimeClient";
import { todayTaskKeys } from "../../src/features/tasks/useTodayTasks";

const icons: Record<string, IconName> = { home: "home", challenges: "challenges", create: "create", notifications: "bell", profile: "profile" };

export default function TabLayout() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const challenges = useChallenges();
  const unreadNotifications = useUnreadNotificationCount();
  const realtimeChallengeKey = Array.from(new Set((challenges.data ?? [])
    .filter((challenge) => challenge.membershipStatus === "active" || (challenge.isOwner && ["registration", "active", "review"].includes(challenge.challengeStatus)))
    .map((challenge) => challenge.id))).sort().join(",");

  useEffect(() => {
    if (!realtimeChallengeKey) return;
    let disposed = false;
    const unsubscribers: (() => void)[] = [];
    for (const challengeId of realtimeChallengeKey.split(",")) {
      void subscribeToChallenge(challengeId, () => {
        void queryClient.invalidateQueries({ queryKey: challengeKeys.all });
        void queryClient.invalidateQueries({ queryKey: challengeHistoryKeys.summary });
        void queryClient.invalidateQueries({ queryKey: communityKeys.all });
        void queryClient.invalidateQueries({ queryKey: communityKeys.challenge(challengeId) });
        void queryClient.invalidateQueries({ queryKey: managementKeys.all(challengeId) });
        void queryClient.invalidateQueries({ queryKey: leaderboardKeys.detail(challengeId) });
        void queryClient.invalidateQueries({ queryKey: todayTaskKeys.detail(challengeId) });
      }).then((cleanup) => {
        if (disposed) cleanup();
        else unsubscribers.push(cleanup);
      }).catch(() => undefined);
    }
    return () => {
      disposed = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [queryClient, realtimeChallengeKey]);

  useEffect(() => {
    if (!profile?.id) return;
    let unsubscribe: () => void = () => undefined;
    void subscribeToUserNotifications(profile.id, (event) => {
      if (event.type === "challenge.queue_joined") {
        void refreshRealtimeAuthorization().catch(() => closeRealtimeConnection());
      }
      void Haptics.notificationAsync(event.type.includes("declined") || event.type.includes("removed") || event.type.includes("failed") ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success);
      void queryClient.invalidateQueries({ queryKey: challengeKeys.all });
      void queryClient.invalidateQueries({ queryKey: challengeHistoryKeys.summary });
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      void queryClient.invalidateQueries({ queryKey: ["challenge-management"] });
    }).then((cleanup) => { unsubscribe = cleanup; });
    return () => unsubscribe();
  }, [profile?.id, queryClient]);

  return <Tabs screenOptions={({ route }) => ({ headerShown: false, tabBarHideOnKeyboard: true, tabBarActiveTintColor: theme.colors.brand, tabBarInactiveTintColor: theme.colors.textMuted, tabBarStyle: styles.bar, tabBarLabelStyle: styles.label, tabBarIcon: ({ color, focused }) => <Icon name={icons[route.name] ?? "home"} color={color} size={route.name === "create" ? 26 : 22} strokeWidth={focused ? 2.35 : 1.8} /> })}>
    <Tabs.Screen name="home" options={{ title: "Home" }} />
    <Tabs.Screen name="challenges" options={{ title: "Challenges" }} />
    <Tabs.Screen name="create" options={{ title: "Create" }} />
    <Tabs.Screen name="notifications" options={{ title: "Notifications", tabBarBadge: (unreadNotifications.data ?? 0) > 0 ? Math.min(unreadNotifications.data ?? 0, 99) : undefined, tabBarBadgeStyle: styles.badge }} />
    <Tabs.Screen name="profile" options={{ title: "Profile" }} />
  </Tabs>;
}

const styles = StyleSheet.create({ bar: { height: 82, paddingTop: 9, paddingBottom: 12, borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface }, label: { fontFamily: theme.type.body, fontWeight: "700", fontSize: 10 }, badge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: theme.colors.brandStrong, color: "#fff", fontFamily: theme.type.body, fontWeight: "900", fontSize: 8 } });
