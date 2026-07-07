// Glass surface, theme-aware. Layout in stylesheet; colours/glow from useTheme().
import { Pressable, View, ViewStyle, StyleProp } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { radius } from "../theme";

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  glow?: keyof ReturnType<typeof useTheme>["glow"];
  strong?: boolean;
  onPress?: () => void;
};

export function GlassCard({ children, style, glow, strong, onPress }: Props) {
  const t = useTheme();
  const surface: ViewStyle = {
    backgroundColor: strong ? t.glass.surfaceStrong : t.glass.surface,
    borderColor: t.glass.stroke,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: 16,
    ...(glow ? ({ boxShadow: t.glow[glow] } as any) : t.mode === "light" ? ({ boxShadow: t.glow.soft } as any) : null),
  };
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [surface, pressed && { opacity: 0.85 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[surface, style]}>{children}</View>;
}
