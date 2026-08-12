// ============================================================================
// CTA - FlagRisk v2.1
// One button for the whole app, in the option C language.
//
//   primary     the single action on a screen that commits. Ink through graphite
//               on the same 135 degree axis as the tiles, with the logo lime as
//               the label. The only dark fill in the app.
//   silver      navigation, exits and offers. The tile ramp, hairline, ink label.
//   danger      outline only. Red border, red label, no fill.
//   safe        outline only. Green border, green label, no fill.
//   accent      outline only. Ink border and label, for a quiet secondary.
//
// Coloured buttons never carry a fill. Only the silver one has a surface.
// ============================================================================
import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, radius, spacing, type } from "../theme";

const HAIR = "rgba(20,21,42,0.10)";
const SILVER = ["#FFFFFF", "#FFFFFF", "#F4F4F4", "#EDEDED"] as const;
const SILVER_STOPS = [0, 0.38, 0.72, 1] as const;

// The primary. Ink through graphite on the same 135 degree axis as the tiles,
// with the logo lime as the label. This is the only dark fill in the app.
const PRIMARY = ["#101216", "#1B1E24", "#33373F"] as const;
const PRIMARY_STOPS = [0, 0.45, 1] as const;

export type CtaVariant = "primary" | "silver" | "danger" | "safe" | "accent";

const TONE: Record<CtaVariant, { border: string; label: string }> = {
  primary: { border: "transparent", label: colors.accent },
  silver: { border: HAIR, label: colors.ink },
  danger: { border: colors.riskHigh, label: colors.riskHigh },
  safe: { border: colors.safe, label: colors.safe },
  accent: { border: "rgba(20,21,42,0.22)", label: colors.ink },
};

export function Cta({
  label, onPress, variant = "silver", disabled, icon, style, height = 54,
}: {
  label: string;
  onPress: () => void;
  variant?: CtaVariant;
  disabled?: boolean;
  icon?: ReactNode;
  style?: ViewStyle;
  height?: number;
}) {
  const tone = TONE[variant];
  const inner = (
    <View style={styles.row}>
      {icon}
      <Text style={[styles.label, { color: tone.label }]} numberOfLines={1}>{label}</Text>
    </View>
  );

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.wrap, { height }, disabled && { opacity: 0.5 }, style]}
    >
      {variant === "primary" ? (
        <LinearGradient
          colors={PRIMARY}
          locations={PRIMARY_STOPS as unknown as number[]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[styles.face, { borderWidth: 0 }]}
        >
          {inner}
        </LinearGradient>
      ) : variant === "silver" ? (
        <LinearGradient
          colors={SILVER}
          locations={SILVER_STOPS as unknown as number[]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[styles.face, { borderColor: tone.border }]}
        >
          {inner}
        </LinearGradient>
      ) : (
        <View style={[styles.face, { borderColor: tone.border, backgroundColor: "transparent" }]}>
          {inner}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.md, overflow: "hidden" },
  face: {
    flex: 1, borderRadius: radius.md, borderWidth: 1,
    alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.md,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  label: { ...type.label, fontWeight: "600", fontSize: 15, lineHeight: 20 },
});
