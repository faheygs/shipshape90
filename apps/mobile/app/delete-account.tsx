import { BackButton, Button, Icon, theme } from "@shipshape/ui-mobile";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../src/features/auth/AuthProvider";
import { useChallenges } from "../src/features/challenges/useChallenges";

export default function DeleteAccountScreen() {
  const { deleteAccount } = useAuth();
  const challenges = useChallenges();
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const items = useMemo(() => challenges.data ?? [], [challenges.data]);
  const active = items.find((challenge) => challenge.membershipStatus === "active");
  const openOwned = useMemo(() => items.filter((challenge) => challenge.isOwner && !["complete", "archived"].includes(challenge.challengeStatus)), [items]);

  const remove = async () => {
    if (confirmation !== "DELETE") return;
    setLoading(true);
    setError(null);
    try {
      await deleteAccount();
      router.replace("/welcome");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your account couldn't be deleted. Nothing else was changed; please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <BackButton onPress={() => router.back()} />
          <View style={styles.heading}><Text style={styles.eyebrow}>DELETE ACCOUNT</Text><Text style={styles.title}>This ends your run.</Text><Text style={styles.subtitle}>This is permanent and cannot be undone.</Text></View>
          <View style={styles.warning}><View style={styles.warningIcon}><Icon name="alert" color={theme.colors.danger}/></View><View style={styles.warningCopy}><Text style={styles.warningTitle}>What happens next</Text><Text style={styles.warningBody}>Your login, profile, photos, progress logs, notifications, and personal challenge records are permanently removed.</Text></View></View>
          {active ? <View style={styles.impact}><Text style={styles.impactLabel}>ACTIVE CHALLENGE</Text><Text style={styles.impactTitle}>{active.name}</Text><Text style={styles.impactBody}>{active.isOwner ? "This challenge will end for everyone before your account is removed." : "You will leave immediately, forfeit prize eligibility, and cannot rejoin."}</Text></View> : null}
          {openOwned.length > (active?.isOwner ? 1 : 0) ? <View style={styles.impact}><Text style={styles.impactLabel}>CHALLENGES YOU CREATED</Text><Text style={styles.impactTitle}>{openOwned.length} open challenge{openOwned.length === 1 ? "" : "s"}</Text><Text style={styles.impactBody}>Upcoming challenges will be cancelled and live challenges will end. Other members keep their own completed history.</Text></View> : null}
          <View style={styles.field}><Text style={styles.label}>TYPE DELETE TO CONFIRM</Text><TextInput value={confirmation} onChangeText={(value) => { setConfirmation(value.toUpperCase().slice(0, 6)); setError(null); }} autoCapitalize="characters" autoCorrect={false} placeholder="DELETE" placeholderTextColor={theme.colors.textMuted} returnKeyType="done" onSubmitEditing={remove} style={styles.input}/></View>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Button variant="danger" disabled={confirmation !== "DELETE" || challenges.isLoading} loading={loading} onPress={remove}>Permanently delete account</Button>
          <Button variant="secondary" disabled={loading} onPress={() => router.back()}>Keep my account</Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.canvas }, flex: { flex: 1 }, content: { padding: 24, paddingBottom: 48, gap: 16 }, heading: { gap: 5, marginTop: 6, marginBottom: 4 },
  eyebrow: { color: theme.colors.danger, fontFamily: theme.type.body, fontWeight: "800", fontSize: 10, letterSpacing: 1.5 }, title: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 49, lineHeight: 51, letterSpacing: 1.2 }, subtitle: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 15, lineHeight: 23 },
  warning: { flexDirection: "row", gap: 14, padding: 18, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.danger, backgroundColor: theme.colors.dangerSoft }, warningIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface }, warningCopy: { flex: 1, gap: 4 }, warningTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 16 }, warningBody: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 12, lineHeight: 19 },
  impact: { padding: 17, borderRadius: 18, backgroundColor: theme.colors.subtle, gap: 4 }, impactLabel: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "800", fontSize: 9, letterSpacing: 1.1 }, impactTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 15 }, impactBody: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 12, lineHeight: 19 },
  field: { gap: 8, marginTop: 8 }, label: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontWeight: "800", fontSize: 10, letterSpacing: 1.1 }, input: { minHeight: 58, paddingHorizontal: 16, borderRadius: 15, borderWidth: 1, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface, color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 17, letterSpacing: 2 }, error: { color: theme.colors.danger, fontFamily: theme.type.body, fontSize: 12, lineHeight: 18 },
});
