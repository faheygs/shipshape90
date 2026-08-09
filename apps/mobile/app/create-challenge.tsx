import { BackButton, Button, theme } from "@shipshape/ui-mobile";
import { router } from "expo-router";
import { useRef } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollView, type KeyboardAwareScrollViewRef } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppKeyboardToolbar } from "../src/components/AppKeyboardToolbar";
import { BasicsStep } from "../src/features/challenge-creation/BasicsStep";
import { CheckinsStep } from "../src/features/challenge-creation/CheckinsStep";
import { RulesStep } from "../src/features/challenge-creation/RulesStep";
import { StakesStep } from "../src/features/challenge-creation/StakesStep";
import { TasksStep } from "../src/features/challenge-creation/TasksStep";
import { sharedStyles } from "../src/features/challenge-creation/ChallengeCreationFields";
import { stepLabels } from "../src/features/challenge-creation/challengeCreationModel";
import { useChallengeBuilder } from "../src/features/challenge-creation/useChallengeBuilder";
import { useChallengePublisher } from "../src/features/challenge-creation/useChallengePublisher";

export default function CreateChallengeScreen() {
  const builder = useChallengeBuilder();
  const scrollRef = useRef<KeyboardAwareScrollViewRef>(null);
  const publisher = useChallengePublisher({
    draft: builder.draft,
    today: builder.defaults.today,
    isValid: builder.stepValid,
    onError: builder.setError,
  });

  const moveToStep = (next: number) => {
    builder.setOpenDate(null);
    builder.setError(null);
    if (next === 4 && !builder.editingTaskId) builder.setEditingTaskId(builder.selectedIds[0] ?? null);
    builder.setStep(next);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
  };
  const goBack = () => builder.step === 0 ? router.back() : moveToStep(builder.step - 1);
  const primaryAction = () => builder.step < 4 ? moveToStep(builder.step + 1) : publisher.prepareCreate();
  const actionLabel = builder.step < 4
    ? builder.step === 3 ? `Set rules for ${builder.selectedIds.length} task${builder.selectedIds.length === 1 ? "" : "s"}` : "Continue"
    : builder.startsOn <= builder.defaults.startsOn ? "Publish and start" : "Publish challenge";

  return <SafeAreaView style={styles.safe}>
    <View style={styles.screen}>
      <View style={styles.header}><BackButton onPress={goBack} /><View style={styles.headerCopy}><Text style={styles.headerStep}>STEP {builder.step + 1} OF 5</Text><Text style={styles.headerLabel}>{stepLabels[builder.step]}</Text></View><View style={styles.headerSpacer} /></View>
      <View style={styles.progress}>{stepLabels.map((label, index) => <View key={label} style={[styles.progressTrack, index <= builder.step && styles.progressTrackActive]} />)}</View>
      <View style={styles.flex}>
        <KeyboardAwareScrollView ref={scrollRef} bottomOffset={62} contentContainerStyle={styles.content} keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {builder.step === 0 ? <BasicsStep builder={builder} /> : null}
          {builder.step === 1 ? <StakesStep builder={builder} /> : null}
          {builder.step === 2 ? <CheckinsStep builder={builder} /> : null}
          {builder.step === 3 ? <TasksStep builder={builder} /> : null}
          {builder.step === 4 ? <RulesStep builder={builder} /> : null}
          {builder.error ? <Text accessibilityRole="alert" style={sharedStyles.error}>{builder.error}</Text> : null}
        </KeyboardAwareScrollView>
        <View style={styles.footer}><Button disabled={!builder.stepValid} loading={publisher.saving} trailingIcon={builder.step < 4 ? "arrow-right" : undefined} onPress={primaryAction}>{actionLabel}</Button></View>
      </View>
      <AppKeyboardToolbar />
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.canvas }, screen: { flex: 1 }, flex: { flex: 1 },
  header: { minHeight: 62, flexDirection: "row", alignItems: "center", paddingHorizontal: 20, gap: 12 }, headerCopy: { flex: 1, alignItems: "center", gap: 2 }, headerStep: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "800", fontSize: 8, letterSpacing: 1.2 }, headerLabel: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 14 }, headerSpacer: { width: 44 },
  progress: { flexDirection: "row", gap: 6, paddingHorizontal: 24, paddingBottom: 12 }, progressTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: theme.colors.border }, progressTrackActive: { backgroundColor: theme.colors.brand },
  content: { paddingHorizontal: 24, paddingTop: 22, paddingBottom: 32, gap: 24 }, footer: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 10, borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.canvas },
});
