import { Button, Icon, theme, useAppDialog } from "@shipshape/ui-mobile";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Image, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { uploadProgressPhoto } from "../features/progress/bodyProgressRepository";
import { useSaveBodyLog } from "../features/progress/useBodyProgress";
import { AppKeyboardToolbar } from "./AppKeyboardToolbar";

export function BodyLogModal({ challengeId, visible, onClose }: { challengeId?: string; visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const saveLog = useSaveBodyLog(challengeId);
  const { showDialog } = useAppDialog();
  const [weight, setWeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<{ uri: string; mimeType?: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const reset = () => { setWeight(""); setBodyFat(""); setNote(""); setPhoto(null); };
  const close = () => { reset(); onClose(); };
  const choosePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [3, 4], quality: 0.85 });
    if (!result.canceled) setPhoto({ uri: result.assets[0].uri, mimeType: result.assets[0].mimeType });
  };
  const submit = async () => {
    const weightValue = weight ? Number(weight) : undefined;
    const bodyFatValue = bodyFat ? Number(bodyFat) : undefined;
    if (!weightValue && !bodyFatValue && !photo) {
      showDialog({ icon: "alert", eyebrow: "BODY LOG", title: "Add something first.", message: "Enter weight, body fat, or choose a progress photo." });
      return;
    }
    setSaving(true);
    try {
      const photoPath = photo ? await uploadProgressPhoto({ ...photo, challengeId }) : undefined;
      await saveLog.mutateAsync({ weight: weightValue, bodyFatPercentage: bodyFatValue, photoPath, note });
      close();
      showDialog({ icon: "check", eyebrow: "PROGRESS SAVED", title: "Another marker down.", message: "Your private trend and progress gallery are up to date." });
    } catch (error) {
      showDialog({ icon: "alert", eyebrow: "COULDN'T SAVE", title: "Let's try that again.", message: error instanceof Error ? error.message : "Your body log could not be saved." });
    } finally { setSaving(false); }
  };

  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
    <SafeAreaView style={styles.safe}><View style={styles.flex}>
      <View style={styles.header}><View style={styles.headerCopy}><Text style={styles.eyebrow}>PRIVATE BODY LOG</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={styles.title}>Mark the progress.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={styles.closeButton}><Icon name="close" size={20}/></Pressable></View>
      <KeyboardAwareScrollView bottomOffset={62} contentContainerStyle={styles.content} keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>Add either measurement, a photo, or all three. Nothing here is posted publicly.</Text>
        <View style={styles.inputs}><View style={styles.field}><Text style={styles.label}>WEIGHT</Text><TextInput accessibilityLabel="Weight" value={weight} onChangeText={(value) => setWeight(value.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" placeholder="Optional" placeholderTextColor={theme.colors.textMuted} style={styles.input}/></View><View style={styles.field}><Text style={styles.label}>BODY FAT %</Text><TextInput accessibilityLabel="Body fat percentage" value={bodyFat} onChangeText={(value) => setBodyFat(value.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" placeholder="Optional" placeholderTextColor={theme.colors.textMuted} style={styles.input}/></View></View>
        <Pressable accessibilityRole="button" accessibilityLabel={photo ? "Change progress photo" : "Add a progress photo"} onPress={choosePhoto} style={({ pressed }) => [styles.photoPicker, pressed && styles.pressed]}>{photo ? <Image source={{ uri: photo.uri }} style={styles.photoPreview}/> : <><View style={styles.photoIcon}><Icon name="create" color={theme.colors.brandStrong}/></View><Text style={styles.photoTitle}>Add a progress photo</Text><Text style={styles.photoBody}>Choose a front, side, or back photo from your library.</Text></>}</Pressable>
        <View style={styles.field}><Text style={styles.label}>NOTE</Text><TextInput accessibilityLabel="Private progress note" value={note} onChangeText={setNote} multiline maxLength={500} placeholder="How are you feeling? What changed?" placeholderTextColor={theme.colors.textMuted} style={[styles.input, styles.noteInput]}/></View>
      </KeyboardAwareScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) }]}><Button loading={saving} onPress={submit}>Save body log</Button></View>
    </View><AppKeyboardToolbar insidePageSheet /></SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.canvas }, flex: { flex: 1 }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 22, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border }, headerCopy: { flex: 1, minWidth: 0 }, eyebrow: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "800", fontSize: 9, letterSpacing: 1.3 }, title: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 34 }, closeButton: { width: 44, height: 44, flexShrink: 0, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  content: { padding: 22, paddingBottom: 36, gap: 20 }, intro: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 14, lineHeight: 21 }, inputs: { flexDirection: "row", gap: 12 }, field: { flex: 1, minWidth: 0, gap: 7 }, label: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontWeight: "800", fontSize: 9, letterSpacing: 1 }, input: { minHeight: 54, paddingHorizontal: 15, borderRadius: 15, borderWidth: 1, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface, color: theme.colors.text, fontFamily: theme.type.body, fontSize: 15 }, noteInput: { minHeight: 94, paddingTop: 14, textAlignVertical: "top" },
  photoPicker: { minHeight: 190, alignItems: "center", justifyContent: "center", overflow: "hidden", padding: 18, borderRadius: 20, borderWidth: 1.5, borderStyle: "dashed", borderColor: theme.colors.brand, backgroundColor: theme.colors.brandSoft, gap: 6 }, photoPreview: { width: "100%", height: 250, borderRadius: 15 }, photoIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface }, photoTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 15 }, photoBody: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 11, textAlign: "center" }, footer: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 10, borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.canvas }, pressed: { opacity: 0.75 },
});
