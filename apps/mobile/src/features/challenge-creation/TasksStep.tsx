import { theme } from "@shipshape/ui-mobile";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { sharedStyles, StepHero } from "./ChallengeCreationFields";
import type { ChallengeBuilder } from "./useChallengeBuilder";

export function TasksStep({ builder }: { builder: ChallengeBuilder }) {
  return <>
    <StepHero eyebrow="DAILY TASKS" title="Choose the work." subtitle="Tap every task participants must complete each day. You’ll set the exact targets next.">
      <View style={styles.countBadge}><Text style={styles.countValue}>{builder.selectedIds.length}</Text><Text style={styles.countLabel}>SELECTED</Text></View>
    </StepHero>
    {builder.catalog.isLoading ? <Text style={sharedStyles.helpCentered}>Loading task library…</Text> : null}
    {builder.catalog.isError ? <Text style={sharedStyles.error}>The task library could not load.</Text> : null}
    <View style={styles.grid}>{(builder.catalog.data ?? []).map((task) => {
      const selected = builder.selectedIds.includes(task.id);
      return <Pressable key={task.id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => builder.toggleTask(task)} style={({ pressed }) => [styles.tile, selected && styles.tileSelected, pressed && sharedStyles.pressed]}>
        <View style={[styles.state, selected && styles.stateSelected]}><Text style={[styles.stateText, selected && styles.stateTextSelected]}>{selected ? "SELECTED" : "AVAILABLE"}</Text></View>
        <Text style={styles.title}>{task.title}</Text><Text numberOfLines={3} style={styles.body}>{task.description}</Text>
      </Pressable>;
    })}</View>
    <View style={styles.note}><Text style={styles.noteTitle}>One task list, all day</Text><Text style={styles.noteBody}>Every selected task is available until the daily deadline—no morning or evening buckets.</Text></View>
  </>;
}

const styles = StyleSheet.create({
  countBadge: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 6, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, backgroundColor: theme.colors.brandSoft }, countValue: { color: theme.colors.brandStrong, fontFamily: theme.type.display, fontSize: 23 }, countLabel: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "800", fontSize: 8, letterSpacing: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 }, tile: { width: "48.2%", minHeight: 152, padding: 15, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, gap: 8 }, tileSelected: { borderColor: theme.colors.brand, backgroundColor: theme.colors.brandSoft }, state: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: theme.colors.subtle }, stateSelected: { backgroundColor: theme.colors.brand }, stateText: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontWeight: "900", fontSize: 7, letterSpacing: 0.8 }, stateTextSelected: { color: "#fff" }, title: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 14 }, body: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 11, lineHeight: 16 },
  note: { alignItems: "center", padding: 17, borderRadius: 18, backgroundColor: theme.colors.subtle, gap: 4 }, noteTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 14 }, noteBody: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 11, lineHeight: 17, textAlign: "center" },
});
