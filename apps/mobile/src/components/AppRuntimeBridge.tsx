import { focusManager, onlineManager } from "@tanstack/react-query";
import { theme } from "@shipshape/ui-mobile";
import * as Network from "expo-network";
import { usePathname } from "expo-router";
import { useEffect, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../features/auth/AuthProvider";
import { captureAppError, identifyTelemetryUser, trackScreen } from "../lib/telemetry";

function hasConnection(state: Network.NetworkState) {
  return Boolean(state.isConnected && state.isInternetReachable !== false);
}

export function AppRuntimeBridge() {
  const { profile } = useAuth();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const applyNetworkState = (state: Network.NetworkState) => {
      const isOnline = hasConnection(state);
      onlineManager.setOnline(isOnline);
      setIsOffline(!isOnline);
    };

    void Network.getNetworkStateAsync().then(applyNetworkState).catch((error) => captureAppError(error, "network-state"));
    const subscription = Network.addNetworkStateListener(applyNetworkState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    focusManager.setFocused(AppState.currentState === "active");
    const subscription = AppState.addEventListener("change", (state) => focusManager.setFocused(state === "active"));
    return () => subscription.remove();
  }, []);

  useEffect(() => identifyTelemetryUser(profile?.id ?? null), [profile?.id]);
  useEffect(() => trackScreen(pathname), [pathname]);

  if (!isOffline) return null;
  return (
    <View pointerEvents="none" accessibilityLiveRegion="polite" style={[styles.banner, { top: insets.top + 6 }]}>
      <Text style={styles.title}>You&apos;re offline</Text>
      <Text style={styles.body}>Loaded screens still work. Reconnect to save or refresh.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { position: "absolute", right: 16, left: 16, zIndex: 1000, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 17, borderWidth: 1, borderColor: theme.colors.accent, backgroundColor: theme.colors.text, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
  title: { color: "#FFFFFF", fontFamily: theme.type.body, fontWeight: "900", fontSize: 12 },
  body: { marginTop: 1, color: theme.colors.border, fontFamily: theme.type.body, fontSize: 10, lineHeight: 14 },
});
