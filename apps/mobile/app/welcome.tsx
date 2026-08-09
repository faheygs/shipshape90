import { Button, theme } from "@shipshape/ui-mobile";
import * as AppleAuthentication from "expo-apple-authentication";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { getCurrentProfile, isHostedAuthConfigured, requestOtp, signInWithApple, signInWithGoogle, type OtpDestination } from "../src/features/auth/authRepository";
import { AppKeyboardToolbar } from "../src/components/AppKeyboardToolbar";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function GoogleMark() {
  return (
    <Svg accessibilityElementsHidden width={20} height={20} viewBox="0 0 18 18">
      <Path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844c-.209 1.125-.843 2.078-1.797 2.716v2.258h2.909c1.702-1.567 2.684-3.874 2.684-6.614Z" />
      <Path fill="#34A853" d="M9 18c2.43 0 4.468-.806 5.956-2.181l-2.909-2.258c-.806.54-1.835.859-3.047.859-2.344 0-4.328-1.585-5.036-3.714H.957v2.332C2.437 15.983 5.482 18 9 18Z" />
      <Path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A9.003 9.003 0 0 0 0 9c0 1.452.347 2.827.957 4.038l3.007-2.332Z" />
      <Path fill="#EA4335" d="M9 3.58c1.321 0 2.507.454 3.44 1.345l2.582-2.582C13.464.891 11.426 0 9 0 5.482 0 2.437 2.017.957 4.962l3.007 2.332C4.672 5.165 6.656 3.58 9 3.58Z" />
    </Svg>
  );
}

export default function WelcomeScreen() {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canContinue = emailPattern.test(value.trim());
  const socialLoading = appleLoading || googleLoading;

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

  const continueWithGoogle = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      const session = await signInWithGoogle();
      if (!session) return;
      const profile = await getCurrentProfile();
      router.replace(profile ? "/(tabs)/challenges" : "/profile-setup");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Google sign-in couldn't be completed.");
    } finally {
      setGoogleLoading(false);
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
      <View style={styles.flex}>
        <KeyboardAwareScrollView bottomOffset={62} contentContainerStyle={styles.content} keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
            {isHostedAuthConfigured ? (
              <>
                {appleAvailable ? (
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                    cornerRadius={14}
                    style={[styles.appleButton, socialLoading && styles.socialButtonDisabled]}
                    onPress={continueWithApple}
                  />
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Continue with Google"
                  disabled={socialLoading || loading}
                  onPress={continueWithGoogle}
                  style={({ pressed }) => [styles.googleButton, (socialLoading || loading) && styles.socialButtonDisabled, pressed && styles.googleButtonPressed]}
                >
                  <View style={styles.googleMark}><GoogleMark /></View>
                  <Text style={styles.googleButtonText}>{googleLoading ? "Opening Google..." : "Continue with Google"}</Text>
                </Pressable>
                {appleLoading ? <Text style={styles.socialStatus}>Opening Apple sign-in...</Text> : null}
                <View style={styles.divider}><View style={styles.dividerLine} /><Text style={styles.dividerText}>OR USE EMAIL</Text><View style={styles.dividerLine} /></View>
              </>
            ) : null}
            <Text style={styles.label}>EMAIL ADDRESS</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              editable={!loading && !socialLoading}
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
            <Button disabled={!canContinue || socialLoading} loading={loading} onPress={submit}>Send my code</Button>
            {!isHostedAuthConfigured ? <Button variant="ghost" onPress={() => router.replace("/(tabs)/home")}>Preview current build</Button> : null}
            <Text style={styles.legal}>By continuing, you agree to the Terms and acknowledge the Privacy Policy.</Text>
          </View>
        </KeyboardAwareScrollView>
      </View>
      <AppKeyboardToolbar />
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
  googleButton: { width: "100%", height: 54, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  googleButtonPressed: { backgroundColor: theme.colors.subtle, transform: [{ scale: 0.99 }] },
  googleMark: { position: "absolute", left: 18, width: 20, height: 20 },
  googleButtonText: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "700", fontSize: 16 },
  socialButtonDisabled: { opacity: 0.55 },
  socialStatus: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 11, textAlign: "center" },
  divider: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 2 },
  dividerLine: { flex: 1, height: 1, backgroundColor: theme.colors.border },
  dividerText: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontWeight: "800", fontSize: 9, letterSpacing: 1 },
  label: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontWeight: "800", fontSize: 10, letterSpacing: 1.1, marginTop: 3 },
  input: { minHeight: 56, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface, color: theme.colors.text, fontFamily: theme.type.body, fontSize: 16 },
  error: { color: theme.colors.danger, fontFamily: theme.type.body, fontSize: 12 },
  legal: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 10, lineHeight: 15, textAlign: "center", paddingHorizontal: 16 },
});
