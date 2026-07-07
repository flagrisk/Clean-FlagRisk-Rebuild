// Shared auth pieces (theme-aware). useAuthColors() maps the live theme to the
// auth palette; AuthTabs is the Email/Phone selector.
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

export function useAuthColors() {
  const { colors, glass } = useTheme();
  return {
    bg: colors.bg,
    card: glass.surface,
    text: colors.text,
    muted: colors.textMuted,
    accent: colors.accent,
    accentText: colors.accentText,
    accentOn: colors.accentOn,
    border: glass.stroke,
  };
}

export function AuthTabs({ active, onEmail }: { active: "email" | "phone"; onEmail: () => void }) {
  const c = useAuthColors();
  return (
    <View style={[styles.tabs, { borderBottomColor: c.border }]}>
      <Pressable style={styles.tab} onPress={onEmail}>
        <Text style={[styles.tabText, { color: c.muted }, active === "email" && { color: c.text }]}>Email</Text>
        {active === "email" && <View style={[styles.underline, { backgroundColor: c.accent }]} />}
      </Pressable>
      <View style={styles.tab}>
        <Text style={[styles.tabText, { color: c.muted, opacity: 0.5 }]}>Phone</Text>
        <Text style={[styles.soon, { color: c.muted, opacity: 0.5 }]}>soon</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", marginBottom: 28, borderBottomWidth: 1 },
  tab: { flex: 1, alignItems: "center", paddingBottom: 10 },
  tabText: { fontSize: 17, fontWeight: "600" },
  underline: { position: "absolute", bottom: -1, height: 2, width: "70%" },
  soon: { fontSize: 10, marginTop: 2 },
});
