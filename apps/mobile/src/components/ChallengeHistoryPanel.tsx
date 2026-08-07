import { getShipShapePointRules } from "@shipshape/domain";
import { Button, Icon, TaskCheck, theme, useAppDialog, type TaskCheckState } from "@shipshape/ui-mobile";
import * as Haptics from "expo-haptics";
import { useMemo, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ChallengeHistoryDay } from "../features/history/challengeHistoryRepository";
import { useAmendChallengeDay, useChallengeHistory, useChallengeHistoryDay } from "../features/history/useChallengeHistory";

const formatPoints = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toLocaleString()}`;
const formatLongDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
const monthTitle = (key: string) => new Date(`${key}-01T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
const localDateString = (date = new Date()) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};
const shiftMonth = (key: string, amount: number) => {
  const [year, month] = key.split("-").map(Number);
  const shifted = new Date(year, month - 1 + amount, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}`;
};

const toneFor = (day: ChallengeHistoryDay) => {
  if (day.taskCount > 0 && day.completedCount === day.taskCount) return "perfect";
  if (day.pendingCount > 0) return "open";
  if (day.completedCount > 0) return "partial";
  return "missed";
};

export function ChallengeHistoryPanel({ challengeId, challengeStart, challengeEnd, leaving = false, onLeave }: { challengeId: string; challengeStart?: string; challengeEnd?: string; leaving?: boolean; onLeave?: () => void }) {
  const insets = useSafeAreaInsets();
  const history = useChallengeHistory(challengeId);
  const today = localDateString();
  const firstMonth = (challengeStart ?? today).slice(0, 7);
  const lastMonth = (challengeEnd ?? today).slice(0, 7);
  const currentMonth = today.slice(0, 7);
  const initialMonth = currentMonth < firstMonth ? firstMonth : currentMonth > lastMonth ? lastMonth : currentMonth;
  const [visibleMonth, setVisibleMonth] = useState(initialMonth);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const day = useChallengeHistoryDay(challengeId, selectedDate);
  const amend = useAmendChallengeDay(challengeId);
  const { showDialog } = useAppDialog();
  const [draft, setDraft] = useState<{ localDate: string; ids: string[] } | null>(null);

  const rows = useMemo(() => history.data ?? [], [history.data]);
  const editableStart = rows.length ? rows[rows.length - 1].localDate : null;
  const entriesByDate = useMemo(() => new Map(rows.map((entry) => [entry.localDate, entry])), [rows]);
  const calendarDates = useMemo(() => {
    const [year, month] = visibleMonth.split("-").map(Number);
    const first = new Date(year, month - 1, 1);
    const gridStart = new Date(year, month - 1, 1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      return localDateString(date);
    });
  }, [visibleMonth]);
  const canGoPrevious = shiftMonth(visibleMonth, -1) >= firstMonth;
  const canGoNext = shiftMonth(visibleMonth, 1) <= lastMonth;

  const tasks = useMemo(() => day.data ?? [], [day.data]);
  const originalCompletedIds = useMemo(() => tasks.filter((task) => task.status === "complete" || task.status === "pending_review").map((task) => task.occurrenceId), [tasks]);
  const completedIds = draft?.localDate === selectedDate ? draft.ids : originalCompletedIds;

  const editableTasks = tasks.filter((task) => task.status !== "excused");
  const pointRules = getShipShapePointRules(editableTasks.length);
  const baseDayPoints = completedIds.length + (editableTasks.length - completedIds.length) * pointRules.missedTask + (editableTasks.length > 0 && completedIds.length === editableTasks.length ? pointRules.perfectDayBonus : 0);
  const originalKey = [...originalCompletedIds].sort().join(",");
  const selectedKey = [...completedIds].sort().join(",");
  const isDirty = originalKey !== selectedKey;
  const perfectDays = rows.filter((entry) => entry.taskCount > 0 && entry.completedCount === entry.taskCount).length;
  const needsAttention = rows.filter((entry) => entry.pendingCount > 0 || entry.missedCount > 0).length;
  const historyPoints = rows.reduce((total, entry) => total + entry.dayPoints, 0);

  const openDay = (localDate: string) => {
    setDraft(null);
    setSelectedDate(localDate);
  };

  const toggleTask = (occurrenceId: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!selectedDate) return;
    setDraft({ localDate: selectedDate, ids: completedIds.includes(occurrenceId) ? completedIds.filter((id) => id !== occurrenceId) : [...completedIds, occurrenceId] });
  };

  const save = () => {
    if (!selectedDate) return;
    amend.mutate({ localDate: selectedDate, occurrenceIds: completedIds }, {
      onSuccess: (result) => {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSelectedDate(null);
        showDialog({
          icon: result.scoreDelta === 0 ? "flame" : "trophy",
          eyebrow: "HISTORY UPDATED",
          title: result.scoreDelta === 0 ? "Day saved." : `${formatPoints(result.scoreDelta)} points`,
          message: `That day is now worth ${formatPoints(result.dayPoints)} points. Your streaks and rank were recalculated immediately.`,
        });
      },
      onError: (error) => showDialog({ icon: "alert", eyebrow: "COULDN’T UPDATE", title: "That day didn’t save.", message: error instanceof Error ? error.message : "Please try again." }),
    });
  };

  return <>
    <View style={styles.page}>
      <View style={styles.hero}><Text style={styles.eyebrow}>CHALLENGE HISTORY</Text><Text style={styles.title}>Every day counts.</Text><Text style={styles.subtitle}>No service? No problem. Open a past day, record what you actually completed, and your points and streaks will recalculate.</Text></View>

      <View style={styles.summaryCard}>
        <View style={styles.summaryItem}><Text style={styles.summaryValue}>{formatPoints(historyPoints)}</Text><Text style={styles.summaryLabel}>HISTORY POINTS</Text></View>
        <View style={styles.summaryDivider}/>
        <View style={styles.summaryItem}><Text style={styles.summaryValue}>{perfectDays}</Text><Text style={styles.summaryLabel}>PERFECT DAYS</Text></View>
        <View style={styles.summaryDivider}/>
        <View style={styles.summaryItem}><Text style={[styles.summaryValue, needsAttention > 0 && styles.summaryValueAttention]}>{needsAttention}</Text><Text style={styles.summaryLabel}>TO REVIEW</Text></View>
      </View>

      <View style={styles.legend}><View style={styles.legendItem}><View style={[styles.legendDot, styles.legendPerfect]}/><Text style={styles.legendText}>Perfect</Text></View><View style={styles.legendItem}><View style={[styles.legendDot, styles.legendPartial]}/><Text style={styles.legendText}>Partial</Text></View><View style={styles.legendItem}><View style={[styles.legendDot, styles.legendMissed]}/><Text style={styles.legendText}>Missed</Text></View><View style={styles.legendItem}><View style={[styles.legendDot, styles.legendUpcoming]}/><Text style={styles.legendText}>Upcoming</Text></View></View>

      {history.isLoading ? <Text style={styles.subtitle}>Building your challenge history…</Text> : null}
      {history.isError ? <Text style={styles.error}>Your history couldn’t be loaded.</Text> : null}
      <View style={styles.calendarCard}>
        <View style={styles.calendarHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous month" accessibilityState={{ disabled: !canGoPrevious }} disabled={!canGoPrevious} onPress={() => setVisibleMonth((current) => shiftMonth(current, -1))} style={({ pressed }) => [styles.monthButton, !canGoPrevious && styles.monthButtonDisabled, pressed && styles.pressed]}><Icon name="chevron-left" size={19} color={canGoPrevious ? theme.colors.text : theme.colors.textMuted}/></Pressable>
          <View style={styles.monthHeading}><Text style={styles.monthTitle}>{monthTitle(visibleMonth)}</Text><Text style={styles.monthRange}>{challengeStart && challengeEnd ? `${formatLongDate(challengeStart).replace(/^[^,]+, /, "")} — ${formatLongDate(challengeEnd).replace(/^[^,]+, /, "")}` : "Challenge calendar"}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Next month" accessibilityState={{ disabled: !canGoNext }} disabled={!canGoNext} onPress={() => setVisibleMonth((current) => shiftMonth(current, 1))} style={({ pressed }) => [styles.monthButton, !canGoNext && styles.monthButtonDisabled, pressed && styles.pressed]}><Icon name="arrow-right" size={19} color={canGoNext ? theme.colors.text : theme.colors.textMuted}/></Pressable>
        </View>
        <View style={styles.weekdays}>{["S", "M", "T", "W", "T", "F", "S"].map((label, index) => <Text key={`${label}-${index}`} style={styles.weekday}>{label}</Text>)}</View>
        <View style={styles.calendarGrid}>{calendarDates.map((date) => {
          const entry = entriesByDate.get(date);
          const belongsToMonth = date.slice(0, 7) === visibleMonth;
          const belongsToChallenge = (!challengeStart || date >= challengeStart) && (!challengeEnd || date <= challengeEnd);
          const hasHappened = date <= today;
          const belongsToMembership = Boolean(editableStart && date >= editableStart);
          const editable = belongsToChallenge && hasHappened && belongsToMembership && !history.isLoading && !history.isError;
          const stateLabel = !belongsToChallenge ? "not part of this challenge" : !hasHappened ? "upcoming" : !belongsToMembership ? "before your challenge participation began" : entry ? `${entry.completedCount} of ${entry.taskCount} tasks complete, ${formatPoints(entry.dayPoints)} points` : "available to update";
          return <Pressable
            key={date}
            accessibilityRole="button"
            accessibilityLabel={`${formatLongDate(date)}, ${stateLabel}`}
            accessibilityState={{ disabled: !editable }}
            disabled={!editable}
            onPress={() => openDay(date)}
            style={({ pressed }) => [styles.dayCell, entry ? toneFor(entry) === "perfect" ? styles.dayCellPerfect : toneFor(entry) === "partial" ? styles.dayCellPartial : toneFor(entry) === "open" ? styles.dayCellOpen : styles.dayCellMissed : !belongsToChallenge || !belongsToMembership ? styles.dayCellOutsideChallenge : !hasHappened ? styles.dayCellFuture : styles.dayCellOpen, !belongsToMonth && styles.dayCellOutsideMonth, pressed && editable && styles.pressed]}
          ><Text style={[styles.dayNumber, !editable && styles.dayNumberDisabled]}>{Number(date.slice(-2))}</Text><Text style={[styles.dayProgress, !editable && styles.dayProgressDisabled]}>{entry ? `${entry.completedCount}/${entry.taskCount}` : !belongsToChallenge || !belongsToMembership ? "—" : !hasHappened ? "SOON" : "OPEN"}</Text></Pressable>;
        })}</View>
      </View>
      {onLeave ? <View style={styles.membershipCard}><View style={styles.membershipCopy}><Text style={styles.membershipTitle}>Challenge membership</Text><Text style={styles.membershipBody}>Leaving forfeits prize eligibility and you cannot rejoin.</Text></View><Button variant="danger" loading={leaving} onPress={onLeave}>Leave challenge</Button></View> : null}
    </View>

    <Modal visible={Boolean(selectedDate)} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent onRequestClose={() => setSelectedDate(null)}>
      <View style={[styles.modalSafe, { paddingTop: Math.max(insets.top, Platform.OS === "ios" ? 52 : 20) }]}>
        <View style={styles.modalHeader}><View style={styles.modalHeaderCopy}><Text style={styles.eyebrow}>EDIT CHALLENGE DAY</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.modalTitle}>{selectedDate ? formatLongDate(selectedDate) : ""}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close history editor" onPress={() => setSelectedDate(null)} style={styles.closeButton}><Icon name="close" size={20}/></Pressable></View>
        <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="never">
          <View style={styles.dayQuest}><View><Text style={styles.dayQuestLabel}>TASKS COMPLETED</Text><Text style={styles.dayQuestValue}>{completedIds.length}<Text style={styles.dayQuestMax}> / {editableTasks.length}</Text></Text></View><View style={[styles.dayScore, baseDayPoints < 0 && styles.dayScoreDanger]}><Text style={[styles.dayScoreValue, baseDayPoints < 0 && styles.dayScoreValueDanger]}>{formatPoints(baseDayPoints)}</Text><Text style={[styles.dayScoreLabel, baseDayPoints < 0 && styles.dayScoreLabelDanger]}>DAY SCORE*</Text></View></View>
          <Text style={styles.editorHelp}>Tap every task you completed. Tap it again to remove it.</Text>
          {day.isLoading ? <Text style={styles.subtitle}>Loading that day’s tasks…</Text> : null}
          {day.isError ? <Text style={styles.error}>That day couldn’t be loaded.</Text> : null}
          <View style={styles.taskList}>{tasks.map((task) => {
            const state: TaskCheckState = task.status === "excused" ? "locked" : completedIds.includes(task.occurrenceId) ? "selected" : "pending";
            return <TaskCheck key={task.occurrenceId} mode="history" title={task.title} meta={task.meta} points={task.points} state={state} onPress={state === "locked" ? undefined : () => toggleTask(task.occurrenceId)}/>;
          })}</View>
          <View style={styles.recalculationNote}><Icon name="flame" size={19} color={theme.colors.brandStrong}/><Text style={styles.recalculationText}>*Perfect-day and seven-day streak bonuses are recalculated when you save.</Text></View>
        </ScrollView>
        <View style={[styles.modalFooter, { paddingBottom: Math.max(insets.bottom, 10) }]}><Button loading={amend.isPending} disabled={!isDirty || day.isLoading || day.isError} onPress={save}>Save changes</Button></View>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  page:{gap:22},hero:{gap:7},eyebrow:{color:theme.colors.brandStrong,fontFamily:theme.type.body,fontWeight:"900",fontSize:9,letterSpacing:1.35},title:{color:theme.colors.text,fontFamily:theme.type.display,fontSize:44,lineHeight:47,letterSpacing:1.1},subtitle:{color:theme.colors.textSecondary,fontFamily:theme.type.body,fontSize:14,lineHeight:21},error:{color:theme.colors.danger,fontFamily:theme.type.body,fontSize:13},summaryCard:{flexDirection:"row",alignItems:"stretch",padding:15,borderRadius:22,backgroundColor:theme.colors.brandSoft,borderWidth:1,borderColor:theme.colors.brand},summaryItem:{flex:1,alignItems:"center",justifyContent:"center",gap:3},summaryDivider:{width:1,backgroundColor:theme.colors.brand},summaryValue:{color:theme.colors.text,fontFamily:theme.type.display,fontSize:27,lineHeight:29},summaryValueAttention:{color:theme.colors.danger},summaryLabel:{color:theme.colors.textSecondary,textAlign:"center",fontFamily:theme.type.body,fontWeight:"900",fontSize:7,letterSpacing:.65},legend:{flexDirection:"row",alignItems:"center",flexWrap:"wrap",gap:12},legendItem:{flexDirection:"row",alignItems:"center",gap:5},legendDot:{width:9,height:9,borderRadius:5},legendPerfect:{backgroundColor:theme.colors.accent},legendPartial:{backgroundColor:theme.colors.brand},legendMissed:{backgroundColor:theme.colors.dangerSoft,borderWidth:1,borderColor:theme.colors.danger},legendUpcoming:{backgroundColor:theme.colors.subtle,borderWidth:1,borderColor:theme.colors.borderStrong},legendText:{color:theme.colors.textMuted,fontFamily:theme.type.body,fontSize:10},calendarCard:{gap:12,padding:12,borderRadius:24,borderWidth:1,borderColor:theme.colors.border,backgroundColor:theme.colors.surface},calendarHeader:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8},monthButton:{width:42,height:42,borderRadius:21,alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:theme.colors.borderStrong,backgroundColor:theme.colors.surface},monthButtonDisabled:{opacity:.32,backgroundColor:theme.colors.subtle},monthHeading:{flex:1,alignItems:"center",gap:2},monthTitle:{color:theme.colors.text,fontFamily:theme.type.body,fontWeight:"900",fontSize:17},monthRange:{color:theme.colors.textMuted,textAlign:"center",fontFamily:theme.type.body,fontSize:8,lineHeight:12},weekdays:{flexDirection:"row"},weekday:{width:"14.285%",color:theme.colors.textMuted,textAlign:"center",fontFamily:theme.type.body,fontWeight:"900",fontSize:8},calendarGrid:{flexDirection:"row",flexWrap:"wrap",rowGap:7},dayCell:{width:"13.285%",height:53,marginHorizontal:"0.5%",alignItems:"center",justifyContent:"center",gap:2,borderRadius:14,borderWidth:1,borderColor:theme.colors.border,backgroundColor:theme.colors.surface},dayCellPerfect:{borderColor:theme.colors.accent,backgroundColor:theme.colors.accentSoft},dayCellPartial:{borderColor:theme.colors.brand,backgroundColor:theme.colors.brandSoft},dayCellOpen:{borderColor:theme.colors.borderStrong,backgroundColor:theme.colors.surface},dayCellMissed:{borderColor:theme.colors.danger,borderStyle:"dashed",backgroundColor:theme.colors.dangerSoft},dayCellFuture:{borderColor:theme.colors.border,backgroundColor:theme.colors.subtle},dayCellOutsideChallenge:{borderColor:"transparent",backgroundColor:theme.colors.canvas},dayCellOutsideMonth:{opacity:.36},dayNumber:{color:theme.colors.text,fontFamily:theme.type.body,fontWeight:"900",fontSize:13},dayNumberDisabled:{color:theme.colors.textMuted},dayProgress:{color:theme.colors.textMuted,fontFamily:theme.type.body,fontWeight:"800",fontSize:8},dayProgressDisabled:{fontSize:6,color:theme.colors.textMuted},membershipCard:{gap:13,padding:17,borderRadius:22,backgroundColor:theme.colors.dangerSoft},membershipCopy:{gap:4},membershipTitle:{color:theme.colors.danger,fontFamily:theme.type.body,fontWeight:"900",fontSize:15},membershipBody:{color:theme.colors.textSecondary,fontFamily:theme.type.body,fontSize:12,lineHeight:18},pressed:{opacity:.72,transform:[{scale:.98}]},modalSafe:{flex:1,backgroundColor:theme.colors.canvas},modalHeader:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12,paddingHorizontal:20,paddingVertical:12,borderBottomWidth:1,borderBottomColor:theme.colors.border},modalHeaderCopy:{flex:1,minWidth:0,gap:3},modalTitle:{color:theme.colors.text,fontFamily:theme.type.display,fontSize:30,lineHeight:34},closeButton:{width:44,height:44,flexShrink:0,borderRadius:22,alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:theme.colors.border,backgroundColor:theme.colors.surface},modalContent:{padding:20,paddingBottom:36,gap:16},dayQuest:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12,padding:18,borderRadius:23,borderWidth:1,borderColor:theme.colors.brand,backgroundColor:theme.colors.brandSoft},dayQuestLabel:{color:theme.colors.brandStrong,fontFamily:theme.type.body,fontWeight:"900",fontSize:8,letterSpacing:1},dayQuestValue:{color:theme.colors.text,fontFamily:theme.type.display,fontSize:46,lineHeight:48},dayQuestMax:{color:theme.colors.textMuted,fontSize:26},dayScore:{minWidth:105,maxWidth:"45%",alignItems:"center",padding:12,borderRadius:17,backgroundColor:theme.colors.accent},dayScoreDanger:{backgroundColor:theme.colors.dangerSoft,borderWidth:1,borderColor:theme.colors.danger},dayScoreValue:{color:theme.colors.text,fontFamily:theme.type.display,fontSize:31,lineHeight:33},dayScoreValueDanger:{color:theme.colors.danger},dayScoreLabel:{color:theme.colors.textSecondary,textAlign:"center",fontFamily:theme.type.body,fontWeight:"900",fontSize:7,letterSpacing:.75},dayScoreLabelDanger:{color:theme.colors.danger},editorHelp:{color:theme.colors.textSecondary,fontFamily:theme.type.body,fontSize:12,lineHeight:18},taskList:{gap:11},recalculationNote:{flexDirection:"row",alignItems:"center",gap:9,padding:13,borderRadius:15,backgroundColor:theme.colors.accentSoft},recalculationText:{flex:1,color:theme.colors.textSecondary,fontFamily:theme.type.body,fontSize:11,lineHeight:16},modalFooter:{paddingHorizontal:20,paddingTop:12,paddingBottom:10,borderTopWidth:1,borderTopColor:theme.colors.border,backgroundColor:theme.colors.canvas},
});
