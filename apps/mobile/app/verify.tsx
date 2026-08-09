import { BackButton, Button, theme } from "@shipshape/ui-mobile";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { getCurrentProfile, requestOtp, verifyOtp } from "../src/features/auth/authRepository";
import { AppKeyboardToolbar } from "../src/components/AppKeyboardToolbar";

export default function VerifyScreen() {
  const params = useLocalSearchParams<{ value: string }>();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<TextInput>(null);
  const lastAutoAttempt = useRef("");

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = setTimeout(() => setResendSeconds((current) => current - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendSeconds]);

  const submit = useCallback(async () => {
    if (code.length !== 6 || !params.value || loading) return;
    setLoading(true);
    setError(null);
    try {
      await verifyOtp({ kind: "email", value: params.value }, code);
      const profile = await getCurrentProfile();
      router.replace(profile ? "/(tabs)/home" : "/profile-setup");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That code didn't work.");
    } finally {
      setLoading(false);
    }
  }, [code, loading, params.value]);

  useEffect(() => {
    if (code.length !== 6 || code === lastAutoAttempt.current) return;
    lastAutoAttempt.current = code;
    void submit();
  }, [code, submit]);

  const resend = async () => {
    if (!params.value || resendSeconds > 0 || resending) return;
    setResending(true);
    setError(null);
    try {
      await requestOtp({ kind: "email", value: params.value });
      setCode("");
      lastAutoAttempt.current = "";
      setResendSeconds(30);
      input.current?.focus();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't resend the code.");
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.flex}>
        <KeyboardAwareScrollView bottomOffset={62} contentContainerStyle={styles.content} keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <BackButton onPress={() => router.back()} />
          <View style={styles.copy}>
            <Text style={styles.eyebrow}>CHECK YOUR EMAIL</Text>
            <Text style={styles.title}>Enter your code.</Text>
            <Text style={styles.subtitle}>We sent a six-digit code to {params.value}. It may take a moment to arrive.</Text>
          </View>
          <Pressable accessibilityLabel="Six-digit verification code" onPress={() => input.current?.focus()} style={styles.codeRow}>
            {Array.from({ length: 6 }, (_, index) => (
              <View key={index} style={[styles.codeCell, code.length === index && styles.codeCellActive]}>
                <Text style={styles.codeDigit}>{code[index] ?? ""}</Text>
              </View>
            ))}
          </Pressable>
          <TextInput
            ref={input}
            value={code}
            onChangeText={(next) => { setCode(next.replace(/\D/g, "").slice(0, 6)); setError(null); }}
            onSubmitEditing={submit}
            autoComplete="one-time-code"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            style={styles.hiddenInput}
          />
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Button disabled={code.length !== 6} loading={loading} onPress={submit}>Verify code</Button>
          <Button variant="ghost" disabled={resendSeconds > 0 || resending} loading={resending} onPress={resend}>
            {resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : "Resend code"}
          </Button>
          <Button variant="ghost" onPress={() => router.back()}>Use a different email</Button>
        </KeyboardAwareScrollView>
      </View>
      <AppKeyboardToolbar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.canvas },
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: 24, gap: 18 },
  copy: { gap: 8, marginTop: 30, marginBottom: 20 },
  eyebrow: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "800", fontSize: 10, letterSpacing: 1.5 },
  title: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 49, lineHeight: 51, letterSpacing: 1.3 },
  subtitle: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 15, lineHeight: 23 },
  codeRow: { flexDirection: "row", justifyContent: "space-between", gap: 7 },
  codeCell: { flex: 1, maxWidth: 52, height: 62, borderRadius: 13, borderWidth: 1.5, borderColor: theme.colors.borderStrong, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface },
  codeCellActive: { borderColor: theme.colors.brand },
  codeDigit: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 24 },
  hiddenInput: { position: "absolute", width: 1, height: 1, opacity: 0 },
  error: { color: theme.colors.danger, fontFamily: theme.type.body, fontSize: 12 },
});
