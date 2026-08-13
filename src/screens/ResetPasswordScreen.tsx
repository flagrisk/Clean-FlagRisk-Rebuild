// ============================================================================
// Reset Password - FlagRisk v2.1
// Two steps in one screen. Step one takes the email and asks Supabase to send a
// six-digit code. Step two takes the code and the new password.
//
// The code method was chosen over a magic link deliberately: a link depends on
// the email app handing off to this app, which fails on Android when the mail
// client opens its own browser. A code the person types works regardless, and
// this is a safety product where being locked out matters.
//
// Structure, meter and validation are lifted from ChangePasswordScreen so the
// two behave identically.
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

export function ResetPasswordScreen({ route }: any) {
  const navigation = useNavigation<any>();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(route?.params?.email ?? "");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  const strength = strengthOf(pw);
  const mismatch = pw2.length > 0 && pw !== pw2;

  async function sendCode() {
    const addr = email.trim().toLowerCase();
    if (!addr || addr.indexOf("@") < 0) {
      return showAlert({ title: "Enter your email address", tone: "error" });
    }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(addr);
    setBusy(false);
    // The same message whether or not the address exists. Telling someone an
    // account is absent lets anyone test which emails are registered.
    if (error && !/rate|limit/i.test(error.message)) {
      return showAlert({ title: "Could not send", message: error.message, tone: "error" });
    }
    if (error) {
      return showAlert({
        title: "Too many attempts",
        message: "Wait a few minutes before asking for another code.",
        tone: "error",
      });
    }
    setStep("code");
    showAlert({
      title: "Check your email",
      message: "If " + addr + " has an account, a code is on its way. It expires in one hour.",
    });
  }

  async function confirm() {
    const token = code.trim();
    if (token.length < 6 || !/^[0-9]+$/.test(token)) {
      return showAlert({ title: "Enter the code", message: "Enter the code from your email.", tone: "error" });
    }
    if (pw.length < 8) {
      return showAlert({ title: "Too short", message: "Use at least 8 characters.", tone: "error" });
    }
    if (/^[0-9]+$/.test(pw)) {
      return showAlert({ title: "Choose a stronger password", message: "Numbers alone are easy to guess. Mix in letters.", tone: "error" });
    }
    if (pw !== pw2) {
      return showAlert({ title: "They do not match", message: "The two passwords are different.", tone: "error" });
    }

    setBusy(true);
    // The code proves the person owns the address, and verifying it signs them
    // in. Only then can the password be changed.
    const { error: vErr } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token,
      type: "recovery",
    });
    if (vErr) {
      setBusy(false);
      return showAlert({
        title: "Code not accepted",
        message: /expired/i.test(vErr.message)
          ? "That code has expired. Ask for a new one."
          : "Check the code and try again.",
        tone: "error",
      });
    }
    const { error: uErr } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (uErr) {
      return showAlert({ title: "Could not set your password", message: uErr.message, tone: "error" });
    }
    showAlert({
      title: "Password changed",
      message: "You are signed in with your new password.",
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => (step === "code" ? setStep("email") : navigation.goBack())}
          style={styles.headBtnPlain}
          hitSlop={8}
        >
          <ArrowLeft size={20} color={colors.ink} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headTitle}>Reset password</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {step === "email" ? (
            <>
              <Text style={styles.intro}>
                Enter the email address on your account and we will send you a code.
              </Text>
              <View style={{ marginTop: spacing.lg }}>
                <AuthInput
                  label="Email address"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  keyboardType="email-address"
                />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.intro}>
                We sent a code to {email.trim().toLowerCase()}. Enter it below with your new password.
              </Text>
              <View style={{ marginTop: spacing.lg }}>
                <AuthInput
                  label="Code from your email"
                  value={code}
                  onChangeText={setCode}
                  placeholder="Enter the code"
                  keyboardType="number-pad"
                />
              </View>
              <View style={{ marginTop: spacing.md }}>
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
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            style={[styles.cta, busy && { opacity: 0.7 }]}
            onPress={step === "email" ? sendCode : confirm}
            disabled={busy}
          >
            <LinearGradient colors={PRIMARY_GRAD} locations={PRIMARY_STOPS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
            <Text style={styles.ctaText}>
              {busy
                ? (step === "email" ? "Sending" : "Saving")
                : (step === "email" ? "Send me a code" : "Set new password")}
            </Text>
          </Pressable>

          {step === "code" ? (
            <Pressable onPress={sendCode} hitSlop={8} disabled={busy}>
              <Text style={styles.resetLink}>Send another code</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
              <Text style={styles.resetLink}>Back to sign in</Text>
            </Pressable>
          )}
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
  intro: { ...type.label, fontWeight: "400", color: colors.textMuted, lineHeight: 21 },
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
  ctaText: { ...type.bodyStrong, fontWeight: "600", color: colors.accent },
  resetLink: { ...type.caption, fontWeight: "600", color: colors.ink, textAlign: "center" },
});

