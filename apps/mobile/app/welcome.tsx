import { Button, theme } from "@shipshape/ui-mobile";
import * as AppleAuthentication from "expo-apple-authentication";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getCurrentProfile, isHostedAuthConfigured, requestOtp, signInWithApple, type OtpDestination } from "../src/features/auth/authRepository";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function WelcomeScreen() {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canContinue = emailPattern.test(value.trim());

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);

  const continueWithApple = async () => {
    setAppleLoading(true);
    setError(null);
    try {
      await signInWithApple();
      const profile = await getCurrentProfile();
      router.replace(profile ? "/(tabs)/challenges" : "/profile-setup");
    } catch (caught) {
      if (!(caught && typeof caught === "object" && "code" in caught && caught.code === "ERR_REQUEST_CANCELED")) {
        setError(caught instanceof Error ? caught.message : "Apple sign-in couldn't be completed.");
      }
    } finally {
      setAppleLoading(false);
    }
  };

  const submit = async () => {
    if (!canContinue) return;
    setLoading(true);
    setError(null);
    const normalized = value.trim().toLowerCase();
    const destination: OtpDestination = { kind: "email", value: normalized };
    try {
      await requestOtp(destination);
      router.push({ pathname: "/verify", params: { value: normalized } });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't send that code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.brand}>
            <View style={styles.mark}><Text style={styles.markText}>90</Text></View>
            <Text style={styles.wordmark}>SHIPSHAPE</Text>
          </View>

          <View style={styles.hero}>
            <Text style={styles.eyebrow}>YOUR CHALLENGE STARTS HERE</Text>
            <Text style={styles.title}>Commit. Show up. Finish strong.</Text>
            <Text style={styles.subtitle}>Join challenges, complete the work, and compete with people who keep you accountable.</Text>
          </View>

          <View style={styles.form}>
            {isHostedAuthConfigured && appleAvailable ? (
              <>
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={14}
                  style={styles.appleButton}
                  onPress={continueWithApple}
                />
                {appleLoading ? <Text style={styles.appleStatus}>Opening Apple sign-in...</Text> : null}
                <View style={styles.divider}><View style={styles.dividerLine} /><Text style={styles.dividerText}>OR USE EMAIL</Text><View style={styles.dividerLine} /></View>
              </>
            ) : null}
            <Text style={styles.label}>EMAIL ADDRESS</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              editable={!loading && !appleLoading}
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder="you@example.com"
              placeholderTextColor={theme.colors.textMuted}
              value={value}
              onChangeText={(next) => { setValue(next); setError(null); }}
              onSubmitEditing={submit}
              returnKeyType="go"
              style={styles.input}
            />
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <Button disabled={!canContinue || appleLoading} loading={loading} onPress={submit}>Send my code</Button>
            {!isHostedAuthConfigured ? <Button variant="ghost" onPress={() => router.replace("/(tabs)/home")}>Preview current build</Button> : null}
            <Text style={styles.legal}>By continuing, you agree to the Terms and acknowledge the Privacy Policy.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.canvas },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24, justifyContent: "space-between" },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  mark: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.brand },
  markText: { color: "#fff", fontFamily: theme.type.display, fontSize: 25, letterSpacing: 1 },
  wordmark: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 27, letterSpacing: 3 },
  hero: { gap: 10, marginVertical: 30 },
  eyebrow: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "800", fontSize: 10, letterSpacing: 1.5 },
  title: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 50, lineHeight: 51, letterSpacing: 1.3 },
  subtitle: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 15, lineHeight: 23, maxWidth: 360 },
  form: { gap: 12 },
  appleButton: { width: "100%", height: 54 },
  appleStatus: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 11, textAlign: "center" },
  divider: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 2 },
  dividerLine: { flex: 1, height: 1, backgroundColor: theme.colors.border },
  dividerText: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontWeight: "800", fontSize: 9, letterSpacing: 1 },
  label: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontWeight: "800", fontSize: 10, letterSpacing: 1.1, marginTop: 3 },
  input: { minHeight: 56, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface, color: theme.colors.text, fontFamily: theme.type.body, fontSize: 16 },
  error: { color: theme.colors.danger, fontFamily: theme.type.body, fontSize: 12 },
  legal: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 10, lineHeight: 15, textAlign: "center", paddingHorizontal: 16 },
});
