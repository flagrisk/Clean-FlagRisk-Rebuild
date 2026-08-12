// ============================================================================
// Shared auth pieces - FlagRisk v2.1
// No mockup existed for authentication, so this is designed against the system
// the rest of 2.1 establishes: white surface, 24 gutter, 34/700 title,
// #FAFAFA fields with an ink focus border, ink primary with a lime label.
//
// AuthTabs is retained as an export so nothing breaks, but it now renders
// nothing: the Phone tab was permanently disabled and marked "soon", which is
// dead interface. Bring it back when phone auth actually ships.
// ============================================================================
import { ReactNode } from "react";
import {
  Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, type } from "../theme";

export function useAuthColors() {
  return {
    bg: colors.bg,
    card: colors.bgElevated,
    text: colors.ink,
    muted: colors.textMuted,
    accent: colors.accent,
    accentText: colors.ink,
    accentOn: colors.ink,
    border: colors.border,
  };
}

export function AuthTabs(_props: { active?: "email" | "phone"; onEmail?: () => void }) {
  return null;
}

export function AuthShell({
  title, subtitle, children, footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.mark}>
            <Image
              source={require("../../assets/mark-tile.png")}
              style={styles.markImage}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <View style={styles.fields}>{children}</View>
        </ScrollView>
        <View style={styles.footer}>{footer}</View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.gutter, paddingTop: spacing.xl, paddingBottom: spacing.xl },
  mark: { marginBottom: spacing.xl },
  // The logo tile, lime on Night Indigo. Square, 22 percent radius baked into
  // the asset, so it matches the app icon exactly.
  markImage: { width: 52, height: 52 },
  title: { ...type.display, color: colors.ink },
  subtitle: { ...type.label, fontWeight: "400", color: colors.textMuted, marginTop: 6 },
  fields: { marginTop: spacing.xl, gap: spacing.md },
  footer: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.md, gap: spacing.md },
});
