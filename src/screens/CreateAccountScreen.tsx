// Create Account (theme-aware). Email/password signup via Supabase.
import { useState } from "react";
import { showAlert } from "../components/Feedback";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { AuthInput } from "../components/AuthInput";
import { useAuthColors, AuthTabs } from "./authShared";

export function CreateAccountScreen({ navigation }: any) {
  const c = useAuthColors();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onCreate() {
    if (!name.trim()) return showAlert({ title: "Please enter your name", tone: "error" });
    if (!email.trim()) return showAlert({ title: "Please enter your email", tone: "error" });
    if (password.length < 6) return showAlert({ title: "Password must be at least 6 characters", tone: "error" });
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
      return showAlert({ title: "You already have an account", message: "This email is already registered. Try signing in instead.", buttons: [{ text: "Go to sign in", onPress: () => navigation.navigate("SignIn") }] });
    }
    if (data.session) {
      // session exists; App.tsx swaps stacks automatically
    } else {
      showAlert({ title: "Almost there", message: "Check your email to confirm your account, then sign in.", buttons: [{ text: "OK", onPress: () => navigation.navigate("SignIn") }] });
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: c.text }]}>Create Account</Text>
        <AuthTabs active="email" onEmail={() => {}} />

        <View style={{ gap: 18 }}>
          <AuthInput value={name} onChangeText={setName} placeholder="Full name" autoCapitalize="words" />
          <AuthInput value={email} onChangeText={setEmail} placeholder="Email Address" icon="@" keyboardType="email-address" />
          <AuthInput value={password} onChangeText={setPassword} placeholder="Password" secure />
        </View>

        <Pressable style={styles.terms} onPress={() => setAgreed((a) => !a)}>
          <View style={[styles.checkbox, { borderColor: c.accent }, agreed && { backgroundColor: c.accent }]} />
          <Text style={[styles.termsText, { color: c.muted }]}>
            By continuing, you agree to FlagRisk's <Text style={[styles.link, { color: c.text }]}>Terms and Conditions</Text> and{" "}
            <Text style={[styles.link, { color: c.text }]}>Privacy Policy</Text>
          </Text>
        </Pressable>
      </ScrollView>

      <View style={styles.footer}>
        <Text style={[styles.switch, { color: c.text }]}>
          Already have an account?{" "}
          <Text style={[styles.switchLink, { color: c.accentOn }]} onPress={() => navigation.navigate("SignIn")}>Sign In</Text>
        </Text>
        <Text style={[styles.switchLink, { color: c.accentOn, textAlign: "center", marginTop: 16 }]} onPress={() => navigation.navigate("Help")}>Need help?</Text>
        <Pressable style={[styles.cta, { backgroundColor: c.accent }, loading && { opacity: 0.7 }]} onPress={onCreate} disabled={loading}>
          <Text style={[styles.ctaText, { color: c.accentText }]}>{loading ? "Creating..." : "Create Account"}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 24, paddingTop: 24 },
  title: { fontSize: 34, fontWeight: "800", marginBottom: 28 },
  terms: { flexDirection: "row", marginTop: 24, gap: 12, alignItems: "flex-start" },
  checkbox: { width: 26, height: 26, borderRadius: 6, borderWidth: 2, marginTop: 2 },
  termsText: { flex: 1, lineHeight: 20 },
  link: { fontWeight: "700", textDecorationLine: "underline" },
  footer: { paddingHorizontal: 24, paddingBottom: 32, gap: 18 },
  switch: { textAlign: "center" },
  switchLink: { fontWeight: "700" },
  cta: { height: 60, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  ctaText: { fontSize: 17, fontWeight: "800" },
});
