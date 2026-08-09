import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Icon, theme } from "@shipshape/ui-mobile";
import { Platform, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { dateFromValue, dateValue } from "./challengeCreationModel";

export function StepHero({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle: string; children?: React.ReactNode }) {
  return <View style={styles.hero}>
    <Text style={styles.eyebrow}>{eyebrow}</Text>
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.subtitle}>{subtitle}</Text>
    {children}
  </View>;
}

export function DateField({ label, value, minimumDate, open, onToggle, onClose, onChange }: { label: string; value: string; minimumDate: Date; open: boolean; onToggle: () => void; onClose: () => void; onChange: (value: string) => void }) {
  const selectedDate = dateFromValue(value);
  const handleChange = (_event: DateTimePickerEvent, next?: Date) => {
    if (next) {
      onChange(dateValue(next));
      onClose();
    } else if (Platform.OS === "android") onClose();
  };
  return <View style={styles.dateField}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${selectedDate.toLocaleDateString()}`} onPress={onToggle} style={({ pressed }) => [styles.dateButton, open && styles.dateButtonOpen, pressed && styles.pressed]}>
      <View style={styles.dateCopy}><Text style={sharedStyles.label}>{label}</Text><Text style={styles.dateText}>{selectedDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</Text></View>
      <View style={styles.dateIcon}><Icon name="calendar" size={20} color={theme.colors.brandStrong} /></View>
    </Pressable>
    {open ? <View style={styles.pickerCard}><DateTimePicker value={selectedDate} mode="date" display={Platform.OS === "ios" ? "inline" : "default"} minimumDate={minimumDate} onChange={handleChange} themeVariant="light" accentColor={theme.colors.brand} /></View> : null}
  </View>;
}

export function ToggleRow({ title, description, value, locked = false, onValueChange }: { title: string; description: string; value: boolean; locked?: boolean; onValueChange: (value: boolean) => void }) {
  return <View style={[styles.toggleRow, value && styles.toggleRowActive]}>
    <View style={styles.toggleCopy}><Text style={styles.toggleTitle}>{title}</Text><Text style={styles.toggleDescription}>{description}</Text></View>
    <Switch accessibilityLabel={title} value={value} disabled={locked} onValueChange={onValueChange} trackColor={{ false: theme.colors.borderStrong, true: theme.colors.brand }} thumbColor={theme.colors.surface} ios_backgroundColor={theme.colors.borderStrong} />
  </View>;
}

export const sharedStyles = StyleSheet.create({
  card: { padding: 18, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, gap: 18 },
  field: { gap: 8 },
  label: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontWeight: "800", fontSize: 9, letterSpacing: 1.1 },
  input: { minHeight: 54, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface, color: theme.colors.text, fontFamily: theme.type.body, fontSize: 15 },
  textarea: { minHeight: 92, paddingTop: 15, textAlignVertical: "top" },
  centerSection: { alignItems: "center", gap: 12 },
  sectionTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 19, textAlign: "center" },
  centerChoices: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 9 },
  helpCentered: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 12, lineHeight: 18, textAlign: "center" },
  error: { color: theme.colors.danger, fontFamily: theme.type.body, fontSize: 12, lineHeight: 18, textAlign: "center" },
  pressed: { opacity: 0.74 },
});

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: 8, paddingHorizontal: 8 },
  eyebrow: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "800", fontSize: 9, letterSpacing: 1.4, textAlign: "center" },
  title: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 43, lineHeight: 46, letterSpacing: 1.1, textAlign: "center" },
  subtitle: { maxWidth: 330, color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 14, lineHeight: 21, textAlign: "center" },
  dateField: { gap: 8 },
  dateButton: { minHeight: 70, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  dateButtonOpen: { borderColor: theme.colors.brand },
  dateCopy: { gap: 4 },
  dateText: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 17 },
  dateIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.brandSoft },
  pickerCard: { padding: 12, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  toggleRow: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: 14, padding: 13, borderRadius: 16, backgroundColor: theme.colors.subtle },
  toggleRowActive: { backgroundColor: theme.colors.brandSoft },
  toggleCopy: { flex: 1, minWidth: 0, gap: 3 },
  toggleTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "900", fontSize: 15 },
  toggleDescription: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 11, lineHeight: 16 },
  pressed: { opacity: 0.74 },
});
