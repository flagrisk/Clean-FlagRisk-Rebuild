// ============================================================================
// FlagRisk theme - v2.1 single light system.
// Derived from Figma "Flagrisk v2.1" (file oqZY3dyPjKHA2BJ0VgNniK):
//   gutter 24 | spacing base 8 | radii 8/16/20 | ink #16181D | lime #DDEE5B
// Dark palette is retained below but NOT referenced. Dark mode returns later.
// RULE: lime is valid on ink only. Never lime text or lime fill on a light
// surface. On light, emphasis is weight and contrast, never colour.
// ============================================================================

export type ThemeMode = "light" | "dark";

// ---- v2.1 LIGHT (authoritative) -------------------------------------------
export const lightColors = {
  bg: "#FFFFFF",
  bgElevated: "#FAFAFA",
  bgSunken: "#F5F5F5",
  border: "#E0E0E0",
  borderStrong: "#CDCDCD",
  accent: "#DDEE5B",
  accentText: "#16181D",
  accentOn: "#16181D",
  accentSecondary: "#16181D",
  ink: "#16181D",
  inkDeep: "#0E0E10",
  text: "#16181D",
  textMuted: "#828282",
  textFaint: "#CDCDCD",
  danger: "#EB5757",
  warning: "#F2994A",
  safe: "#27AE60",
  riskHigh: "#EB5757",
  riskMedium: "#F2994A",
  riskLow: "#5BEE6C",
};

// ---- Legacy dark (unreferenced, kept for the later dark pass) --------------
export const darkColors = {
  bg: "#0a0b0d",
  bgElevated: "#16181c",
  bgSunken: "#101216",
  border: "#26282d",
  borderStrong: "#33363c",
  accent: "#c6f24e",
  accentText: "#0a0b0d",
  accentOn: "#c6f24e",
  accentSecondary: "#2bd6a8",
  ink: "#0a0b0d",
  inkDeep: "#000000",
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

export const lightGlass = {
  surface: "#FAFAFA",
  surfaceStrong: "#FFFFFF",
  stroke: "#E0E0E0",
  strokeStrong: "#CDCDCD",
};
export const darkGlass = {
  surface: "rgba(255,255,255,0.045)",
  surfaceStrong: "rgba(255,255,255,0.07)",
  stroke: "rgba(255,255,255,0.10)",
  strokeStrong: "rgba(255,255,255,0.16)",
};

// ---- Elevation: three tiers, measured off the 2.1 frames -------------------
export const lightGlow = {
  hairline: "0px 1px 4px rgba(0,0,0,0.08)",
  card: "0px 1px 20px rgba(0,0,0,0.04)",
  sheet: "0px 6px 24px rgba(1,1,20,0.30)",
  brand: "0px 1px 4px rgba(0,0,0,0.11)",
  red: "0px 1px 4px rgba(0,0,0,0.08)",
  amber: "0px 1px 4px rgba(0,0,0,0.08)",
  green: "0px 1px 4px rgba(0,0,0,0.08)",
  teal: "0px 1px 4px rgba(0,0,0,0.08)",
  soft: "0px 1px 20px rgba(0,0,0,0.04)",
};
export const darkGlow = {
  hairline: "0px 1px 4px rgba(0,0,0,0.45)",
  card: "0px 8px 30px rgba(0,0,0,0.45)",
  sheet: "0px 6px 24px rgba(0,0,0,0.60)",
  brand: "0px 0px 24px rgba(198,242,78,0.45)",
  red: "0px 0px 18px rgba(255,90,95,0.32)",
  amber: "0px 0px 18px rgba(255,176,32,0.32)",
  green: "0px 0px 18px rgba(52,224,161,0.30)",
  teal: "0px 0px 16px rgba(43,214,168,0.26)",
  soft: "0px 8px 30px rgba(0,0,0,0.45)",
};

// React Native cannot read the CSS strings above. Use these for style props.
export const elevation = {
  hairline: { shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  card: { shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 20, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  sheet: { shadowColor: "#010114", shadowOpacity: 0.30, shadowRadius: 24, shadowOffset: { width: 0, height: 6 }, elevation: 12 },
};

// ---- Risk ramp: low -> high. The hero banner reads from this. --------------
const brandGradient = ["#DDEE5B", "#C9D21F"] as const;

export const lightGradients = {
  brand: brandGradient,
  heroLow: ["#FFFFFF", "#5BEE6C"] as const,
  heroMedium: ["#FFFFFF", "#F2994A"] as const,
  heroHigh: ["#FFFFFF", "#EB5757"] as const,
  tileScoreLow: ["#FFFFFF", "#5BEE6C"] as const,
  tileScoreMedium: ["#FFFFFF", "#F2994A"] as const,
  tileScoreHigh: ["#FFFFFF", "#EB5757"] as const,
  tileAlarm: ["#FFFFFF", "#EB5757"] as const,
  tileNetwork: ["#FFFFFF", "#F5F5F5"] as const,
};
export const darkGradients = {
  brand: ["#c6f24e", "#2bd6a8"] as const,
  heroLow: ["rgba(52,224,161,0.22)", "rgba(43,214,168,0.06)"] as const,
  heroMedium: ["rgba(255,176,32,0.22)", "rgba(43,214,168,0.10)"] as const,
  heroHigh: ["rgba(255,90,95,0.24)", "rgba(255,176,32,0.08)"] as const,
  tileScoreLow: ["#1f6f4a", "#34e0a1"] as const,
  tileScoreMedium: ["#a35a00", "#ffb020"] as const,
  tileScoreHigh: ["#b23a3f", "#ff5a5f"] as const,
  tileAlarm: ["#7a2740", "#c2425a"] as const,
  tileNetwork: ["#0e5a48", "#23b48f"] as const,
};

// ---- Layout ----------------------------------------------------------------
// 375pt frame, 327pt content => 24 gutter each side. Base 8, half step 4.
export const spacing = { xs: 4, sm: 8, ms: 12, md: 16, lg: 24, xl: 32, xxl: 48, gutter: 24 };
export const radius = { sm: 8, md: 16, lg: 20, xl: 24, pill: 999 };

// ---- Type ------------------------------------------------------------------
// General Sans, four weights. Until the fonts ship in the next native build
// these names fall back to the system face; sizes and line heights still apply.
export const fonts = {
  regular: "GeneralSans-Regular",
  medium: "GeneralSans-Medium",
  semibold: "GeneralSans-Semibold",
  bold: "GeneralSans-Bold",
};

export const type = {
  score: { fontFamily: fonts.bold, fontSize: 48, lineHeight: 62, fontWeight: "700" as const },
  display: { fontFamily: fonts.bold, fontSize: 34, lineHeight: 42, fontWeight: "700" as const },
  title: { fontFamily: fonts.semibold, fontSize: 24, lineHeight: 32, fontWeight: "600" as const },
  heading: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 26, fontWeight: "600" as const },
  subheading: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22, fontWeight: "600" as const },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22, fontWeight: "400" as const },
  bodyStrong: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 22, fontWeight: "500" as const },
  label: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19, fontWeight: "500" as const },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, fontWeight: "400" as const },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, fontWeight: "400" as const },
  micro: { fontFamily: fonts.medium, fontSize: 10, lineHeight: 14, fontWeight: "500" as const },
};

export const screenBottomPad = 120;

export function getTheme(mode: ThemeMode) {
  return mode === "light"
    ? { mode, colors: lightColors, glass: lightGlass, glow: lightGlow, gradients: lightGradients }
    : { mode, colors: darkColors, glass: darkGlass, glow: darkGlow, gradients: darkGradients };
}

// ---- Static exports now point at LIGHT (v2.1). -----------------------------
export const colors = lightColors;
export const glass = lightGlass;
export const glow = lightGlow;
export const gradients = lightGradients;
