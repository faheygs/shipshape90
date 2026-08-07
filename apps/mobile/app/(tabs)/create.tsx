import { Button, Icon, theme } from "@shipshape/ui-mobile";
import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTaskCatalog } from "../../src/features/catalog/useTaskCatalog";

const steps = [
  { number: "01", title: "Set the commitment", body: "Name it, choose the dates, and decide whether it is public or private." },
  { number: "02", title: "Build the task list", body: "Choose daily tasks from the library and set the behavior you want to reinforce." },
  { number: "03", title: "Publish the rules", body: "Review everything once, then open registration or start immediately." },
];

export default function CreateScreen() {
  const catalog = useTaskCatalog();
  const count = catalog.data?.length ?? 24;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>CREATE</Text>
          <Text style={styles.title}>Build something worth finishing.</Text>
          <Text style={styles.subtitle}>Define one clear commitment, invite the right people, and make the rules count.</Text>
        </View>

        <Button trailingIcon="arrow-right" onPress={() => router.push("/create-challenge")}>Create a challenge</Button>

        <View style={styles.libraryCard}>
          <View style={styles.libraryIcon}><Icon name="challenges" color={theme.colors.brandStrong} /></View>
          <View style={styles.libraryCopy}>
            <Text style={styles.libraryTitle}>{count} tasks ready to use</Text>
            <Text style={styles.libraryBody}>Fitness, nutrition, hydration, recovery, mindset, habits, and more.</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>How it works</Text>
        <View style={styles.steps}>
          {steps.map((step) => (
            <View key={step.number} style={styles.step}>
              <Text style={styles.stepNumber}>{step.number}</Text>
              <View style={styles.stepCopy}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepBody}>{step.body}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.canvas },
  content: { padding: 24, paddingBottom: 48, gap: 24 },
  header: { gap: 8, marginBottom: 2 },
  eyebrow: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "800", fontSize: 10, letterSpacing: 1.4 },
  title: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 44, lineHeight: 47, letterSpacing: 1.1 },
  subtitle: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 15, lineHeight: 22 },
  libraryCard: { flexDirection: "row", alignItems: "center", gap: 14, padding: 18, borderRadius: 18, backgroundColor: theme.colors.brandSoft },
  libraryIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface },
  libraryCopy: { flex: 1, gap: 3 },
  libraryTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 16 },
  libraryBody: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 12, lineHeight: 18 },
  sectionTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 20 },
  steps: { gap: 14 },
  step: { flexDirection: "row", gap: 14, padding: 18, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  stepNumber: { color: theme.colors.brandStrong, fontFamily: theme.type.display, fontSize: 27, lineHeight: 30 },
  stepCopy: { flex: 1, gap: 4 },
  stepTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 15 },
  stepBody: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 13, lineHeight: 20 },
});
