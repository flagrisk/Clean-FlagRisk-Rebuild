// Sign In (theme-aware). Email/password login via Supabase.
import { useState } from "react";
import { showAlert } from "../components/Feedback";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { AuthInput } from "../components/AuthInput";
import { useAuthColors, AuthTabs } from "./authShared";

export function SignInScreen({ navigation }: any) {
  const c = useAuthColors();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onLogin() {
    if (!email.trim() || !password) return showAlert({ title: "Enter your email and password", tone: "error" });
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) return showAlert({ title: "Could not sign in", message: error.message, tone: "error" });
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: c.text }]}>Sign In</Text>
        <Text style={[styles.subtitle, { color: c.muted }]}>Sign in to access your account</Text>
        <AuthTabs active="email" onEmail={() => {}} />

        <View style={{ gap: 18 }}>
          <AuthInput value={email} onChangeText={setEmail} placeholder="Email Address" icon="@" keyboardType="email-address" />
          <AuthInput value={password} onChangeText={setPassword} placeholder="Password" secure />
        </View>

        <Text style={[styles.forgot, { color: c.accentOn }]} onPress={() => showAlert({ title: "Coming soon", message: "Password reset will be added later." })}>
          Forgot Password?
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <Text style={[styles.switch, { color: c.text }]}>
          Don't have an account?{" "}
          <Text style={[styles.switchLink, { color: c.accentOn }]} onPress={() => navigation.navigate("CreateAccount")}>Create Account</Text>
        </Text>
        <Text style={[styles.switchLink, { color: c.accentOn, textAlign: "center", marginTop: 16 }]} onPress={() => navigation.navigate("Help")}>Need help?</Text>
        <Pressable style={[styles.cta, { backgroundColor: c.accent }, loading && { opacity: 0.7 }]} onPress={onLogin} disabled={loading}>
          <Text style={[styles.ctaText, { color: c.accentText }]}>{loading ? "Signing in..." : "Log In"}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 24, paddingTop: 24 },
  title: { fontSize: 34, fontWeight: "800" },
  subtitle: { fontSize: 16, marginTop: 4, marginBottom: 28 },
  forgot: { fontWeight: "700", textAlign: "right", marginTop: 16 },
  footer: { paddingHorizontal: 24, paddingBottom: 32, gap: 18 },
  switch: { textAlign: "center" },
  switchLink: { fontWeight: "700" },
  cta: { height: 60, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  ctaText: { fontSize: 17, fontWeight: "800" },
});
