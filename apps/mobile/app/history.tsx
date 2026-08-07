import { BackButton, Icon, theme } from "@shipshape/ui-mobile";
import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChallengeHistoryCard } from "../src/components/ChallengeHistoryCard";
import { useMyChallengeHistory } from "../src/features/history/useChallengeHistory";

export default function ChallengeHistoryScreen() {
  const history = useMyChallengeHistory();
  const items = history.data ?? [];
  const totalPoints = items.reduce((sum, item) => sum + item.totalPoints, 0);
  const perfectDays = items.reduce((sum, item) => sum + item.perfectDays, 0);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.top}><BackButton onPress={() => router.back()} /></View>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>CHALLENGE HISTORY</Text>
          <Text style={styles.title}>Your body of work.</Text>
          <Text style={styles.subtitle}>Every challenge you finished or left, with the result exactly as it happened.</Text>
        </View>

        <View style={styles.lifetime}>
          <View style={styles.lifetimeStat}><Text style={styles.lifetimeValue}>{items.length}</Text><Text style={styles.lifetimeLabel}>CHALLENGES</Text></View>
          <View style={styles.divider}/>
          <View style={styles.lifetimeStat}><Text style={styles.lifetimeValue}>{totalPoints}</Text><Text style={styles.lifetimeLabel}>TOTAL POINTS</Text></View>
          <View style={styles.divider}/>
          <View style={styles.lifetimeStat}><Text style={styles.lifetimeValue}>{perfectDays}</Text><Text style={styles.lifetimeLabel}>PERFECT DAYS</Text></View>
        </View>

        <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Past challenges</Text><Text style={styles.count}>{items.length}</Text></View>
        {history.isLoading ? <Text style={styles.message}>Loading your history…</Text> : null}
        {history.isError ? <View style={styles.empty}><Icon name="alert" color={theme.colors.danger}/><View style={styles.emptyCopy}><Text style={styles.emptyTitle}>History couldn’t load</Text><Text style={styles.emptyBody}>Check your connection and try again.</Text></View></View> : null}
        <View style={styles.list}>
          {items.map((item) => <ChallengeHistoryCard key={item.challengeId} item={item} onPress={() => router.push({ pathname: "/history/[id]", params: { id: item.challengeId } })} />)}
        </View>
        {!history.isLoading && !history.isError && items.length === 0 ? <View style={styles.empty}><Icon name="trophy" color={theme.colors.brandStrong}/><View style={styles.emptyCopy}><Text style={styles.emptyTitle}>Your first result starts here</Text><Text style={styles.emptyBody}>Completed and forfeited challenges will appear here.</Text></View></View> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.canvas },
  content: { padding: 24, paddingBottom: 56, gap: 22 },
  top: { alignItems: "flex-start" },
  header: { gap: 6 },
  eyebrow: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "900", fontSize: 10, letterSpacing: 1.5 },
  title: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 49, lineHeight: 52, letterSpacing: 1.2 },
  subtitle: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 14, lineHeight: 21, maxWidth: 350 },
  lifetime: { minHeight: 92, flexDirection: "row", alignItems: "center", paddingHorizontal: 10, borderRadius: 22, backgroundColor: theme.colors.brandSoft },
  lifetimeStat: { flex: 1, alignItems: "center", gap: 3 },
  lifetimeValue: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 31, lineHeight: 34 },
  lifetimeLabel: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontWeight: "900", fontSize: 7, letterSpacing: .7, textAlign: "center" },
  divider: { width: 1, height: 38, backgroundColor: theme.colors.border },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 20 },
  count: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "900", fontSize: 12 },
  list: { gap: 13 },
  message: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 13 },
  empty: { flexDirection: "row", alignItems: "center", gap: 13, padding: 18, borderRadius: 19, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  emptyCopy: { flex: 1, gap: 3 },
  emptyTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 15 },
  emptyBody: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 12, lineHeight: 18 },
});
