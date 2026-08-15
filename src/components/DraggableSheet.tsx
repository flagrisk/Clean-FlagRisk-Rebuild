// ============================================================================
// Bottom sheet - FlagRisk v2.1
// Tap the dimmed area to dismiss. Bottom padding is the real safe-area inset
// passed from the screen plus a base margin.
//
// Brought onto the 2.1 system: a measure of silver rather than pure white, the
// same 30 percent scrim as every other modal, a hairline top edge, and static
// tokens instead of useTheme, since there is one mode now.
// ============================================================================
import { ReactNode } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, type, elevation } from "../theme";

// White, matching every other sheet and the feedback modal. The silver was
// doing separation work the backdrop already does: the scrim, the top hairline
// and the shadow are what read as raised, not the fill.
const SHEET_BG = "#FFFFFF";

export function DraggableSheet({
  visible, onDismiss, title, subtitle, insetBottom = 0, children,
}: {
  visible: boolean; onDismiss: () => void;
  title?: string; subtitle?: string; insetBottom?: number; children: ReactNode;
}) {
  const pad = insetBottom + spacing.lg;
  return (
    <Pressable style={styles.backdrop} onPress={onDismiss}>
      <KeyboardAvoidingView behavior="padding" style={styles.kav} pointerEvents="box-none">
        <Pressable style={[styles.sheet, { paddingBottom: pad }]} onPress={() => {}}>
          <View style={styles.grabber} />
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </Pressable>
      </KeyboardAvoidingView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(1,1,20,0.30)", justifyContent: "flex-end" },
  kav: { flex: 1, width: "100%", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: SHEET_BG,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    borderTopWidth: 1, borderColor: "rgba(20,21,42,0.10)",
    paddingHorizontal: spacing.gutter, paddingTop: spacing.sm, maxHeight: "85%",
    ...elevation.sheet,
  },
  grabber: {
    width: 44, height: 4, borderRadius: 2, alignSelf: "center",
    backgroundColor: colors.borderStrong, marginBottom: spacing.md,
  },
  title: { ...type.heading, color: colors.ink, textAlign: "center" },
  subtitle: { ...type.caption, color: colors.textMuted, textAlign: "center", marginTop: 4, lineHeight: 18 },
});

