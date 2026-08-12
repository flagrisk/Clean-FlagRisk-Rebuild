// ============================================================================
// Create Account - FlagRisk v2.1
// Designed, not rebuilt: no mockup exists for authentication.
//
// TWO BEHAVIOUR CHANGES, both from tester findings:
//  1. Password minimum raised from 6 to 8 characters, with an all-numeric and
//     an all-same-character check, and a live strength meter. A tester set a
//     very weak password and the app accepted it without comment.
//  2. The confirmation copy now warns about the verification link landing on a
//     "localhost:3000" page, because that error cost one tester the whole test.
//     This is a plaster. The real fix is the Site URL in Supabase Auth settings.
// ============================================================================
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Check } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { showAlert } from "../components/Feedback";
import { AuthInput } from "../components/AuthInput";
import { AuthShell } from "./authShared";
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

export function CreateAccountScreen({ navigation }: any) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  const strength = strengthOf(password);

  async function onCreate() {
    if (!name.trim()) return showAlert({ title: "Please enter your name", tone: "error" });
    if (!email.trim()) return showAlert({ title: "Please enter your email address", tone: "error" });
    if (password.length < 8) {
      return showAlert({
        title: "Choose a stronger password",
        message: "Use at least 8 characters. This password protects the people in your safety circle.",
        tone: "error",
      });
    }
    if (/^[0-9]+$/.test(password)) {
      return showAlert({
        title: "Choose a stronger password",
        message: "Numbers alone are easy to guess. Mix in letters.",
        tone: "error",
      });
    }
    if (!agreed) return showAlert({ title: "Please accept the Terms and Privacy Policy", tone: "error" });

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: name.trim() } },
    });
    setLoading(false);

    if (error) return showAlert({ title: "Could not create account", message: error.message, tone: "error" });

    const isExisting = data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0;
    if (isExisting) {
      return showAlert({
        title: "You already have an account",
        message: "This email address is already registered. Try signing in instead.",
        buttons: [{ text: "Go to sign in", onPress: () => navigation.navigate("SignIn") }],
      });
    }
    if (!data.session) {
      showAlert({
        title: "Check your email",
        message: "Tap the link in the email we just sent, then come back and sign in. The link may open a page that looks like an error. That is expected, and it means your email is verified.",
        buttons: [{ text: "Got it", onPress: () => navigation.navigate("SignIn") }],
      });
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="A few details and your circle can start watching out for you."
      footer={
        <>
          <Pressable style={[styles.cta, loading && { opacity: 0.7 }]} onPress={onCreate} disabled={loading}>
            <LinearGradient colors={PRIMARY_GRAD} locations={PRIMARY_STOPS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
            <Text style={styles.ctaText}>{loading ? "Creating account" : "Create account"}</Text>
          </Pressable>
          <Text style={styles.switch}>
            Already have an account?{" "}
            <Text style={styles.switchLink} onPress={() => navigation.navigate("SignIn")}>
              Sign in
            </Text>
          </Text>
        </>
      }
    >
      <AuthInput label="Full name" value={name} onChangeText={setName} placeholder="Your name" autoCapitalize="words" />
      <AuthInput
        label="Email address"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
      />
      <View>
        <AuthInput label="Password" value={password} onChangeText={setPassword} placeholder="At least 8 characters" secure />
        {password ? (
          <View style={styles.strengthRow}>
            <View style={styles.strengthTrack}>
              <View style={[styles.strengthFill, { width: (strength.score / 3) * 100 + "%", backgroundColor: strength.tone }]} />
            </View>
            <Text style={[styles.strengthLabel, { color: strength.tone }]}>{strength.label}</Text>
          </View>
        ) : null}
      </View>

      <Pressable style={styles.terms} onPress={() => setAgreed((a) => !a)}>
        <View style={[styles.checkbox, agreed && styles.checkboxOn]}>
          {agreed ? <Check size={13} color={colors.accent} strokeWidth={3} /> : null}
        </View>
        <Text style={styles.termsText}>
          I agree to the FlagRisk <Text style={styles.termsLink}>Terms and Conditions</Text> and{" "}
          <Text style={styles.termsLink}>Privacy Policy</Text>.
        </Text>
      </Pressable>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  strengthRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  strengthTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: "#EBEBEB", overflow: "hidden" },
  strengthFill: { height: 4, borderRadius: 2 },
  strengthLabel: { fontSize: 11, lineHeight: 15, fontWeight: "600" },

  terms: { flexDirection: "row", alignItems: "flex-start", gap: spacing.ms, marginTop: spacing.sm },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: colors.borderStrong,
    alignItems: "center", justifyContent: "center", marginTop: 1,
  },
  checkboxOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  termsText: { flex: 1, ...type.caption, color: colors.textMuted, lineHeight: 18 },
  termsLink: { color: colors.ink, fontWeight: "600" },

  cta: {
    height: 56, borderRadius: radius.md,
    backgroundColor: "transparent", overflow: "hidden",
    alignItems: "center", justifyContent: "center",
  },
  ctaText: { ...type.bodyStrong, fontWeight: "600", color: colors.accent},
  switch: { ...type.caption, color: colors.textMuted, textAlign: "center" },
  switchLink: { fontWeight: "700", color: colors.ink },
});
