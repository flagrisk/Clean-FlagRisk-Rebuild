// Primary = lime→teal gradient pill; ghost = themed stroke. Theme-aware.
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing } from "../theme";

type Props = {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "ghost";
  loading?: boolean;
  disabled?: boolean;
};

export function Button({ label, onPress, variant = "primary", loading, disabled }: Props) {
  const t = useTheme();
  const isPrimary = variant === "primary";
  const inner = loading ? (
    <ActivityIndicator color={isPrimary ? t.colors.accentText : t.colors.accentOn} />
  ) : (
    <Text style={[styles.label, { color: isPrimary ? t.colors.accentText : t.colors.accentOn }]}>{label}</Text>
  );

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.wrap, (pressed || disabled) && { opacity: 0.75 }]}
    >
      {isPrimary ? (
        <LinearGradient
          colors={t.gradients.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.base, { boxShadow: t.glow.brand } as any]}
        >
          {inner}
        </LinearGradient>
      ) : (
        <View style={[styles.base, { backgroundColor: "transparent" }]}>{inner}</View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.md, overflow: "visible" },
  base: {
    height: 56, borderRadius: radius.md, alignItems: "center",
    justifyContent: "center", paddingHorizontal: spacing.lg, overflow: "hidden",
  },
  label: { fontSize: 16, fontWeight: "700" },
});
