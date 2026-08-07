import Svg, { Circle, Path } from "react-native-svg";
import type { ColorValue } from "react-native";
import { theme } from "./theme";

export type IconName =
  | "home"
  | "challenges"
  | "create"
  | "community"
  | "profile"
  | "chevron-left"
  | "calendar"
  | "arrow-right"
  | "lock"
  | "trophy"
  | "check"
  | "alert"
  | "flame"
  | "heart"
  | "bell"
  | "trash"
  | "settings"
  | "close";

export interface IconProps {
  name: IconName;
  color?: ColorValue;
  size?: number;
  strokeWidth?: number;
  filled?: boolean;
}

const paths: Record<Exclude<IconName, "profile">, string> = {
  home: "M3 10.8 12 3l9 7.8v9.7a.5.5 0 0 1-.5.5h-5.8v-6.6H9.3V21H3.5a.5.5 0 0 1-.5-.5v-9.7Z",
  challenges: "M8.5 4h7M9 2v4m6-4v4M6 7h12l-1 14H7L6 7Zm3 4h6m-6 4h6",
  create: "M12 4v16M4 12h16",
  community: "M16 19.5v-1.3a4.2 4.2 0 0 0-4.2-4.2H6.2A4.2 4.2 0 0 0 2 18.2v1.3M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-7.6a4 4 0 0 1 0 7.7m5 9.4v-1.3a4.2 4.2 0 0 0-3.1-4.1",
  "chevron-left": "m15 5-7 7 7 7",
  calendar: "M6 3v3m12-3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z",
  "arrow-right": "m9 5 7 7-7 7",
  lock: "M6 10h12v11H6V10Zm3 0V7a3 3 0 0 1 6 0v3",
  trophy: "M8 4h8v4a4 4 0 0 1-8 0V4Zm0 2H4v1a4 4 0 0 0 4 4m8-5h4v1a4 4 0 0 1-4 4m-4 1v5m-4 3h8",
  check: "m5 12.5 4.5 4.5L19 7.5",
  alert: "M12 3 2.8 20h18.4L12 3Zm0 6v5m0 3h.01",
  flame: "M13.5 2.5c.8 4.1-2.7 5.3-2.7 8.1 0 1.3.8 2.2 1.9 2.8-.2-2.2 1.4-3.4 3-4.8 1.5 1.8 2.3 3.8 2.3 6A6 6 0 1 1 6 14c0-3.7 2.4-6.3 7.5-11.5Z",
  heart: "M20.8 4.7a5.5 5.5 0 0 0-7.8 0L12 5.8l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.5a5.5 5.5 0 0 0 0-7.8Z",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 12h4",
  trash: "M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6",
  settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-3.5c0-.5-.1-1-.2-1.5l2-1.6-2-3.4-2.5 1a8 8 0 0 0-2.6-1.5L13.7 2H10l-.4 3a8 8 0 0 0-2.6 1.5l-2.5-1-2 3.4 2 1.6a8 8 0 0 0 0 3l-2 1.6 2 3.4 2.5-1a8 8 0 0 0 2.6 1.5l.4 3h3.8l.4-3a8 8 0 0 0 2.6-1.5l2.5 1 2-3.4-2-1.6c.1-.5.2-1 .2-1.5Z",
  close: "M6 6l12 12M18 6 6 18",
};

export function Icon({ name, color = theme.colors.text, size = 24, strokeWidth = 1.9, filled = false }: IconProps) {
  if (name === "profile") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle cx="12" cy="8" r="4" stroke={color} strokeWidth={strokeWidth} />
        <Path d="M4 21a8 8 0 0 1 16 0" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={paths[name]} fill={filled ? color : "none"} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
