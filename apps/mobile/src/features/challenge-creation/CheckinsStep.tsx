import { Button, Icon, theme } from "@shipshape/ui-mobile";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { sharedStyles, StepHero, ToggleRow } from "./ChallengeCreationFields";
import type { CheckpointPreset } from "./challengeCreationModel";
import type { ChallengeBuilder } from "./useChallengeBuilder";

interface ScheduleOption { id: CheckpointPreset; title: string; count: number; minimumDays: number; detail: string }

export function CheckinsStep({ builder }: { builder: ChallengeBuilder }) {
  const duration = builder.durationDays;
  const options: ScheduleOption[] = [
    { id: "simple", title: "Essentials", count: 2, minimumDays: 2, detail: `Day 1 · Day ${duration}` },
    { id: "halfway", title: "Halfway", count: 3, minimumDays: 3, detail: `Day 1 · ${Math.max(2, Math.min(duration - 1, Math.round((duration + 1) / 2)))} · ${duration}` },
    { id: "milestones", title: "Milestones", count: 4, minimumDays: 4, detail: `Day 1 · ${Math.max(2, Math.round(duration / 3))} · ${Math.min(duration - 1, Math.round(duration * 2 / 3))} · ${duration}` },
    { id: "custom", title: "Custom", count: 2, minimumDays: 2, detail: "Choose up to 3 days" },
  ];
  const ordered = [...builder.checkpoints].sort((left, right) => Number(left.dayNumber) - Number(right.dayNumber));
  const canAdd = builder.checkpointPreset === "custom" && builder.checkpoints.filter((checkpoint) => checkpoint.kind === "milestone").length < 3 && duration > 2;

  return <>
    <StepHero eyebrow="PROGRESS CHECK-INS" title="Set the markers." subtitle="Choose when everyone pauses to record progress. Start and Final are always included; add up to three moments in between." />
    <View style={styles.presetCard}>
      <View style={styles.scheduleHeader}><Text style={styles.eyebrow}>QUICK SCHEDULE</Text><Text style={styles.scheduleTitle}>Choose a check-in rhythm</Text><Text style={styles.intro}>Start and Final are already included. Pick how often everyone checks in between them.</Text></View>
      <View style={styles.scheduleGrid}>{options.map((option) => {
        const selected = builder.checkpointPreset === option.id;
        const disabled = duration < option.minimumDays;
        return <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={() => builder.applyCheckpointPreset(option.id)} style={({ pressed }) => [styles.scheduleTile, selected && styles.scheduleTileSelected, disabled && styles.disabled, pressed && sharedStyles.pressed]}>
          <View style={[styles.countBox, selected && styles.countBoxSelected]}><Text style={[styles.count, selected && styles.selectedText]}>{option.id === "custom" ? "2–5" : option.count}</Text><Text style={[styles.countLabel, selected && styles.selectedText]}>CHECK-INS</Text></View>
          <View style={styles.tileCopy}><Text style={[styles.tileTitle, selected && styles.tileTitleSelected]}>{option.title}</Text><Text numberOfLines={1} style={styles.tileDetail}>{option.detail}</Text></View>
          <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot}/> : null}</View>
        </Pressable>;
      })}</View>
      <Text style={styles.scheduleFooter}>{builder.checkpointPreset === "custom" ? "Add and place your own intermediate check-ins below." : "You can still choose what each intermediate check-in collects."}</Text>
    </View>
    <View>{ordered.map((checkpoint, index) => {
      const fixed = checkpoint.kind !== "milestone";
      const editable = builder.checkpointPreset === "custom" && !fixed;
      return <View key={checkpoint.id} style={styles.checkpointRow}>
        <View style={styles.rail}><View style={[styles.dot, fixed && styles.dotLocked]}><Text style={styles.dotText}>{index + 1}</Text></View>{index < ordered.length - 1 ? <View style={styles.line} /> : null}</View>
        <View style={styles.checkpointCard}>
          <View style={styles.checkpointHead}><View style={styles.titleCopy}><Text style={styles.eyebrow}>{fixed ? checkpoint.kind === "start" ? "START CHECK-IN" : "FINAL CHECK-IN" : "MILESTONE CHECK-IN"}</Text>{editable ? <TextInput value={checkpoint.label} onChangeText={(label) => builder.updateCheckpoint(checkpoint.id, { label })} maxLength={40} returnKeyType="done" style={styles.titleInput} /> : <Text style={styles.checkpointTitle}>{checkpoint.label}</Text>}</View>{editable ? <Button size="sm" variant="secondary" onPress={() => builder.removeCheckpoint(checkpoint.id)}>Remove</Button> : <Text style={styles.fixedDay}>DAY {checkpoint.dayNumber}</Text>}</View>
          {fixed ? <View style={styles.fixedSummary}><Icon name="check" size={16} color={theme.colors.brandStrong}/><Text style={styles.fixedSummaryText}>Weight, body fat & photo required</Text></View> : <>
            <View style={styles.dayRow}><View><Text style={sharedStyles.label}>WHEN IT HAPPENS</Text><Text style={styles.daySummary}>Day {checkpoint.dayNumber || "—"}</Text></View>{editable ? <View style={styles.dayInputWrap}><Text style={styles.dayPrefix}>DAY</Text><TextInput value={checkpoint.dayNumber} onChangeText={(dayNumber) => builder.updateCheckpoint(checkpoint.id, { dayNumber: dayNumber.replace(/[^0-9]/g, "") })} keyboardType="number-pad" style={styles.dayInput} /></View> : <Text style={styles.fixedDay}>DAY {checkpoint.dayNumber}</Text>}</View>
            <View style={styles.requirementHead}><Text style={styles.requirementTitle}>What must they log?</Text><Text style={styles.requirementHint}>At least one</Text></View>
            <View style={styles.requirements}><ToggleRow title="Weight" description="Record current body weight." value={checkpoint.requiresWeight} onValueChange={(requiresWeight) => builder.updateCheckpoint(checkpoint.id, { requiresWeight })} /><ToggleRow title="Body fat" description="Record current body-fat percentage." value={checkpoint.requiresBodyFat} onValueChange={(requiresBodyFat) => builder.updateCheckpoint(checkpoint.id, { requiresBodyFat })} /><ToggleRow title="Progress photo" description="Take a new photo or choose one from the library." value={checkpoint.requiresPhoto} onValueChange={(requiresPhoto) => builder.updateCheckpoint(checkpoint.id, { requiresPhoto })} /></View>
          </>}
        </View>
      </View>;
    })}</View>
    {canAdd ? <Button variant="secondary" leadingIcon="create" onPress={builder.addCheckpoint}>Add custom check-in</Button> : null}
    <View style={styles.lockNote}><Icon name="flame" size={20} color={theme.colors.brandStrong}/><Text style={styles.lockNoteText}>When a check-in is due, that participant completes it before that day&apos;s tasks unlock. Their measurements and photos stay private.</Text></View>
  </>;
}

const styles = StyleSheet.create({
  presetCard: { gap: 16, padding: 17, borderRadius: 22, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }, scheduleHeader: { gap: 4 }, eyebrow: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "900", fontSize: 8, letterSpacing: 1.1 }, scheduleTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "900", fontSize: 19 }, intro: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 11, lineHeight: 17 },
  scheduleGrid: { gap: 9 }, scheduleTile: { width: "100%", minHeight: 76, flexDirection: "row", alignItems: "center", gap: 12, padding: 10, paddingRight: 14, borderRadius: 17, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.canvas }, scheduleTileSelected: { borderWidth: 2, borderColor: theme.colors.brand, backgroundColor: theme.colors.brandSoft }, disabled: { opacity: 0.4 },
  countBox: { width: 58, minHeight: 54, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: theme.colors.subtle }, countBoxSelected: { backgroundColor: theme.colors.brand }, count: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 24, lineHeight: 25 }, countLabel: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontWeight: "900", fontSize: 6, letterSpacing: 0.6 }, selectedText: { color: "#fff" },
  tileCopy: { flex: 1, minWidth: 0, gap: 3 }, tileTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "900", fontSize: 14 }, tileTitleSelected: { color: theme.colors.brandStrong }, tileDetail: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 10, lineHeight: 14 }, radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: theme.colors.borderStrong, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface }, radioSelected: { borderColor: theme.colors.brand }, radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.brand }, scheduleFooter: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 10, lineHeight: 16, textAlign: "center" },
  checkpointRow: { flexDirection: "row", alignItems: "stretch", gap: 12 }, rail: { width: 34, alignItems: "center" }, dot: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: theme.colors.brand, backgroundColor: theme.colors.surface }, dotLocked: { backgroundColor: theme.colors.brand }, dotText: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "900", fontSize: 11 }, line: { flex: 1, width: 2, minHeight: 18, backgroundColor: theme.colors.brandSoft },
  checkpointCard: { flex: 1, marginBottom: 14, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, gap: 14 }, checkpointHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }, titleCopy: { flex: 1, minWidth: 0, gap: 3 }, checkpointTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "900", fontSize: 18, lineHeight: 24 }, titleInput: { minHeight: 40, paddingHorizontal: 10, borderRadius: 11, borderWidth: 1, borderColor: theme.colors.borderStrong, color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 15 }, fixedDay: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "900", fontSize: 11, letterSpacing: 0.8 }, fixedSummary: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.colors.border }, fixedSummaryText: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontWeight: "700", fontSize: 11 },
  dayRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, daySummary: { marginTop: 3, color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 14 }, dayInputWrap: { flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 10, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.canvas }, dayPrefix: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontWeight: "900", fontSize: 8, letterSpacing: 0.8 }, dayInput: { width: 48, minHeight: 40, paddingHorizontal: 8, color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "900", fontSize: 15 }, requirementHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }, requirementTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "900", fontSize: 14 }, requirementHint: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 10 }, requirements: { gap: 8 },
  lockNote: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 16, borderRadius: 18, backgroundColor: theme.colors.accentSoft }, lockNoteText: { flex: 1, color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 12, lineHeight: 18 },
});
