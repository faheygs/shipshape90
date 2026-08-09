import { getShipShapePointRules } from "@shipshape/domain";
import { ChoiceChip, Icon, theme } from "@shipshape/ui-mobile";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { dateFromValue, isMeasurableTask } from "./challengeCreationModel";
import { sharedStyles, StepHero } from "./ChallengeCreationFields";
import type { ChallengeBuilder } from "./useChallengeBuilder";

export function RulesStep({ builder }: { builder: ChallengeBuilder }) {
  const rules = getShipShapePointRules(builder.selectedIds.length);
  const reward = builder.rewardType === "bragging" ? "Bragging rights" : "Prize";
  return <>
    <StepHero eyebrow="DEFINE THE RULES" title="Make each task clear." subtitle="Configure one task at a time. Everyone will see these exact targets." />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>{builder.selectedIds.map((id) => {
      const task = builder.catalog.data?.find((item) => item.id === id);
      return task ? <ChoiceChip key={id} label={task.title} selected={builder.activeTaskId === id} onPress={() => builder.setEditingTaskId(id)} /> : null;
    })}</ScrollView>
    {builder.activeTask && builder.activeConfig && builder.activeTaskId ? <View style={styles.editor}>
      <View style={styles.editorHead}><View style={styles.number}><Text style={styles.numberText}>{builder.selectedIds.indexOf(builder.activeTaskId) + 1}</Text></View><View style={styles.editorCopy}><Text style={styles.editorTitle}>{builder.activeTask.title}</Text><Text style={styles.editorMeta}>{builder.selectedIds.indexOf(builder.activeTaskId) + 1} of {builder.selectedIds.length} tasks</Text></View></View>
      {isMeasurableTask(builder.activeTask) ? <View style={styles.targetArea}>
        <View style={styles.targetField}><Text style={sharedStyles.label}>DAILY TARGET</Text><TextInput value={builder.activeConfig.targetValue} onChangeText={(value) => builder.updateTask(builder.activeTaskId!, { targetValue: value.replace(/[^0-9.]/g, "") })} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={theme.colors.textMuted} style={styles.targetInput} /></View>
        <View style={styles.unitField}><Text style={sharedStyles.label}>MEASURED IN</Text><View style={styles.units}>{builder.activeTask.allowedUnits.map((unit) => <ChoiceChip key={unit} label={unit} selected={builder.activeConfig?.unit === unit} onPress={() => builder.updateTask(builder.activeTaskId!, { unit })} />)}</View></View>
      </View> : null}
      <View style={sharedStyles.field}><Text style={sharedStyles.label}>WHAT COUNTS?</Text><TextInput value={builder.activeConfig.instructions} onChangeText={(instructions) => builder.updateTask(builder.activeTaskId!, { instructions })} placeholder="Describe exactly what counts" placeholderTextColor={theme.colors.textMuted} multiline maxLength={500} style={[sharedStyles.input, styles.ruleInput]} /></View>
      {builder.activeTask.safetyNote ? <Text style={styles.safety}>{builder.activeTask.safetyNote}</Text> : null}
    </View> : null}
    <View style={styles.review}><Text style={styles.reviewEyebrow}>READY TO PUBLISH</Text><Text style={styles.reviewTitle}>{builder.name}</Text><Text style={styles.reviewMeta}>{builder.selectedIds.length} daily tasks · {dateFromValue(builder.startsOn).toLocaleDateString(undefined, { month: "short", day: "numeric" })}–{dateFromValue(builder.endsOn).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Text><Text style={styles.reviewScoring}>ShipShape Points · +1 complete · −3 missed · +{rules.perfectDayBonus} perfect day · +{rules.sevenDayStreakBonus} streak{builder.weightBonusCalculation ? ` · weight ${builder.weightBonusCalculation === "percentage" ? "%" : "total"}` : ""}{builder.bodyFatBonusCalculation ? ` · body-fat ${builder.bodyFatBonusCalculation === "percentage" ? "%" : "total"}` : ""}</Text><Text style={styles.reviewMeta}>{builder.checkpoints.length} required progress check-ins</Text><View style={styles.prize}><Icon name="trophy" size={18} color={theme.colors.brandStrong} /><Text style={styles.prizeText}>{reward}</Text></View></View>
  </>;
}

const styles = StyleSheet.create({
  tabs: { gap: 8, paddingRight: 24 }, editor: { padding: 18, borderRadius: 22, borderWidth: 1, borderColor: theme.colors.brand, backgroundColor: theme.colors.surface, gap: 20 }, editorHead: { flexDirection: "row", alignItems: "center", gap: 12 }, number: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.brand }, numberText: { color: "#fff", fontFamily: theme.type.display, fontSize: 25 }, editorCopy: { flex: 1 }, editorTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 18 }, editorMeta: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 11, marginTop: 2 },
  targetArea: { flexDirection: "row", alignItems: "flex-start", gap: 12 }, targetField: { width: 112, gap: 8 }, unitField: { flex: 1, gap: 8 }, targetInput: { minHeight: 48, paddingHorizontal: 13, borderRadius: 13, borderWidth: 1, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.canvas, color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 17 }, units: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, ruleInput: { minHeight: 90, paddingTop: 14, textAlignVertical: "top", backgroundColor: theme.colors.canvas }, safety: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 10, lineHeight: 16 },
  review: { alignItems: "center", padding: 20, borderRadius: 20, backgroundColor: theme.colors.accentSoft, gap: 5 }, reviewEyebrow: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontWeight: "800", fontSize: 8, letterSpacing: 1.1 }, reviewTitle: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 32, textAlign: "center" }, reviewMeta: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 11, textAlign: "center" }, reviewScoring: { marginTop: 7, color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "800", fontSize: 12 }, prize: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }, prizeText: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 13 },
});
