import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { theme } from "./theme";

export function ProgressRing({ value, caption, size = 112 }: { value: number; caption: string; size?: number }) {
  const normalized = Math.min(100, Math.max(0, value));
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return <View style={styles.wrap}><View style={{ width: size, height: size }}><Svg width={size} height={size} style={StyleSheet.absoluteFill}><Circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={theme.colors.border} strokeWidth={stroke} /><Circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={normalized === 100 ? theme.colors.success : theme.colors.brand} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={circumference * (1 - normalized / 100)} rotation="-90" origin={`${size / 2}, ${size / 2}`} /></Svg><View style={styles.valueWrap}><Text style={styles.value}>{Math.round(normalized)}%</Text></View></View><Text style={styles.caption}>{caption.toUpperCase()}</Text></View>;
}

const styles = StyleSheet.create({ wrap: { alignItems: "center", gap: 10 }, valueWrap: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center" }, value: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 34, letterSpacing: 1 }, caption: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontWeight: "700", fontSize: 10, letterSpacing: 1 } });
