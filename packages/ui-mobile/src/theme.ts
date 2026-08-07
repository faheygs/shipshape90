import { lightTheme, tokens } from "@shipshape/tokens";

export const theme = {
  colors: lightTheme,
  space: tokens.spacing,
  radius: tokens.radius,
  type: {
    display: "Bebas Neue",
    body: "DM Sans",
  },
} as const;
