import { BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue/400Regular";
import { DMSans_400Regular } from "@expo-google-fonts/dm-sans/400Regular";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { router, Stack, useRootNavigationState, useSegments, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { AppDialogProvider } from "@shipshape/ui-mobile";
import { AuthProvider, useAuth } from "../src/features/auth/AuthProvider";
import { Notifications, syncAppBadge, type NotificationResponse } from "../src/features/notifications/pushNotifications";
import { useUnreadNotificationCount } from "../src/features/notifications/useNotifications";

function NotificationBridge() {
  const { profile } = useAuth();
  const unread = useUnreadNotificationCount(Boolean(profile?.id));

  useEffect(() => { void syncAppBadge(profile?.id ? unread.data ?? 0 : 0).catch(() => undefined); }, [profile?.id, unread.data]);
  useEffect(() => {
    if (!Notifications) return;
    const openResponse = (response: NotificationResponse) => {
      const actionPath = response.notification.request.content.data?.actionPath;
      if (profile?.id && typeof actionPath === "string") router.push(actionPath as Href);
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(openResponse);
    void Notifications.getLastNotificationResponseAsync().then((response) => { if (response) openResponse(response); });
    return () => subscription.remove();
  }, [profile?.id]);

  return null;
}

function AuthGate() {
  const { isLoading, isPreview, profile, session } = useAuth();
  const navigationState = useRootNavigationState();
  const segments = useSegments();

  useEffect(() => {
    if (!navigationState?.key || isLoading || isPreview) return;
    const root = segments[0] as string | undefined;
    const isPublicRoute = root === "welcome" || root === "verify";
    const isProfileSetup = root === "profile-setup";
    const isIndex = root === undefined || root === "index";

    if (!session && !isPublicRoute) {
      router.replace("/welcome");
      return;
    }

    if (session && !profile && !isProfileSetup) {
      router.replace("/profile-setup");
      return;
    }

    if (session && profile && (isPublicRoute || isProfileSetup || isIndex)) {
      router.replace("/(tabs)/challenges");
    }
  }, [isLoading, isPreview, navigationState?.key, profile, segments, session]);

  return null;
}

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  }));
  const [loaded] = useFonts({ "DM Sans": DMSans_400Regular, "Bebas Neue": BebasNeue_400Regular });
  if (!loaded) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppDialogProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }} />
          <AuthGate />
          <NotificationBridge />
        </AppDialogProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
