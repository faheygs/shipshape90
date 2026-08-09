import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import type { TaskCatalogItem } from "@shipshape/api";
import { getShipShapePointRules } from "@shipshape/domain";
import { BackButton, Button, ChoiceChip, Icon, theme, useAppDialog } from "@shipshape/ui-mobile";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView, type KeyboardAwareScrollViewRef } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { createChallenge } from "../src/features/challenges/challengeRepository";
import { challengeKeys, useChallenges } from "../src/features/challenges/useChallenges";
import { useTaskCatalog } from "../src/features/catalog/useTaskCatalog";
import { AppKeyboardToolbar } from "../src/components/AppKeyboardToolbar";
import { closeRealtimeConnection, refreshRealtimeAuthorization } from "../src/features/realtime/realtimeClient";

const stepLabels = ["Basics", "Stakes", "Check-ins", "Tasks", "Rules"] as const;
const visibilityOptions = ["public", "private"] as const;
type Visibility = (typeof visibilityOptions)[number];
type RewardType = "bragging" | "prize";
type BonusCalculation = "percentage" | "total_change";
type OpenDate = "start" | "end" | null;
type CheckpointPreset = "simple" | "halfway" | "milestones" | "custom";

interface CheckpointDraft {
  id: string;
  kind: "start" | "milestone" | "final";
  label: string;
  dayNumber: string;
  requiresWeight: boolean;
  requiresBodyFat: boolean;
  requiresPhoto: boolean;
}

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
const challengeDays = (start: string, end: string) => Math.max(2, Math.round((dateFromValue(end).getTime() - dateFromValue(start).getTime()) / 86_400_000) + 1);

const checkpointDraft = (id: string, kind: CheckpointDraft["kind"], label: string, dayNumber: number): CheckpointDraft => ({
  id,
  kind,
  label,
  dayNumber: String(dayNumber),
  requiresWeight: true,
  requiresBodyFat: kind !== "milestone",
  requiresPhoto: kind !== "milestone",
});

function DateField({ label, value, minimumDate, open, onToggle, onClose, onChange }: { label: string; value: string; minimumDate: Date; open: boolean; onToggle: () => void; onClose: () => void; onChange: (value: string) => void }) {
  const selectedDate = dateFromValue(value);
  const handleChange = (_event: DateTimePickerEvent, next?: Date) => {
    if (next) {
      onChange(dateValue(next));
      onClose();
    } else if (Platform.OS === "android") onClose();
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
          <DateTimePicker value={selectedDate} mode="date" display={Platform.OS === "ios" ? "inline" : "default"} minimumDate={minimumDate} onChange={handleChange} themeVariant="light" accentColor={theme.colors.brand} />
        </View>
      ) : null}
    </View>
  );
}

function ToggleRow({ title, description, value, locked = false, onValueChange }: { title: string; description: string; value: boolean; locked?: boolean; onValueChange: (value: boolean) => void }) {
  return <View style={[styles.toggleRow, value && styles.toggleRowActive]}>
    <View style={styles.toggleCopy}><Text style={styles.toggleTitle}>{title}</Text><Text style={styles.toggleDescription}>{description}</Text></View>
    <Switch
      accessibilityLabel={title}
      value={value}
      disabled={locked}
      onValueChange={onValueChange}
      trackColor={{ false: theme.colors.borderStrong, true: theme.colors.brand }}
      thumbColor={theme.colors.surface}
      ios_backgroundColor={theme.colors.borderStrong}
    />
  </View>;
}

export default function CreateChallengeScreen() {
  const queryClient = useQueryClient();
  const { showDialog } = useAppDialog();
  const catalog = useTaskCatalog();
  const challenges = useChallenges();
  const scrollRef = useRef<KeyboardAwareScrollViewRef>(null);
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
  const [weightBonusCalculation, setWeightBonusCalculation] = useState<BonusCalculation | null>(null);
  const [bodyFatBonusCalculation, setBodyFatBonusCalculation] = useState<BonusCalculation | null>(null);
  const [checkpointPreset, setCheckpointPreset] = useState<CheckpointPreset>("milestones");
  const [checkpoints, setCheckpoints] = useState<CheckpointDraft[]>(() => [
    checkpointDraft("start", "start", "Start", 1),
    checkpointDraft("milestone-1", "milestone", "First milestone", 30),
    checkpointDraft("milestone-2", "milestone", "Second milestone", 60),
    checkpointDraft("final", "final", "Final", 90),
  ]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [taskConfig, setTaskConfig] = useState<Record<string, TaskConfiguration>>({});
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reward = rewardType === "bragging" ? "Bragging rights" : "Prize";
  const pointRules = getShipShapePointRules(selectedIds.length);
  const durationDays = challengeDays(startsOn, endsOn);
  const endMinimumDate = dateFromValue(startsOn);
  endMinimumDate.setDate(endMinimumDate.getDate() + 1);

  const applyCheckpointPreset = (preset: CheckpointPreset) => {
    const start = checkpointDraft("start", "start", "Start", 1);
    const final = checkpointDraft("final", "final", "Final", durationDays);
    const halfway = Math.max(2, Math.min(durationDays - 1, Math.round((durationDays + 1) / 2)));
    const firstThird = Math.max(2, Math.round(durationDays / 3));
    const secondThird = Math.min(durationDays - 1, Math.round(durationDays * 2 / 3));
    setCheckpointPreset(preset);
    if (preset === "simple") setCheckpoints([start, final]);
    else if (preset === "halfway") setCheckpoints([start, checkpointDraft("milestone-1", "milestone", "Halfway", halfway), final]);
    else if (preset === "milestones") setCheckpoints([start, checkpointDraft("milestone-1", "milestone", "First milestone", firstThird), checkpointDraft("milestone-2", "milestone", "Second milestone", secondThird), final]);
    else setCheckpoints([start, final]);
  };

  const updateCheckpoint = (id: string, update: Partial<CheckpointDraft>) => {
    setCheckpoints((current) => current.map((checkpoint) => checkpoint.id === id ? { ...checkpoint, ...update } : checkpoint));
    setError(null);
  };

  const addCheckpoint = () => {
    const milestones = checkpoints.filter((checkpoint) => checkpoint.kind === "milestone");
    if (milestones.length >= 3 || durationDays <= 2) return;
    const candidate = Math.max(2, Math.min(durationDays - 1, Math.round(durationDays * (milestones.length + 1) / (milestones.length + 2))));
    setCheckpointPreset("custom");
    setCheckpoints((current) => [...current.filter((item) => item.kind !== "final"), checkpointDraft(`milestone-${Date.now()}`, "milestone", `Milestone ${milestones.length + 1}`, candidate), current.find((item) => item.kind === "final")!]);
  };

  const removeCheckpoint = (id: string) => {
    setCheckpointPreset("custom");
    setCheckpoints((current) => current.filter((checkpoint) => checkpoint.id !== id));
  };

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

  const checkpointsValid = checkpoints.length >= 2 && checkpoints.length <= 5
    && checkpoints.filter((checkpoint) => checkpoint.kind === "start").length === 1
    && checkpoints.filter((checkpoint) => checkpoint.kind === "final").length === 1
    && new Set(checkpoints.map((checkpoint) => Number(checkpoint.dayNumber))).size === checkpoints.length
    && checkpoints.every((checkpoint) => {
      const day = Number(checkpoint.dayNumber);
      const forcedWeight = (checkpoint.kind === "start" || checkpoint.kind === "final") && weightBonusCalculation !== null;
      const forcedBodyFat = (checkpoint.kind === "start" || checkpoint.kind === "final") && bodyFatBonusCalculation !== null;
      return Number.isInteger(day) && day >= 1 && day <= durationDays
        && (checkpoint.kind !== "milestone" || (day > 1 && day < durationDays))
        && (checkpoint.requiresPhoto || checkpoint.requiresWeight || checkpoint.requiresBodyFat || forcedWeight || forcedBodyFat);
    });

  const stepValid = [
    name.trim().length >= 2,
    endsOn > startsOn && endsOn >= defaults.startsOn,
    checkpointsValid,
    selectedIds.length > 0,
    selectedTasksValid,
  ][step];

  const activeTaskId = selectedIds.includes(editingTaskId ?? "") ? editingTaskId : selectedIds[0] ?? null;
  const activeTask = catalog.data?.find((task) => task.id === activeTaskId);
  const activeConfig = activeTaskId ? taskConfig[activeTaskId] : undefined;

  const changeStartDate = (next: string) => {
    setStartsOn(next);
    const minimumEnd = dateFromValue(next);
    minimumEnd.setDate(minimumEnd.getDate() + 1);
    const nextEnd = endsOn <= next ? dateValue(minimumEnd) : endsOn;
    if (endsOn <= next) setEndsOn(nextEnd);
    const nextDuration = challengeDays(next, nextEnd);
    setCheckpoints((current) => current.map((checkpoint) => checkpoint.kind === "final" ? { ...checkpoint, dayNumber: String(nextDuration) } : checkpoint));
  };

  const changeEndDate = (next: string) => {
    setEndsOn(next);
    const nextDuration = challengeDays(startsOn, next);
    setCheckpoints((current) => current.map((checkpoint) => checkpoint.kind === "final" ? { ...checkpoint, dayNumber: String(nextDuration) } : checkpoint));
  };

  const moveToStep = (next: number) => {
    setOpenDate(null);
    setError(null);
    if (next === 4 && !editingTaskId) setEditingTaskId(selectedIds[0] ?? null);
    setStep(next);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
  };

  const goBack = () => {
    if (step === 0) router.back();
    else moveToStep(step - 1);
  };

  const openHostControls = (challengeId: string) => {
    router.replace({ pathname: "/manage-challenge/[id]", params: { id: challengeId } });
  };

  const save = async (allowAutoSwitch = false, replaceExistingQueue = false) => {
    if (!stepValid) return;
    setSaving(true);
    setError(null);
    try {
      const challengeInput = {
        name,
        description,
        visibility,
        joinPolicy: visibility === "private" ? "approval" : "open",
        startsOn,
        endsOn,
        reward,
        weightBonusCalculation,
        bodyFatBonusCalculation,
        checkpoints: checkpoints
          .map((checkpoint) => ({
            kind: checkpoint.kind,
            label: checkpoint.label.trim(),
            dayNumber: Number(checkpoint.dayNumber),
            requiresWeight: checkpoint.kind === "start" || checkpoint.kind === "final" ? true : checkpoint.requiresWeight,
            requiresBodyFat: checkpoint.kind === "start" || checkpoint.kind === "final" ? true : checkpoint.requiresBodyFat,
            requiresPhoto: checkpoint.kind === "start" || checkpoint.kind === "final" ? true : checkpoint.requiresPhoto,
          }))
          .sort((left, right) => left.dayNumber - right.dayNumber),
        tasks: selectedIds.map((catalogTaskId) => ({
          catalogTaskId,
          instructions: taskConfig[catalogTaskId]?.instructions.trim() ?? "",
          targetValue: taskConfig[catalogTaskId]?.targetValue ? Number(taskConfig[catalogTaskId].targetValue) : null,
          unit: taskConfig[catalogTaskId]?.unit || null,
        })),
        allowAutoSwitch,
        replaceExistingQueue,
      } as const;
      const { challengeId, status } = await createChallenge(challengeInput);
      try { await refreshRealtimeAuthorization(); } catch { closeRealtimeConnection(); }
      await queryClient.invalidateQueries({ queryKey: challengeKeys.all });

      if (status === "active") {
        showDialog({
          icon: "trophy",
          eyebrow: "CHALLENGE LIVE",
          title: "Let's get to work.",
          message: "You're in. Complete your Start check-in to unlock today's tasks.",
          actions: [{ label: "Open challenge", onPress: () => router.replace(`/challenge/${challengeId}`) }],
        });
      } else {
        showDialog({
          icon: "trophy",
          eyebrow: "CHALLENGE PUBLISHED",
          title: "You're hosting—and you're in.",
          message: `This is now your one queued challenge. You'll join automatically when it starts${allowAutoSwitch ? ", switching from your current challenge if necessary" : ""}.`,
          actions: [{ label: "Open host controls", onPress: () => openHostControls(challengeId) }],
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't publish that challenge.");
    } finally {
      setSaving(false);
    }
  };

  const prepareCreate = () => {
    const currentChallenge = challenges.data?.find((challenge) =>
      ["pending", "active"].includes(challenge.membershipStatus),
    );
    const startsNow = startsOn <= dateValue(defaults.today);
    const queuedChallenge = startsNow ? undefined : challenges.data?.find((challenge) => challenge.isQueued);
    const overlapsCurrent = Boolean(currentChallenge && currentChallenge.endsOn >= startsOn);
    const needsConfirmation = overlapsCurrent || Boolean(queuedChallenge);

    if (!needsConfirmation) {
      void save(false, false);
      return;
    }

    const effects = [
      queuedChallenge ? `${queuedChallenge.name} will be removed from Up next.` : null,
      overlapsCurrent && currentChallenge
        ? startsNow
          ? `${currentChallenge.name} will be left immediately and prize eligibility will be forfeited.`
          : `${currentChallenge.name} will be left when this challenge starts if it is still active.`
        : null,
    ].filter(Boolean).join(" ");

    showDialog({
      icon: "alert",
      eyebrow: "HOSTS PARTICIPATE",
      title: startsNow && overlapsCurrent ? "This switches challenges now." : "Make this your next challenge?",
      message: `Creating a challenge automatically enters you as a participant. ${effects}`,
      dismissible: true,
      actions: [
        { label: "Go back", variant: "secondary" },
        {
          label: startsNow && overlapsCurrent ? "Create & switch now" : "Create & schedule",
          variant: overlapsCurrent ? "danger" : "primary",
          onPress: () => void save(overlapsCurrent, Boolean(queuedChallenge)),
        },
      ],
    });
  };

  const primaryAction = () => {
    if (step < 4) moveToStep(step + 1);
    else prepareCreate();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <BackButton onPress={goBack} />
          <View style={styles.headerCopy}><Text style={styles.headerStep}>STEP {step + 1} OF 5</Text><Text style={styles.headerLabel}>{stepLabels[step]}</Text></View>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.progress}>{stepLabels.map((label, index) => <View key={label} style={[styles.progressTrack, index <= step && styles.progressTrackActive]} />)}</View>

        <View style={styles.flex}>
          <KeyboardAwareScrollView ref={scrollRef} bottomOffset={62} contentContainerStyle={styles.content} keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {step === 0 ? (
              <>
                <View style={styles.stepHero}>
                  <Text style={styles.eyebrow}>START WITH THE IDEA</Text>
                  <Text style={styles.stepTitle}>What are we doing?</Text>
                  <Text style={styles.stepSubtitle}>Give people one clear reason to show up every day.</Text>
                </View>
                <View style={styles.formCard}>
                  <View style={styles.field}><Text style={styles.label}>CHALLENGE NAME</Text><TextInput value={name} onChangeText={setName} placeholder="90 Strong" placeholderTextColor={theme.colors.textMuted} maxLength={80} returnKeyType="next" style={styles.input} /></View>
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
                  <DateField label="ENDS" value={endsOn} minimumDate={endMinimumDate} open={openDate === "end"} onToggle={() => setOpenDate(openDate === "end" ? null : "end")} onClose={() => setOpenDate(null)} onChange={changeEndDate} />
                </View>
                <View style={styles.scoringSection}>
                  <View style={styles.alwaysOnCard}><View style={styles.alwaysOnIcon}><Icon name="flame" size={25} color={theme.colors.brandStrong}/></View><View style={styles.alwaysOnCopy}><Text style={styles.alwaysOnLabel}>ALWAYS ON</Text><Text style={styles.alwaysOnTitle}>ShipShape Points</Text><Text style={styles.alwaysOnBody}>+1 per completed task and −3 per missed task. Perfect-day and 7-day streak bonuses scale automatically with the number of daily tasks.</Text></View></View>
                  <View style={styles.endPointsIntro}><Text style={styles.endPointsEyebrow}>OPTIONAL · SCORED AT THE FINISH</Text><Text style={styles.sectionTitle}>Additional points</Text><Text style={styles.helpCentered}>Give people another way to compete even if they miss a few days. Final results are compared with each person’s own Start check-in.</Text></View>
                  <View style={styles.scoringOptions}>
                    <View style={styles.endPointsCard}>
                      <ToggleRow title="Weight change" description="Add points for weight lost between Start and Final." value={weightBonusCalculation !== null} onValueChange={(enabled) => setWeightBonusCalculation(enabled ? "percentage" : null)} />
                      {weightBonusCalculation ? <View style={styles.methodArea}><Text style={styles.label}>HOW TO MAKE IT FAIR</Text><View style={styles.methodPicker}><Pressable onPress={() => setWeightBonusCalculation("percentage")} style={[styles.methodOption, weightBonusCalculation === "percentage" && styles.methodOptionActive]}><Text style={[styles.methodOptionText, weightBonusCalculation === "percentage" && styles.methodOptionTextActive]}>Percentage</Text></Pressable><Pressable onPress={() => setWeightBonusCalculation("total_change")} style={[styles.methodOption, weightBonusCalculation === "total_change" && styles.methodOptionActive]}><Text style={[styles.methodOptionText, weightBonusCalculation === "total_change" && styles.methodOptionTextActive]}>Total change</Text></Pressable></View><Text style={styles.methodHelp}>{weightBonusCalculation === "percentage" ? "Best when competitors start at different weights. A 4.2% decrease earns 4.2 points." : "Best when everyone wants raw change. A 10-unit decrease earns 10 points."}</Text></View> : null}
                    </View>
                    <View style={styles.endPointsCard}>
                      <ToggleRow title="Body-fat change" description="Add a separate set of points for body-fat reduction." value={bodyFatBonusCalculation !== null} onValueChange={(enabled) => setBodyFatBonusCalculation(enabled ? "total_change" : null)} />
                      {bodyFatBonusCalculation ? <View style={styles.methodArea}><Text style={styles.label}>HOW TO MAKE IT FAIR</Text><View style={styles.methodPicker}><Pressable onPress={() => setBodyFatBonusCalculation("percentage")} style={[styles.methodOption, bodyFatBonusCalculation === "percentage" && styles.methodOptionActive]}><Text style={[styles.methodOptionText, bodyFatBonusCalculation === "percentage" && styles.methodOptionTextActive]}>Percentage</Text></Pressable><Pressable onPress={() => setBodyFatBonusCalculation("total_change")} style={[styles.methodOption, bodyFatBonusCalculation === "total_change" && styles.methodOptionActive]}><Text style={[styles.methodOptionText, bodyFatBonusCalculation === "total_change" && styles.methodOptionTextActive]}>Percentage points</Text></Pressable></View><Text style={styles.methodHelp}>{bodyFatBonusCalculation === "percentage" ? "A relative 10% reduction earns 10 points." : "A drop from 25% to 22% earns 3 points."}</Text></View> : null}
                    </View>
                  </View>
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
                  <Text style={styles.eyebrow}>PROGRESS CHECK-INS</Text>
                  <Text style={styles.stepTitle}>Set the markers.</Text>
                  <Text style={styles.stepSubtitle}>Choose when everyone pauses to record progress. Start and Final are always included; add up to three moments in between.</Text>
                </View>
                <View style={styles.presetCard}>
                  <View style={styles.scheduleHeader}><Text style={styles.scheduleEyebrow}>QUICK SCHEDULE</Text><Text style={styles.scheduleTitle}>Choose a check-in rhythm</Text><Text style={styles.scheduleIntro}>Start and Final are already included. Pick how often everyone checks in between them.</Text></View>
                  <View style={styles.scheduleGrid}>
                    {([
                      { id: "simple" as const, title: "Essentials", count: 2, minimumDays: 2, detail: `Day 1 · Day ${durationDays}` },
                      { id: "halfway" as const, title: "Halfway", count: 3, minimumDays: 3, detail: `Day 1 · ${Math.max(2, Math.min(durationDays - 1, Math.round((durationDays + 1) / 2)))} · ${durationDays}` },
                      { id: "milestones" as const, title: "Milestones", count: 4, minimumDays: 4, detail: `Day 1 · ${Math.max(2, Math.round(durationDays / 3))} · ${Math.min(durationDays - 1, Math.round(durationDays * 2 / 3))} · ${durationDays}` },
                      { id: "custom" as const, title: "Custom", count: 2, minimumDays: 2, detail: "Choose up to 3 days" },
                    ]).map((option) => {
                      const selected = checkpointPreset === option.id;
                      const disabled = durationDays < option.minimumDays;
                      return <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={() => applyCheckpointPreset(option.id)} style={({ pressed }) => [styles.scheduleTile, selected && styles.scheduleTileSelected, disabled && styles.scheduleTileDisabled, pressed && styles.pressed]}>
                        <View style={[styles.scheduleCountBox, selected && styles.scheduleCountBoxSelected]}><Text style={[styles.scheduleCount, selected && styles.scheduleCountSelected]}>{option.id === "custom" ? "2–5" : option.count}</Text><Text style={[styles.scheduleCountLabel, selected && styles.scheduleCountLabelSelected]}>CHECK-INS</Text></View>
                        <View style={styles.scheduleTileCopy}><Text style={[styles.scheduleTileTitle, selected && styles.scheduleTileTitleSelected]}>{option.title}</Text><Text numberOfLines={1} style={styles.scheduleTileDetail}>{option.detail}</Text></View>
                        <View style={[styles.scheduleRadio, selected && styles.scheduleRadioSelected]}>{selected ? <View style={styles.scheduleRadioDot}/> : null}</View>
                      </Pressable>;
                    })}
                  </View>
                  <Text style={styles.scheduleFooter}>{checkpointPreset === "custom" ? "Add and place your own intermediate check-ins below." : "You can still choose what each intermediate check-in collects."}</Text>
                </View>
                <View style={styles.checkpointTimeline}>
                  {[...checkpoints].sort((left, right) => Number(left.dayNumber) - Number(right.dayNumber)).map((checkpoint, index, ordered) => {
                    const fixedCheckpoint = checkpoint.kind !== "milestone";
                    const scheduleEditable = checkpointPreset === "custom" && checkpoint.kind === "milestone";
                    if (fixedCheckpoint) return <View key={checkpoint.id} style={styles.checkpointRow}>
                      <View style={styles.timelineRail}><View style={[styles.timelineDot, styles.timelineDotLocked]}><Text style={styles.timelineNumber}>{index + 1}</Text></View>{index < ordered.length - 1 ? <View style={styles.timelineLine} /> : null}</View>
                      <View style={styles.fixedCheckpointCard}>
                        <View style={styles.fixedCheckpointTop}><View style={styles.checkpointTitleCopy}><Text style={styles.checkpointKind}>{checkpoint.kind === "start" ? "START CHECK-IN" : "FINAL CHECK-IN"}</Text><Text style={styles.fixedCheckpointTitle}>{checkpoint.label}</Text></View><Text style={styles.fixedDay}>DAY {checkpoint.dayNumber}</Text></View>
                        <View style={styles.fixedCheckpointSummary}><Icon name="check" size={16} color={theme.colors.brandStrong}/><Text style={styles.fixedCheckpointSummaryText}>Weight, body fat & photo required</Text></View>
                      </View>
                    </View>;
                    return <View key={checkpoint.id} style={styles.checkpointRow}>
                      <View style={styles.timelineRail}><View style={styles.timelineDot}><Text style={styles.timelineNumber}>{index + 1}</Text></View>{index < ordered.length - 1 ? <View style={styles.timelineLine} /> : null}</View>
                      <View style={styles.checkpointCard}>
                        <View style={styles.checkpointHead}>
                          <View style={styles.checkpointTitleCopy}><Text style={styles.checkpointKind}>MILESTONE CHECK-IN</Text>{scheduleEditable ? <TextInput value={checkpoint.label} onChangeText={(label) => updateCheckpoint(checkpoint.id, { label })} maxLength={40} returnKeyType="done" style={styles.checkpointTitle} /> : <Text style={styles.checkpointTitleLocked}>{checkpoint.label}</Text>}</View>
                          {scheduleEditable ? <Button size="sm" variant="secondary" onPress={() => removeCheckpoint(checkpoint.id)}>Remove</Button> : null}
                        </View>
                        <View style={styles.dayRow}><View><Text style={styles.label}>WHEN IT HAPPENS</Text><Text style={styles.daySummary}>Day {checkpoint.dayNumber || "—"}</Text></View>{scheduleEditable ? <View style={styles.dayInputWrap}><Text style={styles.dayPrefix}>DAY</Text><TextInput value={checkpoint.dayNumber} onChangeText={(dayNumber) => updateCheckpoint(checkpoint.id, { dayNumber: dayNumber.replace(/[^0-9]/g, "") })} keyboardType="number-pad" style={styles.dayInput} /></View> : <Text style={styles.fixedDay}>DAY {checkpoint.dayNumber}</Text>}</View>
                        <View style={styles.requirementHeader}><Text style={styles.requirementTitle}>What must they log?</Text><Text style={styles.requirementHint}>At least one</Text></View>
                        <View style={styles.requirementRows}>
                          <ToggleRow title="Weight" description="Record current body weight." value={checkpoint.requiresWeight} onValueChange={(requiresWeight) => updateCheckpoint(checkpoint.id, { requiresWeight })} />
                          <ToggleRow title="Body fat" description="Record current body-fat percentage." value={checkpoint.requiresBodyFat} onValueChange={(requiresBodyFat) => updateCheckpoint(checkpoint.id, { requiresBodyFat })} />
                          <ToggleRow title="Progress photo" description="Take a new photo or choose one from the library." value={checkpoint.requiresPhoto} onValueChange={(requiresPhoto) => updateCheckpoint(checkpoint.id, { requiresPhoto })} />
                        </View>
                      </View>
                    </View>;
                  })}
                </View>
                {checkpointPreset === "custom" && checkpoints.filter((checkpoint) => checkpoint.kind === "milestone").length < 3 && durationDays > 2 ? <Button variant="secondary" leadingIcon="create" onPress={addCheckpoint}>Add custom check-in</Button> : null}
                <View style={styles.lockNote}><Icon name="flame" size={20} color={theme.colors.brandStrong}/><Text style={styles.lockNoteText}>When a check-in is due, that participant completes it before that day’s tasks unlock. Their measurements and photos stay private.</Text></View>
              </>
            ) : null}

            {step === 3 ? (
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

            {step === 4 ? (
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
                  <Text style={styles.reviewScoring}>ShipShape Points · +1 complete · −3 missed · +{pointRules.perfectDayBonus} perfect day · +{pointRules.sevenDayStreakBonus} streak{weightBonusCalculation ? ` · weight ${weightBonusCalculation === "percentage" ? "%" : "total"}` : ""}{bodyFatBonusCalculation ? ` · body-fat ${bodyFatBonusCalculation === "percentage" ? "%" : "total"}` : ""}</Text>
                  <Text style={styles.reviewMeta}>{checkpoints.length} required progress check-ins</Text>
                  <View style={styles.reviewPrize}><Icon name="trophy" size={18} color={theme.colors.brandStrong} /><Text style={styles.reviewPrizeText}>{reward}</Text></View>
                </View>
              </>
            ) : null}

            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          </KeyboardAwareScrollView>

          <View style={styles.footer}>
            <Button disabled={!stepValid} loading={saving} trailingIcon={step < 4 ? "arrow-right" : undefined} onPress={primaryAction}>{step < 4 ? step === 3 ? `Set rules for ${selectedIds.length} task${selectedIds.length === 1 ? "" : "s"}` : "Continue" : startsOn <= defaults.startsOn ? "Publish and start" : "Publish challenge"}</Button>
          </View>
        </View>
        <AppKeyboardToolbar />
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
  endPointsIntro: { alignItems: "center", gap: 6, paddingTop: 6 },
  endPointsEyebrow: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "900", fontSize: 8, letterSpacing: 1.1 },
  scoringOptions: { gap: 10 },
  endPointsCard: { padding: 12, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, gap: 12 },
  toggleRow: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: 14, padding: 13, borderRadius: 16, backgroundColor: theme.colors.subtle },
  toggleRowActive: { backgroundColor: theme.colors.brandSoft },
  toggleCopy: { flex: 1, minWidth: 0, gap: 3 },
  toggleTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "900", fontSize: 15 },
  toggleDescription: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 11, lineHeight: 16 },
  methodArea: { gap: 9, paddingHorizontal: 3, paddingBottom: 3 },
  methodPicker: { flexDirection: "row", padding: 4, borderRadius: 14, backgroundColor: theme.colors.subtle },
  methodOption: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, borderRadius: 11 },
  methodOptionActive: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.brand },
  methodOptionText: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontWeight: "800", fontSize: 12 },
  methodOptionTextActive: { color: theme.colors.brandStrong },
  methodHelp: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 11, lineHeight: 17 },
  presetCard: { gap: 16, padding: 17, borderRadius: 22, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  scheduleHeader: { gap: 4 },
  scheduleEyebrow: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "900", fontSize: 8, letterSpacing: 1.1 },
  scheduleTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "900", fontSize: 19 },
  scheduleIntro: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 11, lineHeight: 17 },
  scheduleGrid: { gap: 9 },
  scheduleTile: { width: "100%", minHeight: 76, flexDirection: "row", alignItems: "center", gap: 12, padding: 10, paddingRight: 14, borderRadius: 17, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.canvas },
  scheduleTileSelected: { borderWidth: 2, borderColor: theme.colors.brand, backgroundColor: theme.colors.brandSoft },
  scheduleTileDisabled: { opacity: 0.4 },
  scheduleCountBox: { width: 58, minHeight: 54, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: theme.colors.subtle },
  scheduleCountBoxSelected: { backgroundColor: theme.colors.brand },
  scheduleCount: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 24, lineHeight: 25 },
  scheduleCountSelected: { color: "#FFFFFF" },
  scheduleCountLabel: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontWeight: "900", fontSize: 6, letterSpacing: 0.6 },
  scheduleCountLabelSelected: { color: "#FFFFFF" },
  scheduleTileCopy: { flex: 1, minWidth: 0, gap: 3 },
  scheduleTileTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "900", fontSize: 14 },
  scheduleTileTitleSelected: { color: theme.colors.brandStrong },
  scheduleTileDetail: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 10, lineHeight: 14 },
  scheduleRadio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: theme.colors.borderStrong, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface },
  scheduleRadioSelected: { borderColor: theme.colors.brand },
  scheduleRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.brand },
  scheduleFooter: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 10, lineHeight: 16, textAlign: "center" },
  checkpointTimeline: { gap: 0 },
  checkpointRow: { flexDirection: "row", alignItems: "stretch", gap: 12 },
  timelineRail: { width: 34, alignItems: "center" },
  timelineDot: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: theme.colors.brand, backgroundColor: theme.colors.surface },
  timelineDotLocked: { backgroundColor: theme.colors.brand },
  timelineNumber: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "900", fontSize: 11 },
  timelineLine: { flex: 1, width: 2, minHeight: 18, backgroundColor: theme.colors.brandSoft },
  checkpointCard: { flex: 1, marginBottom: 14, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, gap: 14 },
  fixedCheckpointCard: { flex: 1, marginBottom: 14, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, gap: 12 },
  fixedCheckpointTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  fixedCheckpointTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "900", fontSize: 18, marginTop: 3 },
  fixedCheckpointSummary: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.colors.border },
  fixedCheckpointSummaryText: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontWeight: "700", fontSize: 11 },
  checkpointHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  checkpointTitleCopy: { flex: 1, minWidth: 0, gap: 3 },
  checkpointKind: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "900", fontSize: 8, letterSpacing: 1 },
  checkpointTitle: { minHeight: 40, paddingHorizontal: 10, borderRadius: 11, borderWidth: 1, borderColor: theme.colors.borderStrong, color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 15 },
  checkpointTitleLocked: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "900", fontSize: 18, lineHeight: 24 },
  dayRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  daySummary: { marginTop: 3, color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 14 },
  dayInputWrap: { flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 10, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.canvas },
  dayPrefix: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontWeight: "900", fontSize: 8, letterSpacing: 0.8 },
  dayInput: { width: 48, minHeight: 40, paddingHorizontal: 8, color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "900", fontSize: 15 },
  fixedDay: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "900", fontSize: 11, letterSpacing: 0.8 },
  requirementHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingTop: 2 },
  requirementTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "900", fontSize: 14 },
  requirementHint: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 10 },
  requirementRows: { gap: 8 },
  lockNote: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 16, borderRadius: 18, backgroundColor: theme.colors.accentSoft },
  lockNoteText: { flex: 1, color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 12, lineHeight: 18 },
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
