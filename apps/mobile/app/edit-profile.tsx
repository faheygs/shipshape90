import { BackButton, Button, Icon, theme } from "@shipshape/ui-mobile";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../src/features/auth/AuthProvider";
import { deleteProfileAvatar, getAvatarUrl, isProfileHandleAvailable, saveProfile, uploadProfileAvatar } from "../src/features/auth/authRepository";
import { AppKeyboardToolbar } from "../src/components/AppKeyboardToolbar";

type HandleStatus = "idle" | "checking" | "available" | "taken";

export default function EditProfileScreen() {
  const { profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.displayName ?? "");
  const [handle, setHandle] = useState(profile?.handle ?? "");
  const [handleStatus, setHandleStatus] = useState<HandleStatus>("available");
  const [avatar, setAvatar] = useState<{ uri: string; mimeType?: string | null } | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalized = handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30);
  const validHandle = /^[a-z0-9_]{3,30}$/.test(normalized);
  const effectiveHandleStatus: HandleStatus = normalized === profile?.handle ? "available" : handleStatus;
  const valid = name.trim().length >= 2 && name.trim().length <= 60 && validHandle && effectiveHandleStatus === "available";
  const existingAvatarUrl = removeAvatar ? null : getAvatarUrl(profile?.avatarPath ?? null);

  useEffect(() => {
    if (!validHandle) return;
    if (normalized === profile?.handle) return;

    let active = true;
    const timer = setTimeout(() => {
      setHandleStatus("checking");
      void isProfileHandleAvailable(normalized)
        .then((available) => active && setHandleStatus(available ? "available" : "taken"))
        .catch(() => active && setHandleStatus("idle"));
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [normalized, profile?.handle, validHandle]);

  const initials = useMemo(() => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "YOU", [name]);

  const pickAvatar = async () => {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Allow photo access to choose a profile picture.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.82 });
    if (!result.canceled && result.assets[0]) {
      setAvatar({ uri: result.assets[0].uri, mimeType: result.assets[0].mimeType });
      setRemoveAvatar(false);
    }
  };

  const submit = async () => {
    if (!valid || !profile) return;
    setLoading(true);
    setError(null);
    let uploadedPath: string | null = null;
    try {
      if (normalized !== profile.handle && !(await isProfileHandleAvailable(normalized))) {
        setHandleStatus("taken");
        return;
      }
      uploadedPath = avatar ? await uploadProfileAvatar(avatar) : removeAvatar ? null : profile.avatarPath;
      await saveProfile({ displayName: name, handle: normalized, avatarPath: uploadedPath });
      if (profile.avatarPath && profile.avatarPath !== uploadedPath) await deleteProfileAvatar(profile.avatarPath);
      await refreshProfile();
      router.back();
    } catch (caught) {
      if (uploadedPath && uploadedPath !== profile.avatarPath) void deleteProfileAvatar(uploadedPath).catch(() => undefined);
      const message = caught instanceof Error ? caught.message : "We couldn't save your profile.";
      if (message.toLowerCase().includes("username") && message.toLowerCase().includes("taken")) setHandleStatus("taken");
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleHelp = effectiveHandleStatus === "checking" ? "Checking username..." : effectiveHandleStatus === "available" ? "Username available" : effectiveHandleStatus === "taken" ? "That username is already taken" : "3-30 characters. Letters, numbers, and underscores.";
  const shownAvatar = avatar?.uri ?? existingAvatarUrl;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.flex}>
        <KeyboardAwareScrollView bottomOffset={62} contentContainerStyle={styles.content} keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <BackButton onPress={() => router.back()} />
          <View style={styles.heading}><Text style={styles.eyebrow}>EDIT PROFILE</Text><Text style={styles.title}>Make it yours.</Text><Text style={styles.subtitle}>Keep the identity people see across challenges up to date.</Text></View>

          <Pressable accessibilityRole="button" onPress={pickAvatar} style={({ pressed }) => [styles.photo, pressed && styles.pressed]}>
            {shownAvatar ? <Image source={{ uri: shownAvatar }} style={styles.avatarImage} /> : <View style={styles.avatar}><Text style={styles.initials}>{initials}</Text></View>}
            <View style={styles.photoCopy}><Text style={styles.photoTitle}>{shownAvatar ? "Change profile photo" : "Add a profile photo"}</Text><Text style={styles.photoMeta}>Choose a square image that feels like you.</Text></View>
            <Icon name="arrow-right" color={theme.colors.textMuted} />
          </Pressable>
          {shownAvatar ? <Button variant="secondary" size="md" onPress={() => { setAvatar(null); setRemoveAvatar(true); }}>Remove profile photo</Button> : null}

          <View style={styles.field}><Text style={styles.label}>NAME</Text><TextInput value={name} onChangeText={(value) => { setName(value.slice(0, 60)); setError(null); }} autoComplete="name" textContentType="name" placeholder="Your name" placeholderTextColor={theme.colors.textMuted} returnKeyType="next" style={styles.input}/></View>
          <View style={styles.field}><Text style={styles.label}>USERNAME</Text><View style={[styles.handleInput, effectiveHandleStatus === "available" && styles.handleAvailable, effectiveHandleStatus === "taken" && styles.handleTaken]}><Text style={styles.at}>@</Text><TextInput value={normalized} onChangeText={(value) => { setHandle(value); setHandleStatus("idle"); setError(null); }} autoCapitalize="none" autoCorrect={false} maxLength={30} placeholder="username" placeholderTextColor={theme.colors.textMuted} returnKeyType="done" onSubmitEditing={submit} style={styles.handleText}/></View><Text style={[styles.hint, effectiveHandleStatus === "available" && styles.available, effectiveHandleStatus === "taken" && styles.taken]}>{handleHelp}</Text></View>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Button disabled={!valid} loading={loading} onPress={submit}>Save profile</Button>
        </KeyboardAwareScrollView>
      </View>
      <AppKeyboardToolbar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.canvas }, flex: { flex: 1 },
  content: { padding: 24, paddingBottom: 48, gap: 16 }, heading: { gap: 5, marginTop: 6, marginBottom: 8 },
  eyebrow: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "800", fontSize: 10, letterSpacing: 1.5 },
  title: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 50, lineHeight: 52, letterSpacing: 1.3 },
  subtitle: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 15, lineHeight: 23 },
  photo: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }, pressed: { opacity: .8 },
  avatar: { width: 62, height: 62, borderRadius: 31, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.brand }, avatarImage: { width: 62, height: 62, borderRadius: 31, backgroundColor: theme.colors.brandSoft }, initials: { color: "#fff", fontFamily: theme.type.body, fontWeight: "800", fontSize: 17 },
  photoCopy: { flex: 1 }, photoTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 15 }, photoMeta: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 12, lineHeight: 17, marginTop: 2 },
  field: { gap: 7, marginTop: 5 }, label: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontWeight: "800", fontSize: 10, letterSpacing: 1.1 },
  input: { minHeight: 58, paddingHorizontal: 16, borderRadius: 15, borderWidth: 1, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface, color: theme.colors.text, fontFamily: theme.type.body, fontSize: 16 },
  handleInput: { minHeight: 58, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, borderRadius: 15, borderWidth: 1, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface }, handleAvailable: { borderColor: theme.colors.success }, handleTaken: { borderColor: theme.colors.danger },
  at: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 16 }, handleText: { flex: 1, color: theme.colors.text, fontFamily: theme.type.body, fontSize: 16 }, hint: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 11 }, available: { color: theme.colors.success }, taken: { color: theme.colors.danger }, error: { color: theme.colors.danger, fontFamily: theme.type.body, fontSize: 12, lineHeight: 18 },
});
