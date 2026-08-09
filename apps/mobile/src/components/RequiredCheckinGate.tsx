import { Button, Icon, theme, useAppDialog } from "@shipshape/ui-mobile";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Image, Keyboard, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { ChallengeCheckpoint } from "../features/checkins/checkinRepository";
import { useSaveChallengeCheckin } from "../features/checkins/useChallengeCheckins";
import { uploadProgressPhoto } from "../features/progress/bodyProgressRepository";
import { AppKeyboardToolbar } from "./AppKeyboardToolbar";

export function RequiredCheckinGate({ challengeId, checkpoint }: { challengeId: string; checkpoint: ChallengeCheckpoint }) {
  const insets = useSafeAreaInsets();
  const { showDialog } = useAppDialog();
  const saveCheckin = useSaveChallengeCheckin(challengeId);
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState(checkpoint.weight?.toString() ?? "");
  const [bodyFat, setBodyFat] = useState(checkpoint.bodyFatPercentage?.toString() ?? "");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<{ uri: string; mimeType?: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoSourceOpen, setPhotoSourceOpen] = useState(false);

  const requirements = [checkpoint.requiresWeight ? "weight" : "", checkpoint.requiresBodyFat ? "body fat" : "", checkpoint.requiresPhoto ? "a progress photo" : ""].filter(Boolean);
  const dateLabel = new Date(`${checkpoint.scheduledOn}T12:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric" });

  const chooseFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showDialog({ icon: "alert", title: "Photo access is off.", message: "Allow photo access in iPhone Settings to choose a progress photo." });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [3, 4], quality: 0.9 });
    if (!result.canceled) setPhoto({ uri: result.assets[0].uri, mimeType: result.assets[0].mimeType });
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showDialog({ icon: "alert", title: "Camera access is off.", message: "Allow camera access in iPhone Settings to take a progress photo." });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [3, 4], quality: 0.9 });
    if (!result.canceled) setPhoto({ uri: result.assets[0].uri, mimeType: result.assets[0].mimeType });
  };

  const choosePhotoSource = () => {
    void Haptics.selectionAsync();
    Keyboard.dismiss();
    setPhotoSourceOpen(true);
  };

  const closeCheckin = () => {
    if (photoSourceOpen) {
      setPhotoSourceOpen(false);
      return;
    }
    setOpen(false);
  };

  const canSave = checkpoint.canComplete
    && (!checkpoint.requiresWeight || Number(weight) > 0)
    && (!checkpoint.requiresBodyFat || (Number(bodyFat) > 0 && Number(bodyFat) <= 75))
    && (!checkpoint.requiresPhoto || Boolean(photo || checkpoint.photoPath));

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const photoPath = photo ? await uploadProgressPhoto({ ...photo, challengeId }) : undefined;
      await saveCheckin.mutateAsync({
        checkpointId: checkpoint.id,
        weight: weight ? Number(weight) : undefined,
        bodyFatPercentage: bodyFat ? Number(bodyFat) : undefined,
        photoPath,
        note,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setOpen(false);
      showDialog({ icon: "flame", eyebrow: "CHECK-IN COMPLETE", title: "Tasks unlocked.", message: "Your private progress marker is saved. Now own the day." });
    } catch (caught) {
      showDialog({ icon: "alert", title: "Check-in wasn’t saved.", message: caught instanceof Error ? caught.message : "Please try again." });
    } finally {
      setSaving(false);
    }
  };

  return <>
    <View style={styles.gate}>
      <View style={styles.lockIcon}><Icon name="lock" size={26} color={theme.colors.brandStrong}/></View>
      <Text style={styles.eyebrow}>{checkpoint.kind === "start" ? "START CHECK-IN" : checkpoint.kind === "final" ? "FINAL CHECK-IN" : "PROGRESS CHECK-IN"}</Text>
      <Text style={styles.title}>{checkpoint.label}</Text>
      <Text style={styles.subtitle}>This marker is due {dateLabel}. Log {requirements.join(", ").replace(/, ([^,]*)$/, " and $1")} to unlock today’s tasks.</Text>
      <View style={styles.requirements}>{requirements.map((requirement) => <View key={requirement} style={styles.requirement}><Icon name="check" size={17} color={theme.colors.brandStrong}/><Text style={styles.requirementText}>{requirement}</Text></View>)}</View>
      <Button onPress={() => setOpen(true)}>Complete check-in</Button>
      <Text style={styles.privateText}>Measurements and photos are private. Competitors only see bonus points.</Text>
    </View>

    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeCheckin}>
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.flex}>
          <View style={styles.modalHeader}><View style={styles.modalHeaderCopy}><Text style={styles.eyebrow}>DAY {checkpoint.dayNumber} CHECK-IN</Text><Text style={styles.modalTitle}>{checkpoint.label}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={closeCheckin} style={styles.close}><Icon name="close" size={20}/></Pressable></View>
          <KeyboardAwareScrollView bottomOffset={62} contentContainerStyle={styles.modalContent} keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.modalIntro}>Complete the required fields below. You can add the other fields too if you want a richer progress history.</Text>
            <View style={styles.inputs}>
              <View style={styles.field}><Text style={styles.label}>WEIGHT {checkpoint.requiresWeight ? "· REQUIRED" : "· OPTIONAL"}</Text><TextInput accessibilityLabel="Weight" value={weight} onChangeText={(value) => setWeight(value.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={theme.colors.textMuted} style={styles.input}/></View>
              <View style={styles.field}><Text style={styles.label}>BODY FAT % {checkpoint.requiresBodyFat ? "· REQUIRED" : "· OPTIONAL"}</Text><TextInput accessibilityLabel="Body fat percentage" value={bodyFat} onChangeText={(value) => setBodyFat(value.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={theme.colors.textMuted} style={styles.input}/></View>
            </View>
            <View style={styles.photoSection}>
              <View style={styles.photoHead}><Text style={styles.label}>PROGRESS PHOTO {checkpoint.requiresPhoto ? "· REQUIRED" : "· OPTIONAL"}</Text><Text style={styles.privateBadge}>PRIVATE</Text></View>
              <Pressable accessibilityRole="button" accessibilityLabel={photo ? "Change progress photo" : "Add progress photo"} onPress={choosePhotoSource} style={({ pressed }) => [styles.photoButton, pressed && styles.photoButtonPressed]}>
                {photo ? <View style={styles.photoReady}><Image source={{ uri: photo.uri }} style={styles.photo}/><View style={styles.photoReadyBadge}><Icon name="create" size={14} color="#FFFFFF"/><Text style={styles.photoReadyText}>CHANGE</Text></View></View> : <View style={styles.photoEmpty}><Icon name="create" size={25} color={theme.colors.brandStrong}/><Text style={styles.photoEmptyTitle}>Add your progress photo</Text><Text style={styles.photoEmptyBody}>Tap here, then choose the camera or your photo library.</Text></View>}
              </Pressable>
            </View>
            <View style={styles.field}><Text style={styles.label}>PRIVATE NOTE · OPTIONAL</Text><TextInput value={note} onChangeText={setNote} multiline maxLength={500} placeholder="How are you feeling at this marker?" placeholderTextColor={theme.colors.textMuted} style={[styles.input, styles.noteInput]}/></View>
          </KeyboardAwareScrollView>
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) }]}><Button disabled={!canSave} loading={saving} onPress={submit}>Complete check-in</Button></View>
        </View>
        <AppKeyboardToolbar insidePageSheet />
        {photoSourceOpen ? <View style={styles.photoSourceOverlay}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close photo options" style={StyleSheet.absoluteFill} onPress={() => setPhotoSourceOpen(false)}/>
          <View style={[styles.photoSourceSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.photoSourceHandle}/>
            <View style={styles.photoSourceIcon}><Icon name="create" size={26} color={theme.colors.brandStrong}/></View>
            <Text style={styles.eyebrow}>PROGRESS PHOTO</Text>
            <Text style={styles.photoSourceTitle}>{photo ? "Change your photo" : "Add your photo"}</Text>
            <Text style={styles.photoSourceBody}>Take a new photo or choose one from your library. You can crop and zoom before using it.</Text>
            <View style={styles.photoSourceActions}>
              <Button onPress={() => { setPhotoSourceOpen(false); void takePhoto(); }}>Take photo</Button>
              <Button variant="secondary" onPress={() => { setPhotoSourceOpen(false); void chooseFromLibrary(); }}>Choose from library</Button>
              <Button variant="secondary" onPress={() => setPhotoSourceOpen(false)}>Cancel</Button>
            </View>
          </View>
        </View> : null}
      </SafeAreaView>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gate: { alignItems: "center", padding: 22, borderRadius: 26, borderWidth: 1, borderColor: theme.colors.brand, backgroundColor: theme.colors.brandSoft, gap: 11 },
  lockIcon: { width: 58, height: 58, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface },
  eyebrow: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "900", fontSize: 9, letterSpacing: 1.3 },
  title: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 42, lineHeight: 45, textAlign: "center" },
  subtitle: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 14, lineHeight: 21, textAlign: "center" },
  requirements: { width: "100%", gap: 8, padding: 14, borderRadius: 17, backgroundColor: theme.colors.surface },
  requirement: { flexDirection: "row", alignItems: "center", gap: 9 },
  requirementText: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 13, textTransform: "capitalize" },
  privateText: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 10, lineHeight: 15, textAlign: "center" },
  modalSafe: { flex: 1, backgroundColor: theme.colors.canvas },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 22, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  modalHeaderCopy: { flex: 1, gap: 2 },
  modalTitle: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 35, lineHeight: 38 },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  modalContent: { padding: 22, paddingBottom: 36, gap: 20 },
  modalIntro: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 14, lineHeight: 21 },
  inputs: { flexDirection: "row", gap: 12 },
  field: { flex: 1, minWidth: 0, gap: 7 },
  label: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontWeight: "900", fontSize: 8, letterSpacing: 0.9 },
  input: { minHeight: 54, paddingHorizontal: 15, borderRadius: 15, borderWidth: 1, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface, color: theme.colors.text, fontFamily: theme.type.body, fontSize: 15 },
  noteInput: { minHeight: 94, paddingTop: 14, textAlignVertical: "top" },
  photoSection: { gap: 10 },
  photoHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  privateBadge: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "900", fontSize: 8, letterSpacing: 1 },
  photo: { width: "100%", height: 330, borderRadius: 22, backgroundColor: theme.colors.subtle },
  photoButton: { borderRadius: 22 },
  photoButtonPressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  photoReady: { position: "relative" },
  photoReadyBadge: { position: "absolute", top: 12, right: 12, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: theme.colors.brand },
  photoReadyText: { color: "#FFFFFF", fontFamily: theme.type.body, fontWeight: "900", fontSize: 8, letterSpacing: 1 },
  photoEmpty: { minHeight: 210, alignItems: "center", justifyContent: "center", padding: 20, borderRadius: 22, borderWidth: 1.5, borderStyle: "dashed", borderColor: theme.colors.brand, backgroundColor: theme.colors.brandSoft, gap: 7 },
  photoEmptyTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "900", fontSize: 15 },
  photoEmptyBody: { maxWidth: 280, color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 11, lineHeight: 17, textAlign: "center" },
  photoSourceOverlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 20, justifyContent: "flex-end", backgroundColor: "rgba(20, 23, 27, 0.54)" },
  photoSourceSheet: { paddingHorizontal: 22, paddingTop: 10, borderTopLeftRadius: 30, borderTopRightRadius: 30, backgroundColor: theme.colors.surface, alignItems: "center", gap: 9, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 22, shadowOffset: { width: 0, height: -8 }, elevation: 24 },
  photoSourceHandle: { width: 42, height: 5, marginBottom: 7, borderRadius: 999, backgroundColor: theme.colors.borderStrong },
  photoSourceIcon: { width: 54, height: 54, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: theme.colors.brandSoft },
  photoSourceTitle: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 38, lineHeight: 42, textAlign: "center" },
  photoSourceBody: { maxWidth: 330, color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 13, lineHeight: 20, textAlign: "center" },
  photoSourceActions: { width: "100%", gap: 9, marginTop: 10 },
  footer: { paddingHorizontal: 22, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.canvas },
});
