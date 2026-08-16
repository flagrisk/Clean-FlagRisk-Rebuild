// ============================================================================
// Shared auth pieces - FlagRisk v2.1
//
// Design C. The anatomy comes from the references: a warm ground, the mark
// alone at the top, a white card holding the form, centred titles, fields with
// a leading icon at a soft radius, a solid full width button, and a centred
// switch link at the foot.
//
// Parchment rather than white on every auth screen, so the whole flow reads as
// a place you pass through rather than part of the app proper. The card is what
// carries the form, which is why the fields inside it can be quiet.
//
// AuthTabs is live again. It rendered nothing while phone auth was unavailable,
// because a permanently disabled tab marked "soon" is dead interface.
// ============================================================================
import { ReactNode } from "react";
import {
  Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { ArrowLeft, CircleQuestionMark } from "lucide-react-native";
import { colors, type } from "../theme";

// The brand's warm surface. Kept local rather than added to the palette,
// because it exists only in this flow.
export const PARCHMENT = "#F3EEE3";

export function useAuthColors() {
  return {
    bg: PARCHMENT,
    card: colors.bg,
    text: colors.ink,
    muted: colors.textMuted,
    accent: colors.accent,
    accentText: colors.ink,
    accentOn: colors.ink,
    border: colors.border,
  };
}

// Phone or Email, as a pair of chips rather than an underline. The active one
// takes lime, which is the only place the brand colour appears on these screens
// and so does the work of showing which way you are signing in.
export function AuthTabs({
  active, onSelect,
}: {
  active: "phone" | "email";
  onSelect: (v: "phone" | "email") => void;
}) {
  return (
    <View style={styles.seg}>
      {(["phone", "email"] as const).map((k) => {
        const on = active === k;
        return (
          <Pressable key={k} onPress={() => onSelect(k)} style={[styles.chip, on && styles.chipOn]}>
            <Text style={[styles.chipText, on && styles.chipTextOn]}>
              {k === "phone" ? "Phone" : "Email"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function AuthShell({
  title, subtitle, children, footer, headerTitle,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer: ReactNode;
  // When set, a back arrow replaces the mark. Verification and reset need a way
  // out; signing in and creating an account are entry points and do not.
  headerTitle?: string;
}) {
  const navigation = useNavigation<any>();
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {headerTitle ? (
            <View style={styles.header}>
              <Pressable onPress={() => navigation.goBack()} style={styles.headBtn} hitSlop={8}>
                <ArrowLeft size={20} color={colors.ink} strokeWidth={2} />
              </Pressable>
              <Text style={styles.headTitle}>{headerTitle}</Text>
              <View style={styles.headBtn} />
            </View>
          ) : (
            <Image
              source={require("../../assets/mark-tile.png")}
              style={styles.mark}
              resizeMode="contain"
            />
          )}

          {/* Help belongs before sign in as much as after. Someone locked out,
              unsure what the app does, or reading about how their location is
              used should not have to get past the door first. HelpScreen is
              registered in both stacks already. */}
          {/* Not on the verify and reset screens: those show a back arrow and a
              centred title, and this would sit on top of them. Someone mid
              verification is inside a task, not looking for the manual. */}
          {headerTitle ? null : (
            <Pressable
              onPress={() => navigation.navigate("Help")}
              style={styles.help}
              hitSlop={10}
            >
              <CircleQuestionMark size={17} color={colors.textMuted} strokeWidth={2} />
              <Text style={styles.helpText}>Help</Text>
            </Pressable>
          )}

          <View style={styles.card}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            <View style={styles.fields}>{children}</View>
          </View>
        </ScrollView>
        <View style={styles.footer}>{footer}</View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PARCHMENT },
  scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 },

  header: { height: 44, flexDirection: "row", alignItems: "center", marginBottom: 8 },
  headBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headTitle: { flex: 1, fontSize: 20, lineHeight: 26, fontWeight: "700", color: colors.ink, textAlign: "center" },

  // The logo tile, lime on Night Indigo. Square, 22 percent radius baked into
  // the asset, so it matches the app icon exactly.
  mark: { width: 56, height: 56, alignSelf: "center", marginTop: 30, marginBottom: 26 },
  // Top right, above the card, out of the way of the form.
  help: {
    position: "absolute", top: 12, right: 4,
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  helpText: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.textMuted },

  card: {
    backgroundColor: colors.bg, borderRadius: 22, padding: 22,
    shadowColor: "#1B1E3D", shadowOpacity: 0.10, shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 }, elevation: 4,
  },
  title: { fontSize: 25, lineHeight: 32, fontWeight: "700", color: colors.ink, textAlign: "center" },
  subtitle: { fontSize: 13, lineHeight: 19, color: colors.textMuted, textAlign: "center", marginTop: 6 },
  fields: { marginTop: 4 },

  footer: { paddingHorizontal: 26, paddingBottom: 22, paddingTop: 16, gap: 12 },

  seg: { flexDirection: "row", gap: 8, justifyContent: "center", marginTop: 18, marginBottom: 4 },
  chip: { paddingHorizontal: 22, paddingVertical: 9, borderRadius: 9 },
  chipOn: { backgroundColor: colors.accent },
  chipText: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.textMuted },
  chipTextOn: { color: colors.ink },
});


