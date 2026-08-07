import { Button, Icon, theme, useAppDialog } from "@shipshape/ui-mobile";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../src/features/auth/AuthProvider";
import { getAvatarUrl } from "../../src/features/auth/authRepository";
import { BodyProgressPanel } from "../../src/components/BodyProgressPanel";
import { useMyChallengeHistory } from "../../src/features/history/useChallengeHistory";

export default function ProfileScreen() {
  const { isPreview, profile, session, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const { showDialog } = useAppDialog();
  const history = useMyChallengeHistory();
  const displayName = profile?.displayName ?? "Preview Participant";
  const handle = profile?.handle ?? "shipshape";
  const initials = useMemo(() => displayName.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "SS", [displayName]);
  const avatarUrl = getAvatarUrl(profile?.avatarPath ?? null);
  const pastChallenges = history.data ?? [];
  const perfectDays = pastChallenges.reduce((sum, item) => sum + item.perfectDays, 0);
  const completedTasks = pastChallenges.reduce((sum, item) => sum + item.completedTasks, 0);

  const leave = async () => {
    if (isPreview) {
      router.replace("/welcome");
      return;
    }
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/welcome");
    } catch (caught) {
      showDialog({ icon: "alert", title: "Couldn’t sign out.", message: caught instanceof Error ? caught.message : "Please try again." });
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>PROFILE</Text>
          <Text style={styles.title}>Your corner.</Text>
        </View>

        <View style={styles.profileCard}>
          {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatarImage} /> : <View style={styles.avatar}><Text style={styles.initials}>{initials}</Text></View>}
          <View style={styles.profileCopy}>
            <Text style={styles.name}>{displayName}</Text>
            <Text style={styles.handle}>@{handle}</Text>
            <Text style={styles.timeZone}>{profile?.timeZone ?? "Preview mode"}</Text>
          </View>
        </View>

        {!isPreview ? <Pressable accessibilityRole="button" onPress={() => router.push("/edit-profile")} style={({ pressed }) => [styles.settingsRow, pressed && styles.historyLinkPressed]}>
          <View style={styles.settingsIcon}><Icon name="profile" size={21} color={theme.colors.brandStrong}/></View>
          <View style={styles.settingsCopy}><Text style={styles.settingsTitle}>Edit profile</Text><Text style={styles.settingsBody}>Name, username, and profile photo</Text></View>
          <Icon name="arrow-right" size={20} color={theme.colors.textMuted}/>
        </Pressable> : null}

        <Text style={styles.sectionTitle}>Your progress</Text>
        <View style={styles.stats}>
          <View style={styles.stat}><Text style={styles.statValue}>{perfectDays}</Text><Text style={styles.statLabel}>PERFECT DAYS</Text></View>
          <View style={styles.divider} />
          <View style={styles.stat}><Text style={styles.statValue}>{completedTasks}</Text><Text style={styles.statLabel}>TASKS DONE</Text></View>
          <View style={styles.divider} />
          <View style={styles.stat}><Text style={styles.statValue}>{pastChallenges.length}</Text><Text style={styles.statLabel}>CHALLENGES</Text></View>
        </View>

        <Pressable accessibilityRole="button" onPress={() => router.push("/history")} style={({ pressed }) => [styles.historyLink, pressed && styles.historyLinkPressed]}>
          <View style={styles.historyIcon}><Icon name="trophy" color={theme.colors.brandStrong}/></View>
          <View style={styles.historyCopy}><Text style={styles.historyTitle}>Challenge history</Text><Text style={styles.historyBody}>View every result and your day-by-day performance.</Text></View>
          <Icon name="arrow-right" color={theme.colors.textSecondary}/>
        </Pressable>

        <BodyProgressPanel compact />

        <Text style={styles.sectionTitle}>Settings</Text>
        <View style={styles.settingsCard}>
          {!isPreview ? <Pressable accessibilityRole="button" onPress={() => router.push("/notification-settings")} style={({ pressed }) => [styles.settingsRow, styles.settingsRowGrouped, pressed && styles.historyLinkPressed]}><View style={styles.settingsIcon}><Icon name="bell" size={21} color={theme.colors.brandStrong}/></View><View style={styles.settingsCopy}><Text style={styles.settingsTitle}>Notifications</Text><Text style={styles.settingsBody}>Challenge updates and device delivery</Text></View><Icon name="arrow-right" size={20} color={theme.colors.textMuted}/></Pressable> : null}
          <Pressable accessibilityRole="link" onPress={() => Linking.openURL("https://shipshape90.com/privacy")} style={({ pressed }) => [styles.settingsRow, styles.settingsRowGrouped, pressed && styles.historyLinkPressed]}><View style={styles.settingsIcon}><Icon name="lock" size={20} color={theme.colors.brandStrong}/></View><View style={styles.settingsCopy}><Text style={styles.settingsTitle}>Privacy policy</Text><Text style={styles.settingsBody}>How your information is handled</Text></View><Icon name="arrow-right" size={20} color={theme.colors.textMuted}/></Pressable>
          <Pressable accessibilityRole="link" onPress={() => Linking.openURL("https://shipshape90.com/terms")} style={({ pressed }) => [styles.settingsRow, styles.settingsRowGrouped, pressed && styles.historyLinkPressed]}><View style={styles.settingsIcon}><Icon name="challenges" size={20} color={theme.colors.brandStrong}/></View><View style={styles.settingsCopy}><Text style={styles.settingsTitle}>Terms of use</Text><Text style={styles.settingsBody}>The rules for using ShipShape</Text></View><Icon name="arrow-right" size={20} color={theme.colors.textMuted}/></Pressable>
          <Pressable accessibilityRole="link" onPress={() => Linking.openURL("https://shipshape90.com/support")} style={({ pressed }) => [styles.settingsRow, styles.settingsRowGrouped, styles.settingsRowLast, pressed && styles.historyLinkPressed]}><View style={styles.settingsIcon}><Icon name="alert" size={20} color={theme.colors.brandStrong}/></View><View style={styles.settingsCopy}><Text style={styles.settingsTitle}>Help and support</Text><Text style={styles.settingsBody}>Answers, safety, and contact</Text></View><Icon name="arrow-right" size={20} color={theme.colors.textMuted}/></Pressable>
        </View>

        <View style={styles.accountCard}><Text style={styles.accountLabel}>ACCOUNT</Text><Text style={styles.accountTitle}>{isPreview ? "Preview session" : session?.user.email ?? "Signed in"}</Text><Text style={styles.accountBody}>{isPreview ? "Exit preview to return to the sign-in screen." : "Your challenge activity is synced securely to this account."}</Text></View>

        <Button variant="secondary" loading={signingOut} onPress={leave}>{isPreview ? "Exit preview" : "Sign out"}</Button>
        {!isPreview ? <Button variant="danger" onPress={() => router.push("/delete-account")}>Delete account</Button> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.canvas },
  content: { padding: 24, paddingBottom: 48, gap: 24 },
  header: { gap: 4 },
  eyebrow: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "800", fontSize: 10, letterSpacing: 1.4 },
  title: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 46, lineHeight: 50, letterSpacing: 1.5 },
  profileCard: { flexDirection: "row", alignItems: "center", gap: 16, padding: 18, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.brand },
  avatarImage: { width: 64, height: 64, borderRadius: 32, backgroundColor: theme.colors.brandSoft },
  initials: { color: "#fff", fontFamily: theme.type.body, fontWeight: "800", fontSize: 18 },
  profileCopy: { flex: 1 },
  name: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 19 },
  handle: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "700", fontSize: 13, marginTop: 2 },
  timeZone: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 12, marginTop: 3 },
  sectionTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 20 },
  stats: { flexDirection: "row", alignItems: "center", paddingVertical: 20, paddingHorizontal: 12, borderRadius: 18, backgroundColor: theme.colors.subtle },
  stat: { flex: 1, alignItems: "center", gap: 4 },
  divider: { width: 1, height: 40, backgroundColor: theme.colors.border },
  statValue: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 30, textAlign: "center" },
  statLabel: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontWeight: "800", fontSize: 8, letterSpacing: 0.7, textAlign: "center" },
  historyLink: { minHeight: 88, flexDirection: "row", alignItems: "center", gap: 13, padding: 15, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  historyLinkPressed: { opacity: .82, transform: [{ scale: .99 }] },
  historyIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.brandSoft },
  historyCopy: { flex: 1, gap: 3 },
  historyTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 15 },
  historyBody: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 11, lineHeight: 16 },
  accountCard: { padding: 18, borderRadius: 18, backgroundColor: theme.colors.brandSoft, gap: 5 },
  accountLabel: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "800", fontSize: 9, letterSpacing: 1.2 },
  accountTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 16 },
  accountBody: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 13, lineHeight: 20 },
  settingsCard: { borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, overflow: "hidden" },
  settingsRow: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 13, paddingHorizontal: 15, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  settingsRowGrouped: { borderWidth: 0, borderBottomWidth: 1, borderBottomColor: theme.colors.border, borderRadius: 0 },
  settingsRowLast: { borderBottomWidth: 0 },
  settingsIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.brandSoft },
  settingsCopy: { flex: 1, gap: 2 },
  settingsTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 14 },
  settingsBody: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 11, lineHeight: 16 },
});
