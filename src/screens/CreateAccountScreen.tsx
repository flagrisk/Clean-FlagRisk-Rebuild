// ============================================================================
// Create Account - FlagRisk v2.1
// Designed, not rebuilt: no mockup exists for authentication.
//
// PHONE OR EMAIL. The phone number is the unique identifier, so the phone path
// is the default and the email path leads straight into phone verification.
// Either way an account ends up with a verified number, which is what tells us
// who is raising an alarm.
//
// A phone signup still sets a password. The code Supabase sends is a one time
// confirmation that the number is theirs, not a login step, so nobody waits for
// an SMS every time they sign in.
//
// The password rules and the strength meter are unchanged, both from tester
// findings: a tester set a very weak password and the app accepted it silently.
// ============================================================================
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Check } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { showAlert } from "../components/Feedback";
import { AuthInput } from "../components/AuthInput";
import { AuthShell, AuthTabs } from "./authShared";
import { colors, radius, spacing, type } from "../theme";

const PRIMARY_GRAD = ["#101216", "#1B1E24", "#33373F"] as const;
const PRIMARY_STOPS = [0, 0.45, 1] as const;

// Same rules as normalize_phone in the database and in the SMS hook. All three
// must agree, or an account created as +234814... cannot be signed into as
// 0814...
function normalize(raw: string, cc = "234"): string {
  let d = (raw || "").replace(/[^0-9]/g, "");
  if (!d) return "";
  if (d.startsWith("234")) { /* already international */ }
  else if (d.startsWith("0")) d = cc + d.slice(1);
  else if (d.length === 10) d = cc + d;
  return "+" + d;
}

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
  const [mode, setMode] = useState<"phone" | "email">("phone");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  // Phone auth is switched off from app_settings while testing, so nobody
  // hits verification mid test. Turning it back on is one SQL update.
  const [phoneAuth, setPhoneAuth] = useState(false);
  useEffect(() => {
    supabase.rpc("public_settings").then(({ data }) => {
      const on = data && (data as any).phone_auth_enabled === "1";
      setPhoneAuth(!!on);
      if (!on) setMode("email");
    }).catch(() => {});
  }, []);
  const strength = strengthOf(password);

  function passwordProblem(): string | null {
    if (password.length < 8) {
      return "Use at least 8 characters. This password protects the people in your safety circle.";
    }
    if (/^[0-9]+$/.test(password)) return "Numbers alone are easy to guess. Mix in letters.";
    return null;
  }

  async function onCreate() {
    if (!name.trim()) return showAlert({ title: "Please enter your name", tone: "error" });

    if (mode === "phone") {
      if (normalize(phone).length < 11) {
        return showAlert({ title: "Please enter your phone number", tone: "error" });
      }
    } else if (!email.trim()) {
      return showAlert({ title: "Please enter your email address", tone: "error" });
    }

    const pw = passwordProblem();
    if (pw) return showAlert({ title: "Choose a stronger password", message: pw, tone: "error" });
    if (!agreed) return showAlert({ title: "Please accept the Terms and Privacy Policy", tone: "error" });

    setLoading(true);

    if (mode === "phone") {
      const p = normalize(phone);
      const { data, error } = await supabase.auth.signUp({
        phone: p,
        password,
        options: { data: { display_name: name.trim() } },
      });
      setLoading(false);
      if (error) {
        return showAlert({
          title: /already/i.test(error.message) ? "You already have an account" : "Could not create account",
          message: /already/i.test(error.message)
            ? "This number is already registered. Try signing in instead."
            : error.message,
          buttons: /already/i.test(error.message)
            ? [{ text: "Go to sign in", onPress: () => navigation.navigate("SignIn") }]
            : undefined,
          tone: /already/i.test(error.message) ? undefined : "error",
        });
      }
      // Supabase does not error on a number that already has an account: it
      // returns success so that nobody can use this form to discover which
      // numbers are registered. The empty identities array is the signal, the
      // same one the email path below relies on.
      const exists = data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0;
      if (exists) {
        // Deliberately does not confirm that the number is registered. Saying
        // so plainly would let anyone type numbers into this form and learn who
        // is on the platform, which is why Supabase returns success rather than
        // an error here. This helps the real owner without answering that.
        return showAlert({
          title: "Already have an account?",
          message: "Sign in with your password. If this is not your number, check the digits and try again.",
          buttons: [
            { text: "Check the number", style: "cancel" },
            { text: "Go to sign in", onPress: () => navigation.navigate("SignIn") },
          ],
        });
      }

      // Supabase sent the code through the Send SMS hook. The next screen
      // confirms it and returns a session.
      return navigation.navigate("PhoneVerify", { mode: "signup", phone: p });
    }

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

    // An email account still needs a verified number before it can flag a risk,
    // raise an alarm or start a Trip Watch. If the signup returned a session we
    // can ask for it now; if email confirmation is required we ask after they
    // sign in, from the prompt on Profile.
    if (data.session) {
      return showAlert({
        title: "One more step",
        message: "Add your phone number so we know who is raising an alarm. You need it to flag a risk, raise an alarm or use Trip Watch.",
        buttons: [{ text: "Add my number", onPress: () => navigation.navigate("PhoneVerify", { mode: "attach" }) }],
      });
    }

    showAlert({
      title: "Check your email",
      message: "Tap the link in the email we just sent, then come back and sign in. You will be asked for your phone number after that.",
      buttons: [{ text: "Got it", onPress: () => navigation.navigate("SignIn") }],
    });
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
      {phoneAuth ? <AuthTabs active={mode} onSelect={setMode} /> : null}

      <AuthInput label="Full name" value={name} onChangeText={setName} placeholder="Your name" autoCapitalize="words" />

      {mode === "phone" ? (
        <View>
          <AuthInput
            label="Phone number"
            value={phone}
            onChangeText={setPhone}
            placeholder="0803 000 0000"
            keyboardType="phone-pad"
          />
          <Text style={styles.note}>
            We will send you a code to confirm it. Your number is never shown to strangers.
          </Text>
        </View>
      ) : (
        <View>
          <AuthInput
            label="Email address"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
          />
          <Text style={styles.note}>
            You will add your phone number next. It is how we know who is raising an alarm.
          </Text>
        </View>
      )}

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
  note: { ...type.caption, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 17 },
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
    height: 54, borderRadius: 13,
    backgroundColor: "transparent", overflow: "hidden",
    alignItems: "center", justifyContent: "center",
  },
  ctaText: { ...type.bodyStrong, fontWeight: "600", color: colors.accent },
  switch: { fontSize: 13, lineHeight: 18, color: colors.textMuted, textAlign: "center" },
  switchLink: { fontWeight: "700", color: colors.ink },
});







