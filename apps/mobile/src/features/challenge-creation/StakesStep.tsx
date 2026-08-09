import { ChoiceChip, Icon, theme } from "@shipshape/ui-mobile";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { DateField, sharedStyles, StepHero, ToggleRow } from "./ChallengeCreationFields";
import type { ChallengeBuilder } from "./useChallengeBuilder";

function MethodPicker({ value, secondLabel, percentageHelp, totalHelp, onChange }: { value: "percentage" | "total_change"; secondLabel: string; percentageHelp: string; totalHelp: string; onChange: (value: "percentage" | "total_change") => void }) {
  return <View style={styles.methodArea}><Text style={sharedStyles.label}>HOW TO MAKE IT FAIR</Text><View style={styles.methodPicker}>
    <Pressable onPress={() => onChange("percentage")} style={[styles.methodOption, value === "percentage" && styles.methodOptionActive]}><Text style={[styles.methodText, value === "percentage" && styles.methodTextActive]}>Percentage</Text></Pressable>
    <Pressable onPress={() => onChange("total_change")} style={[styles.methodOption, value === "total_change" && styles.methodOptionActive]}><Text style={[styles.methodText, value === "total_change" && styles.methodTextActive]}>{secondLabel}</Text></Pressable>
  </View><Text style={styles.methodHelp}>{value === "percentage" ? percentageHelp : totalHelp}</Text></View>;
}

export function StakesStep({ builder }: { builder: ChallengeBuilder }) {
  return <>
    <StepHero eyebrow="TIMELINE & STAKES" title="Define the win." subtitle="Set the dates, how the leaderboard works, and what is at stake." />
    <View style={styles.stack}>
      <DateField label="STARTS" value={builder.startsOn} minimumDate={builder.defaults.today} open={builder.openDate === "start"} onToggle={() => builder.setOpenDate(builder.openDate === "start" ? null : "start")} onClose={() => builder.setOpenDate(null)} onChange={builder.changeStartDate} />
      <DateField label="ENDS" value={builder.endsOn} minimumDate={builder.endMinimumDate} open={builder.openDate === "end"} onToggle={() => builder.setOpenDate(builder.openDate === "end" ? null : "end")} onClose={() => builder.setOpenDate(null)} onChange={builder.changeEndDate} />
    </View>
    <View style={styles.scoringSection}>
      <View style={styles.alwaysOnCard}><View style={styles.alwaysOnIcon}><Icon name="flame" size={25} color={theme.colors.brandStrong}/></View><View style={styles.alwaysOnCopy}><Text style={styles.alwaysOnLabel}>ALWAYS ON</Text><Text style={styles.alwaysOnTitle}>ShipShape Points</Text><Text style={styles.alwaysOnBody}>+1 per completed task and −3 per missed task. Perfect-day and 7-day streak bonuses scale automatically with the number of daily tasks.</Text></View></View>
      <View style={styles.endPointsIntro}><Text style={styles.endPointsEyebrow}>OPTIONAL · SCORED AT THE FINISH</Text><Text style={sharedStyles.sectionTitle}>Additional points</Text><Text style={sharedStyles.helpCentered}>Give people another way to compete even if they miss a few days. Final results are compared with each person&apos;s own Start check-in.</Text></View>
      <View style={styles.options}>
        <View style={styles.optionCard}><ToggleRow title="Weight change" description="Add points for weight lost between Start and Final." value={builder.weightBonusCalculation !== null} onValueChange={(enabled) => builder.setWeightBonusCalculation(enabled ? "percentage" : null)} />{builder.weightBonusCalculation ? <MethodPicker value={builder.weightBonusCalculation} secondLabel="Total change" percentageHelp="Best when competitors start at different weights. A 4.2% decrease earns 4.2 points." totalHelp="Best when everyone wants raw change. A 10-unit decrease earns 10 points." onChange={builder.setWeightBonusCalculation} /> : null}</View>
        <View style={styles.optionCard}><ToggleRow title="Body-fat change" description="Add a separate set of points for body-fat reduction." value={builder.bodyFatBonusCalculation !== null} onValueChange={(enabled) => builder.setBodyFatBonusCalculation(enabled ? "total_change" : null)} />{builder.bodyFatBonusCalculation ? <MethodPicker value={builder.bodyFatBonusCalculation} secondLabel="Percentage points" percentageHelp="A relative 10% reduction earns 10 points." totalHelp="A drop from 25% to 22% earns 3 points." onChange={builder.setBodyFatBonusCalculation} /> : null}</View>
      </View>
    </View>
    <View style={sharedStyles.centerSection}><Text style={sharedStyles.sectionTitle}>Winner receives</Text><View style={sharedStyles.centerChoices}><ChoiceChip label="Bragging rights" selected={builder.rewardType === "bragging"} onPress={() => builder.setRewardType("bragging")} /><ChoiceChip label="Prize" selected={builder.rewardType === "prize"} onPress={() => builder.setRewardType("prize")} /></View><Text style={sharedStyles.helpCentered}>{builder.rewardType === "prize" ? "Prize details can be announced later." : "No prize value or details required."}</Text></View>
  </>;
}

const styles = StyleSheet.create({
  stack: { gap: 12 }, scoringSection: { gap: 12 },
  alwaysOnCard: { flexDirection: "row", alignItems: "center", gap: 14, padding: 17, borderRadius: 20, backgroundColor: theme.colors.accentSoft },
  alwaysOnIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface },
  alwaysOnCopy: { flex: 1, gap: 2 }, alwaysOnLabel: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "800", fontSize: 8, letterSpacing: 1 }, alwaysOnTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 17 }, alwaysOnBody: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 11, lineHeight: 16 },
  endPointsIntro: { alignItems: "center", gap: 6, paddingTop: 6 }, endPointsEyebrow: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "900", fontSize: 8, letterSpacing: 1.1 },
  options: { gap: 10 }, optionCard: { padding: 12, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, gap: 12 },
  methodArea: { gap: 9, paddingHorizontal: 3, paddingBottom: 3 }, methodPicker: { flexDirection: "row", padding: 4, borderRadius: 14, backgroundColor: theme.colors.subtle },
  methodOption: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, borderRadius: 11 }, methodOptionActive: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.brand },
  methodText: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontWeight: "800", fontSize: 12 }, methodTextActive: { color: theme.colors.brandStrong }, methodHelp: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 11, lineHeight: 17 },
});
