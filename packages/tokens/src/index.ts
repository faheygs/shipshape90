import source from "./tokens.json";

export const tokens = source;

export const lightTheme = {
  canvas: source.color.primitive.neutral[50],
  surface: source.color.primitive.white,
  subtle: source.color.primitive.ember[50],
  text: source.color.primitive.neutral[950],
  textSecondary: source.color.primitive.neutral[700],
  textMuted: source.color.primitive.neutral[500],
  brand: source.color.primitive.ember[600],
  brandStrong: source.color.primitive.ember[700],
  brandSoft: source.color.primitive.ember[100],
  accent: source.color.primitive.gold[500],
  accentSoft: source.color.primitive.gold[100],
  success: source.color.primitive.evergreen[500],
  successSoft: source.color.primitive.evergreen[100],
  danger: source.color.primitive.brick[500],
  dangerSoft: source.color.primitive.brick[100],
  border: source.color.primitive.neutral[200],
  borderStrong: source.color.primitive.neutral[300],
} as const;

export type ShipShapeTheme = typeof lightTheme;
