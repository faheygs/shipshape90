import { theme } from "@shipshape/ui-mobile";
import { KeyboardToolbar, type KeyboardToolbarProps, useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const toolbarTheme: NonNullable<KeyboardToolbarProps["theme"]> = {
  light: {
    primary: theme.colors.brandStrong,
    disabled: theme.colors.borderStrong,
    background: theme.colors.surface,
    ripple: theme.colors.brandSoft,
  },
  dark: {
    primary: "#D77A4D",
    disabled: "#6B7683",
    background: "#1D252E",
    ripple: "#FFFFFF1F",
  },
};

export function AppKeyboardToolbar({ insidePageSheet = false }: { insidePageSheet?: boolean }) {
  const insets = useSafeAreaInsets();
  const isVisible = useKeyboardState((state) => state.isVisible);
  if (!isVisible) return null;

  return (
    <KeyboardToolbar
      insets={{ left: insets.left, right: insets.right }}
      offset={{ opened: insidePageSheet ? 11 : insets.bottom + 11 }}
      theme={toolbarTheme}
    >
      <KeyboardToolbar.Prev />
      <KeyboardToolbar.Next />
      <KeyboardToolbar.Content />
      <KeyboardToolbar.Done text="Done" />
    </KeyboardToolbar>
  );
}
