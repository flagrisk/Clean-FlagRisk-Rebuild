// ============================================================================
// Change Password - FlagRisk v2.1
// Designed, not rebuilt: no mockup exists.
//   standard header | labelled fields with the eye reveal | strength meter
//   ink primary with lime label | reset-email fallback as a quiet link
// Behaviour unchanged: auth.updateUser, with resetPasswordForEmail as fallback.
// The eye reveal and the live match check address a tester who hit repeated
// mismatch errors with no way to see what had been typed.
// ============================================================================
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { ArrowLeft } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { showAlert } from "../components/Feedback";
import { AuthInput } from "../components/AuthInput";
import { colors, radius, spacing, type } from "../theme";

// The primary fill. Ink through graphite on the same 135 degree axis as the
// Dashboard tiles. A stylesheet cannot hold a gradient, so it is laid behind
// the button content instead.
const PRIMARY_GRAD = ["#101216", "#1B1E24", "#33373F"] as const;
const PRIMARY_STOPS = [0, 0.45, 1] as const;


function strengthOf(pw: string) {
  if (!pw) return { score: 0, label: "", tone: colors.border };
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (/^[0-9]+$/.test(pw)) s = Math.min(s, 1);
  if (s <= 1) return { score: 1, label: "Weak", tone: colors.riskHigh };
  if (s <= 3) return { score: 2, label: "Fair", tone: colors.riskMedium };
  return { score: 3, label: "Strong", tone: colors.safe };
}

export function ChangePasswordScreen() {
  const navigation = useNavigation<any>();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  const strength = strengthOf(pw);
  const mismatch = pw2.length > 0 && pw !== pw2;

  async function save() {
    if (pw.length < 8) return showAlert({ title: "Too short", message: "Use at least 8 characters.", tone: "error" });
    if (/^[0-9]+$/.test(pw)) {
      return showAlert({ title: "Choose a stronger password", message: "Numbers alone are easy to guess. Mix in letters.", tone: "error" });
    }
    if (pw !== pw2) return showAlert({ title: "They do not match", message: "The two passwords are different.", tone: "error" });
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return showAlert({ title: "Could not change password", message: error.message, tone: "error" });
    showAlert({
      title: "Password changed",
      message: "Your password has been updated.",
      buttons: [{ text: "Done", onPress: () => navigation.goBack() }],
    });
  }

  async function sendReset() {
    const { data: u } = await supabase.auth.getUser();
    const email = u.user?.email;
    if (!email) return showAlert({ title: "No email on file", message: "A reset email cannot be sent for this account.", tone: "error" });
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) return showAlert({ title: "Could not send", message: error.message, tone: "error" });
    showAlert({ title: "Email sent", message: "Check " + email + " for a password reset link." });
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtnPlain} hitSlop={8}>
          <ArrowLeft size={20} color={colors.ink} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headTitle}>Change password</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={styles.intro}>Enter a new password for your account.</Text>

          <View style={{ marginTop: spacing.lg }}>
            <AuthInput label="New password" value={pw} onChangeText={setPw} placeholder="At least 8 characters" secure />
            {pw ? (
              <View style={styles.strengthRow}>
                <View style={styles.strengthTrack}>
                  <View style={[styles.strengthFill, { width: (strength.score / 3) * 100 + "%", backgroundColor: strength.tone }]} />
                </View>
                <Text style={[styles.strengthLabel, { color: strength.tone }]}>{strength.label}</Text>
              </View>
            ) : null}
          </View>

          <View style={{ marginTop: spacing.md }}>
            <AuthInput label="Confirm new password" value={pw2} onChangeText={setPw2} placeholder="Enter it again" secure />
            {mismatch ? <Text style={styles.mismatch}>These do not match yet.</Text> : null}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable style={[styles.cta, busy && { opacity: 0.7 }]} onPress={save} disabled={busy}>
            <LinearGradient colors={PRIMARY_GRAD} locations={PRIMARY_STOPS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
            <Text style={styles.ctaText}>{busy ? "Saving" : "Update password"}</Text>
          </Pressable>
          <Pressable onPress={sendReset} hitSlop={8}>
            <Text style={styles.resetLink}>Send me a reset email instead</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { height: 36, flexDirection: "row", alignItems: "center", marginHorizontal: spacing.gutter, marginTop: spacing.md },
  headBtnPlain: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headTitle: { flex: 1, ...type.heading, color: colors.ink, textAlign: "center" },

  scroll: { paddingHorizontal: spacing.gutter, paddingTop: spacing.lg },
  intro: { ...type.label, fontWeight: "400", color: colors.textMuted },

  strengthRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  strengthTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: "#EBEBEB", overflow: "hidden" },
  strengthFill: { height: 4, borderRadius: 2 },
  strengthLabel: { fontSize: 11, lineHeight: 15, fontWeight: "600" },
  mismatch: { ...type.caption, color: colors.riskHigh, marginTop: spacing.sm },

  footer: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.md, gap: spacing.md },
  cta: {
    height: 56, borderRadius: radius.md,
    backgroundColor: "transparent", overflow: "hidden",
    alignItems: "center", justifyContent: "center",
  },
  ctaText: { ...type.bodyStrong, fontWeight: "600", color: colors.accent},
  resetLink: { ...type.caption, fontWeight: "600", color: colors.ink, textAlign: "center" },
});
