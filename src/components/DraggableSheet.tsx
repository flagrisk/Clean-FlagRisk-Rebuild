// BottomSheet (theme-aware). Tap dark area to dismiss. Bottom padding = real
// safe-area inset passed from the screen + base margin.
import { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing } from "../theme";

export function DraggableSheet({
  visible, onDismiss, title, subtitle, insetBottom = 0, children,
}: {
  visible: boolean; onDismiss: () => void;
  title?: string; subtitle?: string; insetBottom?: number; children: ReactNode;
}) {
  const { colors, glass, mode } = useTheme();
  const pad = insetBottom + spacing.lg;
  const sheetBg = mode === "light" ? "#ffffff" : "#121419";
  return (
    <Pressable style={styles.backdrop} onPress={onDismiss}>
      <Pressable style={[styles.sheet, { backgroundColor: sheetBg, borderColor: glass.stroke, paddingBottom: pad }]} onPress={() => {}}>
        <View style={[styles.grabber, { backgroundColor: mode === "light" ? "rgba(0,0,0,0.20)" : "rgba(255,255,255,0.25)" }]} />
        {title ? <Text style={[styles.title, { color: colors.text }]}>{title}</Text> : null}
        {subtitle ? <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text> : null}
        <ScrollView contentContainerStyle={{ paddingTop: spacing.md }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        <Text style={[styles.dismissHint, { color: colors.textFaint }]}>Tap outside to close</Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md, maxHeight: "85%" },
  grabber: { width: 44, height: 5, borderRadius: 3, alignSelf: "center", marginBottom: spacing.md },
  title: { fontSize: 20, fontWeight: "800", textAlign: "center" },
  subtitle: { fontSize: 13, textAlign: "center", marginTop: 4 },
  dismissHint: { fontSize: 12, textAlign: "center", marginTop: spacing.md },
});
