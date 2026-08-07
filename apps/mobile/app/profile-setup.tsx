import { Button, Icon, theme } from "@shipshape/ui-mobile";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../src/features/auth/AuthProvider";
import { isProfileHandleAvailable, saveProfile, uploadProfileAvatar } from "../src/features/auth/authRepository";

type HandleStatus = "idle" | "checking" | "available" | "taken";

export default function ProfileSetupScreen() {
  const { refreshProfile, session } = useAuth();
  const suggestedName = typeof session?.user.user_metadata.full_name === "string" ? session.user.user_metadata.full_name : "";
  const [name, setName] = useState(suggestedName);
  const [handle, setHandle] = useState("");
  const [handleStatus, setHandleStatus] = useState<HandleStatus>("idle");
  const [avatar, setAvatar] = useState<{ uri: string; mimeType?: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalized = handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30);
  const validHandle = /^[a-z0-9_]{3,30}$/.test(normalized);
  const valid = name.trim().length >= 2 && name.trim().length <= 60 && validHandle && handleStatus === "available";

  useEffect(() => {
    if (!validHandle) return;

    let active = true;
    const timer = setTimeout(() => {
      setHandleStatus("checking");
      void isProfileHandleAvailable(normalized)
        .then((available) => active && setHandleStatus(available ? "available" : "taken"))
        .catch(() => active && setHandleStatus("idle"));
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [normalized, validHandle]);

  const initials = useMemo(() => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "YOU", [name]);

  const pickAvatar = async () => {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Allow photo access to choose a profile picture. You can also continue without one.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.82 });
    if (!result.canceled && result.assets[0]) setAvatar({ uri: result.assets[0].uri, mimeType: result.assets[0].mimeType });
  };

  const submit = async () => {
    if (!valid) return;
    setLoading(true);
    setError(null);
    try {
      const stillAvailable = await isProfileHandleAvailable(normalized);
      if (!stillAvailable) {
        setHandleStatus("taken");
        return;
      }
      const avatarPath = avatar ? await uploadProfileAvatar(avatar) : undefined;
      await saveProfile({ displayName: name, handle: normalized, avatarPath });
      await refreshProfile();
      router.replace("/(tabs)/challenges");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "We couldn't save your profile.";
      if (message.toLowerCase().includes("username") && message.toLowerCase().includes("taken")) setHandleStatus("taken");
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleHelp = handleStatus === "checking"
    ? "Checking username..."
    : handleStatus === "available"
      ? "Username available"
      : handleStatus === "taken"
        ? "That username is already taken"
        : "3-30 characters. Letters, numbers, and underscores.";

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={styles.eyebrow}>ONE LAST THING</Text>
          <Text style={styles.title}>Make it yours.</Text>
          <Text style={styles.subtitle}>{"This is how you'll appear in challenges."}</Text>

          <Pressable accessibilityRole="button" onPress={pickAvatar} style={styles.photo}>
            {avatar ? <Image source={{ uri: avatar.uri }} style={styles.avatarImage} /> : <View style={styles.avatar}><Text style={styles.initials}>{initials}</Text></View>}
            <View style={styles.photoCopy}>
              <Text style={styles.photoTitle}>{avatar ? "Change profile photo" : "Add a profile photo"}</Text>
              <Text style={styles.photoMeta}>Optional. You can change this anytime.</Text>
            </View>
            <Icon name="arrow-right" color={theme.colors.textMuted} />
          </Pressable>

          <View style={styles.field}>
            <Text style={styles.label}>NAME</Text>
            <TextInput
              value={name}
              onChangeText={(next) => { setName(next.slice(0, 60)); setError(null); }}
              autoComplete="name"
              textContentType="name"
              placeholder="Your name"
              placeholderTextColor={theme.colors.textMuted}
              returnKeyType="next"
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>USERNAME</Text>
            <View style={[styles.handleInput, handleStatus === "available" && styles.handleAvailable, handleStatus === "taken" && styles.handleTaken]}>
              <Text style={styles.at}>@</Text>
              <TextInput
                value={normalized}
                onChangeText={(next) => { setHandle(next); setHandleStatus("idle"); setError(null); }}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={30}
                placeholder="username"
                placeholderTextColor={theme.colors.textMuted}
                returnKeyType="done"
                onSubmitEditing={submit}
                style={styles.handleText}
              />
            </View>
            <Text style={[styles.hint, handleStatus === "available" && styles.available, handleStatus === "taken" && styles.taken]}>{handleHelp}</Text>
          </View>

          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Button disabled={!valid} loading={loading} onPress={submit}>Explore challenges</Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.canvas },
  flex: { flex: 1 },
  content: { padding: 24, paddingTop: 44, paddingBottom: 32, gap: 16 },
  eyebrow: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "800", fontSize: 10, letterSpacing: 1.5 },
  title: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 50, lineHeight: 51, letterSpacing: 1.3 },
  subtitle: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 15, lineHeight: 23, marginBottom: 10 },
  photo: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 17, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  avatar: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.brand },
  avatarImage: { width: 60, height: 60, borderRadius: 30, backgroundColor: theme.colors.brandSoft },
  initials: { color: "#fff", fontFamily: theme.type.body, fontWeight: "800", fontSize: 16 },
  photoCopy: { flex: 1 },
  photoTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 15 },
  photoMeta: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 12, marginTop: 2 },
  field: { gap: 7, marginTop: 4 },
  label: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontWeight: "800", fontSize: 10, letterSpacing: 1.1 },
  input: { minHeight: 56, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface, color: theme.colors.text, fontFamily: theme.type.body, fontSize: 16 },
  handleInput: { minHeight: 56, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface },
  handleAvailable: { borderColor: theme.colors.success },
  handleTaken: { borderColor: theme.colors.danger },
  at: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 16 },
  handleText: { flex: 1, color: theme.colors.text, fontFamily: theme.type.body, fontSize: 16 },
  hint: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 11 },
  available: { color: theme.colors.success },
  taken: { color: theme.colors.danger },
  error: { color: theme.colors.danger, fontFamily: theme.type.body, fontSize: 12 },
});
