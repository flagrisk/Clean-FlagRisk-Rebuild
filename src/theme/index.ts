// ============================================================================
// FlagRisk theme (V2: light + dark). getTheme(mode) returns the live set.
// Static exports (colors/glass/glow) point at DARK for back-compat.
// ============================================================================

export type ThemeMode = "light" | "dark";

export const darkColors = {
  bg: "#0a0b0d",
  bgElevated: "#16181c",
  border: "#26282d",
  accent: "#c6f24e",
  accentSecondary: "#2bd6a8",
  accentText: "#0a0b0d",
  accentOn: "#c6f24e",
  text: "#ffffff",
  textMuted: "rgba(255,255,255,0.62)",
  textFaint: "rgba(255,255,255,0.40)",
  danger: "#ff5a5f",
  warning: "#ffb020",
  safe: "#34e0a1",
  riskHigh: "#ff5a5f",
  riskMedium: "#ffb020",
  riskLow: "#34e0a1",
};

export const lightColors = {
  bg: "#e6e7ea",            // warm-neutral soft grey (low glare)
  bgElevated: "#f6f7f9",    // cards sit just above bg, never pure white
  border: "rgba(0,0,0,0.07)",
  accent: "#c6f24e",
  accentSecondary: "#2bd6a8",
  accentText: "#0a0b0d",
  accentOn: "#5e7a12",      // legible lime for text/links on light
  text: "#20222a",          // soft near-black (not pure black)
  textMuted: "rgba(0,0,0,0.52)",
  textFaint: "rgba(0,0,0,0.34)",
  danger: "#e5484d",
  warning: "#c77700",
  safe: "#1c9d6b",
  riskHigh: "#e5484d",
  riskMedium: "#c77700",
  riskLow: "#1c9d6b",
};

export const darkGlass = {
  surface: "rgba(255,255,255,0.045)",
  surfaceStrong: "rgba(255,255,255,0.07)",
  stroke: "rgba(255,255,255,0.10)",
  strokeStrong: "rgba(255,255,255,0.16)",
};
export const lightGlass = {
  surface: "#f6f7f9",
  surfaceStrong: "#fdfdfe",
  stroke: "rgba(0,0,0,0.07)",
  strokeStrong: "rgba(0,0,0,0.12)",
};

export const darkGlow = {
  brand: "0px 0px 24px rgba(198,242,78,0.45)",
  red: "0px 0px 18px rgba(255,90,95,0.32)",
  amber: "0px 0px 18px rgba(255,176,32,0.32)",
  green: "0px 0px 18px rgba(52,224,161,0.30)",
  teal: "0px 0px 16px rgba(43,214,168,0.26)",
  soft: "0px 8px 30px rgba(0,0,0,0.45)",
};
export const lightGlow = {
  brand: "0px 6px 16px rgba(140,170,40,0.28)",
  red: "0px 4px 14px rgba(30,35,50,0.10)",
  amber: "0px 4px 14px rgba(30,35,50,0.10)",
  green: "0px 4px 14px rgba(30,35,50,0.10)",
  teal: "0px 4px 14px rgba(30,35,50,0.10)",
  soft: "0px 5px 18px rgba(30,35,50,0.12)",
};

// Shared brand gradient (works in both modes).
const brandGradient = ["#c6f24e", "#2bd6a8"] as const;

// Mode-specific hero tints. Dark = translucent over near-black; light = soft pastels.
export const darkGradients = {
  brand: brandGradient,
  heroMedium: ["rgba(255,176,32,0.22)", "rgba(43,214,168,0.10)"] as const,
  heroHigh: ["rgba(255,90,95,0.24)", "rgba(255,176,32,0.08)"] as const,
  heroLow: ["rgba(52,224,161,0.22)", "rgba(43,214,168,0.06)"] as const,
  tileScoreLow: ["#1f6f4a", "#34e0a1"] as const,
  tileScoreMedium: ["#a35a00", "#ffb020"] as const,
  tileScoreHigh: ["#b23a3f", "#ff5a5f"] as const,
  tileAlarm: ["#7a2740", "#c2425a"] as const,
  tileNetwork: ["#0e5a48", "#23b48f"] as const,
};
export const lightGradients = {
  brand: brandGradient,
heroMedium: ["#c77700", "#e0a64d"] as const,
  heroHigh: ["#e5484d", "#ff8a3d"] as const,
  heroLow: ["#3b6d11", "#8fb04b"] as const,
tileScoreLow: ["#3b6d11", "#8fb04b"] as const,
  tileScoreMedium: ["#c77700", "#e0a64d"] as const,
  tileScoreHigh: ["#e5484d", "#ff8a3d"] as const,
  tileAlarm: ["#c2425a", "#d97a55"] as const,
  tileNetwork: ["#0e7a62", "#23b48f"] as const,
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };
export const radius = { sm: 8, md: 12, lg: 20, xl: 24, pill: 999 };
export const type = {
  display: { fontSize: 34, fontWeight: "800" as const },
  title: { fontSize: 24, fontWeight: "700" as const },
  heading: { fontSize: 18, fontWeight: "600" as const },
  body: { fontSize: 16, fontWeight: "400" as const },
  small: { fontSize: 13, fontWeight: "400" as const },
};
export const screenBottomPad = 120;

export function getTheme(mode: ThemeMode) {
  return mode === "light"
    ? { mode, colors: lightColors, glass: lightGlass, glow: lightGlow, gradients: lightGradients }
    : { mode, colors: darkColors, glass: darkGlass, glow: darkGlow, gradients: darkGradients };
}

// ---- Backward-compat static exports (DARK) ----
export const colors = darkColors;
export const glass = darkGlass;
export const glow = darkGlow;
export const gradients = darkGradients;
