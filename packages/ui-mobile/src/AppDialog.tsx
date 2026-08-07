import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Button, type ButtonProps } from "./Button";
import { Icon } from "./Icon";
import { theme } from "./theme";

export interface AppDialogAction {
  label: string;
  variant?: ButtonProps["variant"];
  onPress?: () => void;
}

export interface AppDialogOptions {
  eyebrow?: string;
  title: string;
  message: string;
  icon?: "trophy" | "check" | "alert" | "flame";
  actions?: AppDialogAction[];
  dismissible?: boolean;
}

interface DialogContextValue {
  showDialog: (options: AppDialogOptions) => void;
  hideDialog: () => void;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<AppDialogOptions | null>(null);
  const hideDialog = useCallback(() => setDialog(null), []);
  const showDialog = useCallback((options: AppDialogOptions) => setDialog(options), []);
  const value = useMemo(() => ({ showDialog, hideDialog }), [hideDialog, showDialog]);
  const actions = dialog?.actions?.length ? dialog.actions : [{ label: "Got it" }];

  return (
    <DialogContext.Provider value={value}>
      {children}
      <Modal visible={Boolean(dialog)} transparent animationType="fade" statusBarTranslucent onRequestClose={dialog?.dismissible ? hideDialog : undefined}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={dialog?.dismissible ? hideDialog : undefined} />
          {dialog ? (
            <View style={styles.card}>
              <View style={styles.icon}><Icon name={dialog.icon ?? "check"} size={28} color={theme.colors.brandStrong} /></View>
              {dialog.eyebrow ? <Text style={styles.eyebrow}>{dialog.eyebrow}</Text> : null}
              <Text style={styles.title}>{dialog.title}</Text>
              <Text style={styles.message}>{dialog.message}</Text>
              <View style={styles.actions}>
                {actions.map((action) => (
                  <Button key={action.label} {...(action.variant ? { variant: action.variant } : {})} onPress={() => { hideDialog(); action.onPress?.(); }}>{action.label}</Button>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </DialogContext.Provider>
  );
}

export function useAppDialog(): DialogContextValue {
  const value = useContext(DialogContext);
  if (!value) throw new Error("useAppDialog must be used within AppDialogProvider");
  return value;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "rgba(20, 23, 27, 0.54)" },
  card: { width: "100%", maxWidth: 420, padding: 24, borderRadius: 28, backgroundColor: theme.colors.surface, alignItems: "center", gap: 9, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  icon: { width: 58, height: 58, marginBottom: 3, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.brandSoft },
  eyebrow: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "800", fontSize: 9, letterSpacing: 1.4 },
  title: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 38, lineHeight: 42, letterSpacing: 1, textAlign: "center" },
  message: { maxWidth: 320, color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 14, lineHeight: 21, textAlign: "center" },
  actions: { width: "100%", gap: 10, marginTop: 12 },
});
