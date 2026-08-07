import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import type { TaskCatalogItem } from "@shipshape/api";
import { getShipShapePointRules } from "@shipshape/domain";
import { BackButton, Button, ChoiceChip, Icon, theme, useAppDialog } from "@shipshape/ui-mobile";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createChallengeDraft, publishChallenge } from "../src/features/challenges/challengeRepository";
import { challengeKeys } from "../src/features/challenges/useChallenges";
import { useTaskCatalog } from "../src/features/catalog/useTaskCatalog";

const stepLabels = ["Basics", "Stakes", "Tasks", "Rules"] as const;
const visibilityOptions = ["public", "private"] as const;
type Visibility = (typeof visibilityOptions)[number];
type RewardType = "bragging" | "prize";
type BonusMetric = "none" | "weight" | "body_fat";
type BonusCalculation = "percentage" | "total_change";
type OpenDate = "start" | "end" | null;

const bonusOptions: { id: BonusMetric; title: string; description: string; badge: string }[] = [
  { id: "none", title: "No extra metric", description: "Leaderboard points come from completed tasks, missed-task penalties, perfect days, and streak bonuses.", badge: "SIMPLE" },
  { id: "weight", title: "Add weight change", description: "Weight progress adds bonus points on top of every ShipShape point earned.", badge: "EXTRA" },
  { id: "body_fat", title: "Add body-fat change", description: "Body-fat progress adds bonus points on top of every ShipShape point earned.", badge: "EXTRA" },
];

interface TaskConfiguration {
  instructions: string;
  targetValue: string;
  unit: string;
}

const dateValue = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

const dateFromValue = (value: string) => new Date(`${value}T12:00:00`);
const isMeasurable = (task: TaskCatalogItem) => ["count", "quantity", "duration"].includes(task.taskType);

function DateField({ label, value, minimumDate, open, onToggle, onClose, onChange }: { label: string; value: string; minimumDate: Date; open: boolean; onToggle: () => void; onClose: () => void; onChange: (value: string) => void }) {
  const selectedDate = dateFromValue(value);
  const handleChange = (_event: DateTimePickerEvent, next?: Date) => {
    if (Platform.OS === "android") onClose();
    if (next) onChange(dateValue(next));
  };

  return (
    <View style={styles.dateField}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${selectedDate.toLocaleDateString()}`} onPress={onToggle} style={({ pressed }) => [styles.dateButton, open && styles.dateButtonOpen, pressed && styles.pressed]}>
        <View style={styles.dateCopy}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.dateText}>{selectedDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</Text>
        </View>
        <View style={styles.dateIcon}><Icon name="calendar" size={20} color={theme.colors.brandStrong} /></View>
      </Pressable>
      {open ? (
        <View style={styles.pickerCard}>
          <DateTimePicker value={selectedDate} mode="date" display={Platform.OS === "ios" ? "inline" : "default"} minimumDate={minimumDate} onChange={handleChange} themeVariant="light" />
          {Platform.OS === "ios" ? <Button size="sm" variant="secondary" onPress={onClose}>Use this date</Button> : null}
        </View>
      ) : null}
    </View>
  );
}

export default function CreateChallengeScreen() {
  const queryClient = useQueryClient();
  const { showDialog } = useAppDialog();
  const catalog = useTaskCatalog();
  const scrollRef = useRef<ScrollView>(null);
  const defaults = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 89);
    return { startsOn: dateValue(start), endsOn: dateValue(end), today: start };
  }, []);

  const [step, setStep] = useState(0);
  const [openDate, setOpenDate] = useState<OpenDate>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [startsOn, setStartsOn] = useState(defaults.startsOn);
  const [endsOn, setEndsOn] = useState(defaults.endsOn);
  const [rewardType, setRewardType] = useState<RewardType>("bragging");
  const [bonusMetric, setBonusMetric] = useState<BonusMetric>("none");
  const [bonusCalculation, setBonusCalculation] = useState<BonusCalculation>("percentage");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [taskConfig, setTaskConfig] = useState<Record<string, TaskConfiguration>>({});
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reward = rewardType === "bragging" ? "Bragging rights" : "Prize";
  const pointRules = getShipShapePointRules(selectedIds.length);

  const toggleTask = (task: TaskCatalogItem) => {
    setError(null);
    setSelectedIds((current) => {
      if (current.includes(task.id)) {
        const next = current.filter((id) => id !== task.id);
        if (editingTaskId === task.id) setEditingTaskId(next[0] ?? null);
        return next;
      }
      if (current.length >= 20) return current;
      setTaskConfig((config) => ({
        ...config,
        [task.id]: config[task.id] ?? {
          instructions: task.description,
          targetValue: task.defaultTargetValue?.toString() ?? "",
          unit: task.defaultUnit ?? task.allowedUnits[0] ?? "",
        },
      }));
      return [...current, task.id];
    });
  };

  const updateTask = (id: string, update: Partial<TaskConfiguration>) => {
    setTaskConfig((current) => ({ ...current, [id]: { ...current[id], ...update } }));
    setError(null);
  };

  const selectedTasksValid = selectedIds.every((id) => {
    const task = catalog.data?.find((item) => item.id === id);
    const config = taskConfig[id];
    if (!task || !config) return false;
    if (!isMeasurable(task)) return true;
    return Number(config.targetValue) > 0 && Boolean(config.unit);
  });

  const stepValid = [
    name.trim().length >= 2,
    endsOn >= startsOn && endsOn >= defaults.startsOn,
    selectedIds.length > 0,
    selectedTasksValid,
  ][step];

  const activeTaskId = selectedIds.includes(editingTaskId ?? "") ? editingTaskId : selectedIds[0] ?? null;
  const activeTask = catalog.data?.find((task) => task.id === activeTaskId);
  const activeConfig = activeTaskId ? taskConfig[activeTaskId] : undefined;

  const changeStartDate = (next: string) => {
    setStartsOn(next);
    if (endsOn < next) setEndsOn(next);
  };

  const moveToStep = (next: number) => {
    setOpenDate(null);
    setError(null);
    if (next === 3 && !editingTaskId) setEditingTaskId(selectedIds[0] ?? null);
    setStep(next);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
  };

  const goBack = () => {
    if (step === 0) router.back();
    else moveToStep(step - 1);
  };

  const save = async () => {
    if (!stepValid) return;
    setSaving(true);
    setError(null);
    try {
      const challengeId = await createChallengeDraft({
        name,
        description,
        visibility,
        joinPolicy: visibility === "private" ? "approval" : "open",
        startsOn,
        endsOn,
        reward,
        bonusMetric,
        bonusCalculation: bonusMetric === "none" ? null : bonusCalculation,
        tasks: selectedIds.map((catalogTaskId) => ({
          catalogTaskId,
          instructions: taskConfig[catalogTaskId]?.instructions.trim() ?? "",
          targetValue: taskConfig[catalogTaskId]?.targetValue ? Number(taskConfig[catalogTaskId].targetValue) : null,
          unit: taskConfig[catalogTaskId]?.unit || null,
        })),
      });
      const status = await publishChallenge(challengeId);
      await queryClient.invalidateQueries({ queryKey: challengeKeys.all });
      showDialog({ icon: "trophy", eyebrow: status === "active" ? "CHALLENGE LIVE" : "CHALLENGE PUBLISHED", title: status === "active" ? "Let’s get to work." : "Registration is open.", message: status === "active" ? "Today’s tasks are ready." : "The tasks begin on the start date.", actions: [{ label: "Continue", onPress: () => router.replace(status === "active" ? `/challenge/${challengeId}` : "/(tabs)/challenges") }] });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't publish that challenge.");
    } finally {
      setSaving(false);
    }
  };

  const primaryAction = () => {
    if (step < 3) moveToStep(step + 1);
    else void save();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <BackButton onPress={goBack} />
          <View style={styles.headerCopy}><Text style={styles.headerStep}>STEP {step + 1} OF 4</Text><Text style={styles.headerLabel}>{stepLabels[step]}</Text></View>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.progress}>{stepLabels.map((label, index) => <View key={label} style={[styles.progressTrack, index <= step && styles.progressTrackActive]} />)}</View>

        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={8}>
          <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {step === 0 ? (
              <>
                <View style={styles.stepHero}>
                  <Text style={styles.eyebrow}>START WITH THE IDEA</Text>
                  <Text style={styles.stepTitle}>What are we doing?</Text>
                  <Text style={styles.stepSubtitle}>Give people one clear reason to show up every day.</Text>
                </View>
                <View style={styles.formCard}>
                  <View style={styles.field}><Text style={styles.label}>CHALLENGE NAME</Text><TextInput value={name} onChangeText={setName} placeholder="90 Strong" placeholderTextColor={theme.colors.textMuted} maxLength={80} style={styles.input} /></View>
                  <View style={styles.field}><Text style={styles.label}>SHORT DESCRIPTION</Text><TextInput value={description} onChangeText={setDescription} placeholder="What are people committing to?" placeholderTextColor={theme.colors.textMuted} multiline maxLength={1000} style={[styles.input, styles.textarea]} /></View>
                </View>
                <View style={styles.centerSection}>
                  <Text style={styles.sectionTitle}>Who can join?</Text>
                  <View style={styles.centerChoices}>{visibilityOptions.map((item) => <ChoiceChip key={item} label={item === "public" ? "Anyone" : "Invite only"} selected={visibility === item} onPress={() => setVisibility(item)} />)}</View>
                  <Text style={styles.helpCentered}>{visibility === "public" ? "Visible to everyone in Explore. Anyone can join." : "A private code is created automatically. People with it can request to join."}</Text>
                </View>
              </>
            ) : null}

            {step === 1 ? (
              <>
                <View style={styles.stepHero}>
                  <Text style={styles.eyebrow}>TIMELINE & STAKES</Text>
                  <Text style={styles.stepTitle}>Define the win.</Text>
                  <Text style={styles.stepSubtitle}>Set the dates, how the leaderboard works, and what is at stake.</Text>
                </View>
                <View style={styles.stack}>
                  <DateField label="STARTS" value={startsOn} minimumDate={defaults.today} open={openDate === "start"} onToggle={() => setOpenDate(openDate === "start" ? null : "start")} onClose={() => setOpenDate(null)} onChange={changeStartDate} />
                  <DateField label="ENDS" value={endsOn} minimumDate={dateFromValue(startsOn)} open={openDate === "end"} onToggle={() => setOpenDate(openDate === "end" ? null : "end")} onClose={() => setOpenDate(null)} onChange={setEndsOn} />
                </View>
                <View style={styles.scoringSection}>
                  <View style={styles.alwaysOnCard}><View style={styles.alwaysOnIcon}><Icon name="flame" size={25} color={theme.colors.brandStrong}/></View><View style={styles.alwaysOnCopy}><Text style={styles.alwaysOnLabel}>ALWAYS ON</Text><Text style={styles.alwaysOnTitle}>ShipShape Points</Text><Text style={styles.alwaysOnBody}>+1 per completed task and −3 per missed task. Perfect-day and 7-day streak bonuses scale automatically with the number of daily tasks.</Text></View></View>
                  <Text style={styles.sectionTitle}>Add extra scoring?</Text>
                  <Text style={styles.helpCentered}>Body progress is optional and always adds to ShipShape Points.</Text>
                  <View style={styles.scoringOptions}>
                    {bonusOptions.map((option) => {
                      const selected = bonusMetric === option.id;
                      return (
                        <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => setBonusMetric(option.id)} style={({ pressed }) => [styles.scoringCard, selected && styles.scoringCardSelected, pressed && styles.pressed]}>
                          <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View>
                          <View style={styles.scoringCopy}>
                            <View style={styles.scoringTitleRow}><Text style={styles.scoringTitle}>{option.title}</Text><Text style={[styles.scoringBadge, selected && styles.scoringBadgeSelected]}>{option.badge}</Text></View>
                            <Text style={styles.scoringBody}>{option.description}</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                  {bonusMetric !== "none" ? <View style={styles.calculationCard}><Text style={styles.label}>HOW SHOULD CHANGE ADD POINTS?</Text><View style={styles.centerChoices}><ChoiceChip label="Percentage change" selected={bonusCalculation === "percentage"} onPress={() => setBonusCalculation("percentage")} /><ChoiceChip label="Total change" selected={bonusCalculation === "total_change"} onPress={() => setBonusCalculation("total_change")} /></View><Text style={styles.helpCentered}>{bonusCalculation === "percentage" ? "A 4.2% decrease adds 4.2 bonus points." : bonusMetric === "weight" ? "A 10 lb decrease adds 10 bonus points." : "A 3-point body-fat decrease adds 3 bonus points."}</Text></View> : null}
                </View>
                <View style={styles.centerSection}>
                  <Text style={styles.sectionTitle}>Winner receives</Text>
                  <View style={styles.centerChoices}>
                    <ChoiceChip label="Bragging rights" selected={rewardType === "bragging"} onPress={() => setRewardType("bragging")} />
                    <ChoiceChip label="Prize" selected={rewardType === "prize"} onPress={() => setRewardType("prize")} />
                  </View>
                  <Text style={styles.helpCentered}>{rewardType === "prize" ? "Prize details can be announced later." : "No prize value or details required."}</Text>
                </View>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <View style={styles.stepHero}>
                  <Text style={styles.eyebrow}>DAILY TASKS</Text>
                  <Text style={styles.stepTitle}>Choose the work.</Text>
                  <Text style={styles.stepSubtitle}>Tap every task participants must complete each day. You’ll set the exact targets next.</Text>
                  <View style={styles.countBadge}><Text style={styles.countValue}>{selectedIds.length}</Text><Text style={styles.countLabel}>SELECTED</Text></View>
                </View>
                {catalog.isLoading ? <Text style={styles.helpCentered}>Loading task library…</Text> : null}
                {catalog.isError ? <Text style={styles.error}>The task library couldn’t load.</Text> : null}
                <View style={styles.taskGrid}>
                  {(catalog.data ?? []).map((task) => {
                    const selected = selectedIds.includes(task.id);
                    return (
                      <Pressable key={task.id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => toggleTask(task)} style={({ pressed }) => [styles.taskTile, selected && styles.taskTileSelected, pressed && styles.pressed]}>
                        <View style={[styles.tileState, selected && styles.tileStateSelected]}><Text style={[styles.tileStateText, selected && styles.tileStateTextSelected]}>{selected ? "SELECTED" : "AVAILABLE"}</Text></View>
                        <Text style={styles.tileTitle}>{task.title}</Text>
                        <Text numberOfLines={3} style={styles.tileBody}>{task.description}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.noteCard}><Text style={styles.noteTitle}>One task list, all day</Text><Text style={styles.noteBody}>Every selected task is available until the daily deadline—no morning or evening buckets.</Text></View>
              </>
            ) : null}

            {step === 3 ? (
              <>
                <View style={styles.stepHero}>
                  <Text style={styles.eyebrow}>DEFINE THE RULES</Text>
                  <Text style={styles.stepTitle}>Make each task clear.</Text>
                  <Text style={styles.stepSubtitle}>Configure one task at a time. Everyone will see these exact targets.</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.taskTabs}>
                  {selectedIds.map((id) => {
                    const task = catalog.data?.find((item) => item.id === id);
                    return task ? <ChoiceChip key={id} label={task.title} selected={activeTaskId === id} onPress={() => setEditingTaskId(id)} /> : null;
                  })}
                </ScrollView>
                {activeTask && activeConfig && activeTaskId ? (
                  <View style={styles.editorCard}>
                    <View style={styles.editorHeader}><View style={styles.editorNumber}><Text style={styles.editorNumberText}>{selectedIds.indexOf(activeTaskId) + 1}</Text></View><View style={styles.editorTitleCopy}><Text style={styles.editorTitle}>{activeTask.title}</Text><Text style={styles.editorMeta}>{selectedIds.indexOf(activeTaskId) + 1} of {selectedIds.length} tasks</Text></View></View>
                    {isMeasurable(activeTask) ? (
                      <View style={styles.targetArea}>
                        <View style={styles.targetField}><Text style={styles.label}>DAILY TARGET</Text><TextInput value={activeConfig.targetValue} onChangeText={(value) => updateTask(activeTaskId, { targetValue: value.replace(/[^0-9.]/g, "") })} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={theme.colors.textMuted} style={styles.targetInput} /></View>
                        <View style={styles.unitField}><Text style={styles.label}>MEASURED IN</Text><View style={styles.unitChoices}>{activeTask.allowedUnits.map((unit) => <ChoiceChip key={unit} label={unit} selected={activeConfig.unit === unit} onPress={() => updateTask(activeTaskId, { unit })} />)}</View></View>
                      </View>
                    ) : null}
                    <View style={styles.field}><Text style={styles.label}>WHAT COUNTS?</Text><TextInput value={activeConfig.instructions} onChangeText={(instructions) => updateTask(activeTaskId, { instructions })} placeholder="Describe exactly what counts" placeholderTextColor={theme.colors.textMuted} multiline maxLength={500} style={[styles.input, styles.ruleInput]} /></View>
                    {activeTask.safetyNote ? <Text style={styles.safety}>{activeTask.safetyNote}</Text> : null}
                  </View>
                ) : null}
                <View style={styles.reviewCard}>
                  <Text style={styles.reviewEyebrow}>READY TO PUBLISH</Text>
                  <Text style={styles.reviewTitle}>{name}</Text>
                  <Text style={styles.reviewMeta}>{selectedIds.length} daily tasks · {dateFromValue(startsOn).toLocaleDateString(undefined, { month: "short", day: "numeric" })}–{dateFromValue(endsOn).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Text>
                  <Text style={styles.reviewScoring}>ShipShape Points · +1 complete · −3 missed · +{pointRules.perfectDayBonus} perfect day · +{pointRules.sevenDayStreakBonus} streak{bonusMetric === "none" ? "" : ` · ${bonusMetric === "weight" ? "weight" : "body-fat"} ${bonusCalculation === "percentage" ? "%" : "total"} bonus`}</Text>
                  <View style={styles.reviewPrize}><Icon name="trophy" size={18} color={theme.colors.brandStrong} /><Text style={styles.reviewPrizeText}>{reward}</Text></View>
                </View>
              </>
            ) : null}

            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          </ScrollView>

          <View style={styles.footer}>
            <Button disabled={!stepValid} loading={saving} trailingIcon={step < 3 ? "arrow-right" : undefined} onPress={primaryAction}>{step < 3 ? step === 2 ? `Set rules for ${selectedIds.length} task${selectedIds.length === 1 ? "" : "s"}` : "Continue" : startsOn <= defaults.startsOn ? "Publish and start" : "Publish challenge"}</Button>
          </View>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.canvas },
  screen: { flex: 1 },
  flex: { flex: 1 },
  header: { minHeight: 62, flexDirection: "row", alignItems: "center", paddingHorizontal: 20, gap: 12 },
  headerCopy: { flex: 1, alignItems: "center", gap: 2 },
  headerStep: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "800", fontSize: 8, letterSpacing: 1.2 },
  headerLabel: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 14 },
  headerSpacer: { width: 44 },
  progress: { flexDirection: "row", gap: 6, paddingHorizontal: 24, paddingBottom: 12 },
  progressTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: theme.colors.border },
  progressTrackActive: { backgroundColor: theme.colors.brand },
  content: { paddingHorizontal: 24, paddingTop: 22, paddingBottom: 32, gap: 24 },
  stepHero: { alignItems: "center", gap: 8, paddingHorizontal: 8 },
  eyebrow: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "800", fontSize: 9, letterSpacing: 1.4, textAlign: "center" },
  stepTitle: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 43, lineHeight: 46, letterSpacing: 1.1, textAlign: "center" },
  stepSubtitle: { maxWidth: 330, color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 14, lineHeight: 21, textAlign: "center" },
  formCard: { padding: 18, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, gap: 18 },
  field: { gap: 8 },
  label: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontWeight: "800", fontSize: 9, letterSpacing: 1.1 },
  input: { minHeight: 54, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface, color: theme.colors.text, fontFamily: theme.type.body, fontSize: 15 },
  textarea: { minHeight: 92, paddingTop: 15, textAlignVertical: "top" },
  centerSection: { alignItems: "center", gap: 12 },
  sectionTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 19, textAlign: "center" },
  centerChoices: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 9 },
  helpCentered: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 12, lineHeight: 18, textAlign: "center" },
  stack: { gap: 12 },
  dateField: { gap: 8 },
  dateButton: { minHeight: 70, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  dateButtonOpen: { borderColor: theme.colors.brand },
  dateCopy: { gap: 4 },
  dateText: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 17 },
  dateIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.brandSoft },
  pickerCard: { padding: 12, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, gap: 10 },
  scoringSection: { gap: 12 },
  alwaysOnCard: { flexDirection: "row", alignItems: "center", gap: 14, padding: 17, borderRadius: 20, backgroundColor: theme.colors.accentSoft },
  alwaysOnIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface },
  alwaysOnCopy: { flex: 1, gap: 2 }, alwaysOnLabel: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "800", fontSize: 8, letterSpacing: 1 }, alwaysOnTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 17 }, alwaysOnBody: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 11, lineHeight: 16 },
  scoringOptions: { gap: 10 },
  scoringCard: { minHeight: 92, flexDirection: "row", alignItems: "flex-start", gap: 13, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  scoringCardSelected: { borderColor: theme.colors.brand, backgroundColor: theme.colors.brandSoft },
  radio: { width: 22, height: 22, marginTop: 1, borderRadius: 11, borderWidth: 2, borderColor: theme.colors.borderStrong, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface },
  radioSelected: { borderColor: theme.colors.brand },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.brand },
  scoringCopy: { flex: 1, gap: 6 },
  scoringTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  scoringTitle: { flex: 1, color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 16 },
  scoringBadge: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 999, color: theme.colors.textMuted, backgroundColor: theme.colors.subtle, fontFamily: theme.type.body, fontWeight: "800", fontSize: 7, letterSpacing: 0.8 },
  scoringBadgeSelected: { color: theme.colors.brandStrong, backgroundColor: theme.colors.surface },
  scoringBody: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 12, lineHeight: 18 },
  calculationCard: { alignItems: "center", gap: 11, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  countBadge: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 6, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, backgroundColor: theme.colors.brandSoft },
  countValue: { color: theme.colors.brandStrong, fontFamily: theme.type.display, fontSize: 23 },
  countLabel: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "800", fontSize: 8, letterSpacing: 1 },
  taskGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
  taskTile: { width: "48.2%", minHeight: 152, padding: 15, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, gap: 8 },
  taskTileSelected: { borderColor: theme.colors.brand, backgroundColor: theme.colors.brandSoft },
  tileState: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: theme.colors.subtle },
  tileStateSelected: { backgroundColor: theme.colors.brand },
  tileStateText: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontWeight: "900", fontSize: 7, letterSpacing: .8 },
  tileStateTextSelected: { color: "#fff" },
  tileTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 14 },
  tileBody: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 11, lineHeight: 16 },
  noteCard: { alignItems: "center", padding: 17, borderRadius: 18, backgroundColor: theme.colors.subtle, gap: 4 },
  noteTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 14 },
  noteBody: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 11, lineHeight: 17, textAlign: "center" },
  taskTabs: { gap: 8, paddingRight: 24 },
  editorCard: { padding: 18, borderRadius: 22, borderWidth: 1, borderColor: theme.colors.brand, backgroundColor: theme.colors.surface, gap: 20 },
  editorHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  editorNumber: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.brand },
  editorNumberText: { color: "#fff", fontFamily: theme.type.display, fontSize: 25 },
  editorTitleCopy: { flex: 1 },
  editorTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 18 },
  editorMeta: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 11, marginTop: 2 },
  targetArea: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  targetField: { width: 112, gap: 8 },
  unitField: { flex: 1, gap: 8 },
  targetInput: { minHeight: 48, paddingHorizontal: 13, borderRadius: 13, borderWidth: 1, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.canvas, color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 17 },
  unitChoices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  ruleInput: { minHeight: 90, paddingTop: 14, textAlignVertical: "top", backgroundColor: theme.colors.canvas },
  safety: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 10, lineHeight: 16 },
  reviewCard: { alignItems: "center", padding: 20, borderRadius: 20, backgroundColor: theme.colors.accentSoft, gap: 5 },
  reviewEyebrow: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontWeight: "800", fontSize: 8, letterSpacing: 1.1 },
  reviewTitle: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 32, textAlign: "center" },
  reviewMeta: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 11, textAlign: "center" },
  reviewScoring: { marginTop: 7, color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "800", fontSize: 12 },
  reviewPrize: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  reviewPrizeText: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 13 },
  footer: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 10, borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.canvas },
  error: { color: theme.colors.danger, fontFamily: theme.type.body, fontSize: 12, lineHeight: 18, textAlign: "center" },
  pressed: { opacity: 0.74 },
});
