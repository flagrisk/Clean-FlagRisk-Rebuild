// Change Password. In-app form (auth.updateUser) with a reset-email fallback.
import { useState } from "react";
import { showAlert } from "../components/Feedback";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronLeft } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing } from "../theme";

export function ChangePasswordScreen() {
  const navigation = useNavigation<any>();
  const { colors, glass, gradients, glow } = useTheme();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (pw.length < 8) return showAlert({ title: "Too short", message: "Use at least 8 characters.", tone: "error" });
    if (pw !== pw2) return showAlert({ title: "Mismatch", message: "The two passwords do not match.", tone: "error" });
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return showAlert({ title: "Could not change password", message: error.message, tone: "error" });
    showAlert({ title: "Password changed", message: "Your password has been updated.", buttons: [{ text: "OK", onPress: () => navigation.goBack() }] });
  }

  async function sendReset() {
    const { data: u } = await supabase.auth.getUser();
    const email = u.user?.email;
    if (!email) return showAlert({ title: "No email on file", message: "A reset email cannot be sent for this account.", tone: "error" });
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) return showAlert({ title: "Could not send", message: error.message, tone: "error" });
    showAlert({ title: "Email sent", message: "Check " + email + " for a password-reset link." });
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={{ flexDirection: "row", alignItems: "center" }}>
          <ChevronLeft size={22} color={colors.text} strokeWidth={2} /><Text style={[styles.back, { color: colors.text }]}>Settings</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <Text style={[styles.header, { color: colors.text }]}>Change password</Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>Enter a new password for your account.</Text>

        <Text style={[styles.label, { color: colors.textMuted }]}>New password</Text>
        <TextInput value={pw} onChangeText={setPw} secureTextEntry placeholder="At least 8 characters"
          placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text, borderColor: glass.stroke, backgroundColor: glass.surface }]} />

        <Text style={[styles.label, { color: colors.textMuted }]}>Confirm new password</Text>
        <TextInput value={pw2} onChangeText={setPw2} secureTextEntry placeholder="Re-enter password"
          placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text, borderColor: glass.stroke, backgroundColor: glass.surface }]} />

        <Pressable onPress={save} disabled={busy} style={{ marginTop: spacing.lg }}>
          <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.saveBtn, { boxShadow: glow.brand } as any, busy && { opacity: 0.7 }]}>
            <Text style={[styles.saveText, { color: colors.accentText }]}>{busy ? "Saving..." : "Update password"}</Text>
          </LinearGradient>
        </Pressable>

        <Pressable onPress={sendReset} style={{ marginTop: spacing.xl, alignItems: "center" }}>
          <Text style={[styles.resetLink, { color: colors.accentOn }]}>Send me a reset email instead</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topbar: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  back: { fontSize: 16, fontWeight: "700", marginLeft: 2 },
  header: { fontSize: 24, fontWeight: "800", marginTop: spacing.sm },
  sub: { fontSize: 14, marginTop: 4, marginBottom: spacing.lg },
  label: { fontSize: 13, fontWeight: "600", marginTop: spacing.md, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 14, fontSize: 16 },
  saveBtn: { height: 54, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  saveText: { fontSize: 16, fontWeight: "800" },
  resetLink: { fontSize: 15, fontWeight: "700" },
});
