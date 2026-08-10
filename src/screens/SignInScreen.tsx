// ============================================================================
// Sign In - FlagRisk v2.1
// Designed, not rebuilt: no mockup exists for authentication.
// Email and password via Supabase. Behaviour unchanged.
// ============================================================================
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";
import { showAlert } from "../components/Feedback";
import { AuthInput } from "../components/AuthInput";
import { AuthShell } from "./authShared";
import { colors, radius, spacing, type } from "../theme";

const SEEN_KEY = "flagrisk.onboarding.seen";

export function SignInScreen({ navigation }: any) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Sign In is the landing screen. A first-time user has never seen onboarding,
  // so send them there once; everyone after lands here directly, no flash.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(SEEN_KEY);
        if (alive && seen !== "1") navigation.replace("Onboarding");
      } catch (_e) { /* if storage fails, stay on sign in */ }
    })();
    return () => { alive = false; };
  }, [navigation]);

  async function onLogin() {
    if (!email.trim() || !password) {
      return showAlert({ title: "Enter your email and password", tone: "error" });
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) return showAlert({ title: "Could not sign in", message: error.message, tone: "error" });
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
      <AuthInput
        label="Email address"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
      />
      <AuthInput
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder="Your password"
        secure
      />
      <Pressable
        onPress={() => showAlert({
          title: "Password reset",
          message: "Password reset is not available yet. Contact support and we will help you get back in.",
        })}
        hitSlop={8}
      >
        <Text style={styles.forgot}>Forgot your password?</Text>
      </Pressable>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  forgot: { ...type.caption, fontWeight: "600", color: colors.ink, textAlign: "right", marginTop: 2 },
  cta: { height: 56, borderRadius: radius.md, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  ctaText: { ...type.bodyStrong, fontWeight: "600", color: colors.accent },
  switch: { ...type.caption, color: colors.textMuted, textAlign: "center" },
  switchLink: { fontWeight: "700", color: colors.ink },
  tour: { ...type.caption, fontWeight: "600", color: colors.textMuted, textAlign: "center" },
});
