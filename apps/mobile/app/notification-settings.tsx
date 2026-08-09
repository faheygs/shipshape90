import { BackButton, Button, Icon, theme } from "@shipshape/ui-mobile";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { disablePushNotifications, enablePushNotifications, pushNotificationsAreEnabled } from "../src/features/notifications/pushNotifications";

export default function NotificationSettingsScreen() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    void pushNotificationsAreEnabled().then(setEnabled).catch((caught) => setError(caught instanceof Error ? caught.message : "Notification settings couldn't be loaded.")).finally(() => setLoading(false));
  }, []);
  useFocusEffect(refresh);

  const change = async (next: boolean) => {
    setSaving(true);
    setError(null);
    try {
      if (next) await enablePushNotifications();
      else await disablePushNotifications();
      setEnabled(await pushNotificationsAreEnabled());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Notification settings couldn't be changed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <BackButton onPress={() => router.back()} />
        <View style={styles.heading}><Text style={styles.eyebrow}>NOTIFICATIONS</Text><Text style={styles.title}>Stay in the game.</Text><Text style={styles.subtitle}>Choose whether ShipShape can send challenge updates to this account.</Text></View>
        <View style={styles.card}>
          <View style={styles.icon}><Icon name="bell" color={theme.colors.brandStrong}/></View>
          <View style={styles.copy}><Text style={styles.cardTitle}>Push notifications</Text><Text style={styles.cardBody}>{enabled ? "Challenge updates are on." : "Challenge updates are paused."}</Text></View>
          {loading || saving ? <ActivityIndicator color={theme.colors.brandStrong}/> : <Switch accessibilityLabel="Push notifications" value={enabled} onValueChange={change} trackColor={{ false: theme.colors.borderStrong, true: theme.colors.brandSoft }} thumbColor={enabled ? theme.colors.brand : theme.colors.surface}/>} 
        </View>
        {error ? <View style={styles.errorCard}><Icon name="alert" size={19} color={theme.colors.danger}/><Text accessibilityRole="alert" style={styles.error}>{error}</Text></View> : null}
        <View style={styles.note}><Text style={styles.noteTitle}>Your phone is still in control</Text><Text style={styles.noteBody}>Pausing here stops ShipShape delivery. Sound, banners, and lock-screen behavior stay in your iPhone settings.</Text></View>
        <Button variant="secondary" onPress={() => Linking.openSettings()}>Open device settings</Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.canvas }, content: { flex: 1, padding: 24, gap: 20 }, heading: { gap: 5, marginTop: 6, marginBottom: 4 },
  eyebrow: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "800", fontSize: 10, letterSpacing: 1.5 }, title: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 48, lineHeight: 50, letterSpacing: 1.2 }, subtitle: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 15, lineHeight: 23 },
  card: { minHeight: 92, flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }, icon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.brandSoft }, copy: { flex: 1, gap: 3 }, cardTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 16 }, cardBody: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 12 },
  errorCard: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 16, backgroundColor: theme.colors.dangerSoft }, error: { flex: 1, color: theme.colors.danger, fontFamily: theme.type.body, fontSize: 12, lineHeight: 18 }, note: { padding: 18, borderRadius: 18, backgroundColor: theme.colors.subtle, gap: 5 }, noteTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 14 }, noteBody: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 12, lineHeight: 19 },
});
