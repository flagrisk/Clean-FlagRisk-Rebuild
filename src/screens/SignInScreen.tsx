// ============================================================================
// Sign In - FlagRisk v2.1
// Designed, not rebuilt: no mockup exists for authentication.
//
// Phone or email, both with a password. The code a phone user received at
// signup was a one time confirmation that the number is theirs, not a login
// step, so nobody waits for an SMS to get in.
// ============================================================================
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";
import { showAlert } from "../components/Feedback";
import { AuthInput } from "../components/AuthInput";
import { AuthShell, AuthTabs } from "./authShared";
import { colors, radius, spacing, type } from "../theme";

// The primary fill. Ink through graphite on the same 135 degree axis as the
// Dashboard tiles. A stylesheet cannot hold a gradient, so it is laid behind
// the button content instead.
const PRIMARY_GRAD = ["#101216", "#1B1E24", "#33373F"] as const;
const PRIMARY_STOPS = [0, 0.45, 1] as const;
const SEEN_KEY = "flagrisk.onboarding.seen";
const MODE_KEY = "flagrisk.auth.mode";

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

export function SignInScreen({ navigation }: any) {
  const [mode, setMode] = useState<"phone" | "email">("phone");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  // Sign In is the landing screen. A first-time user has never seen onboarding,
  // so send them there once; everyone after lands here directly, no flash.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(SEEN_KEY);
        if (alive && seen !== "1") { navigation.replace("Onboarding"); return; }
        // Open on whichever way they signed up, so a returning user is not
        // asked to find the right tab every time.
        const last = await AsyncStorage.getItem(MODE_KEY);
        if (alive && (last === "phone" || last === "email")) setMode(last);
      } catch (_e) { /* if storage fails, stay on sign in */ }
    })();
    return () => { alive = false; };
  }, [navigation]);

  async function onLogin() {
    if (!password) return showAlert({ title: "Enter your password", tone: "error" });

    setLoading(true);
    const { error } = mode === "phone"
      ? await supabase.auth.signInWithPassword({ phone: normalize(phone), password })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);

    if (error) {
      // Supabase says "Invalid login credentials" for both a wrong password and
      // an account that does not exist, which reads as an accusation. Soften it
      // without saying which was wrong, since that would let someone test which
      // numbers are registered.
      const msg = /invalid login/i.test(error.message)
        ? (mode === "phone"
            ? "That phone number and password do not match an account."
            : "That email address and password do not match an account.")
        : error.message;
      return showAlert({ title: "Could not sign in", message: msg, tone: "error" });
    }
    AsyncStorage.setItem(MODE_KEY, mode).catch(() => {});
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to reach your safety circle."
      footer={
        <>
          <Pressable
            style={[styles.cta, loading && { opacity: 0.7 }]}
            onPress={onLogin}
            disabled={loading}
          >
            <LinearGradient colors={PRIMARY_GRAD} locations={PRIMARY_STOPS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
            <Text style={styles.ctaText}>{loading ? "Signing in" : "Sign in"}</Text>
          </Pressable>
          <Text style={styles.switch}>
            Do not have an account?{" "}
            <Text style={styles.switchLink} onPress={() => navigation.navigate("CreateAccount")}>
              Create one
            </Text>
          </Text>
          <Pressable onPress={() => navigation.navigate("Onboarding")} hitSlop={8}>
            <Text style={styles.tour}>See what FlagRisk does</Text>
          </Pressable>
        </>
      }
    >
      {phoneAuth ? <AuthTabs active={mode} onSelect={setMode} /> : null}

      {mode === "phone" ? (
        <AuthInput
          label="Phone number"
          value={phone}
          onChangeText={setPhone}
          placeholder="0803 000 0000"
          keyboardType="phone-pad"
        />
      ) : (
        <AuthInput
          label="Email address"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
        />
      )}

      <AuthInput
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder="Your password"
        secure
      />

      {mode === "email" ? (
        <Pressable
          onPress={() => navigation.navigate("ResetPassword", { email: email.trim() })}
          hitSlop={8}
        >
          <Text style={styles.forgot}>Forgot your password?</Text>
        </Pressable>
      ) : (
        // A phone account resets the same way an email one does: a code to the
        // number, then a new password. Sending them to support was a dead end I
        // left behind when reset was built on email first.
        <Pressable
          onPress={() => navigation.navigate("PhoneVerify", { mode: "reset", phone: phone.trim() })}
          hitSlop={8}
        >
          <Text style={styles.forgot}>Forgot your password?</Text>
        </Pressable>
      )}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  forgot: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.ink, textAlign: "right", marginTop: 12 },
  forgotNote: { ...type.caption, color: colors.textMuted, textAlign: "right", marginTop: 2, lineHeight: 17 },
  cta: {
    height: 54, borderRadius: 13,
    backgroundColor: "transparent", overflow: "hidden",
    alignItems: "center", justifyContent: "center",
  },
  ctaText: { ...type.bodyStrong, fontWeight: "600", color: colors.accent },
  switch: { fontSize: 13, lineHeight: 18, color: colors.textMuted, textAlign: "center" },
  switchLink: { fontWeight: "700", color: colors.ink },
  tour: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.textMuted, textAlign: "center" },
});





