import { Button, theme } from "@shipshape/ui-mobile";
import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { captureAppError } from "../lib/telemetry";

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureAppError(error, info.componentStack ? "react-render" : "react");
  }

  private retry = () => this.setState({ error: null });

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.card} accessibilityRole="alert">
          <Text style={styles.eyebrow}>WE HIT ROUGH WATER</Text>
          <Text style={styles.title}>Let&apos;s get you back in.</Text>
          <Text style={styles.body}>Your account and challenge progress are safe. Try loading this screen again.</Text>
          <Button accessibilityLabel="Try loading the app again" onPress={this.retry}>Try again</Button>
        </View>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: theme.colors.canvas },
  card: { padding: 24, gap: 14, borderRadius: 28, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  eyebrow: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "900", fontSize: 10, letterSpacing: 1.4 },
  title: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 42, lineHeight: 44 },
  body: { marginBottom: 4, color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 15, lineHeight: 22 },
});
