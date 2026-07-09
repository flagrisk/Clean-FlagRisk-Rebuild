// Edit Profile (V2 + theming). Country-aware phone input + keyboard-safe scroll.
import { useCallback, useState } from "react";
import { showAlert } from "../components/Feedback";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { User, Phone } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing } from "../theme";
import { PhoneInput } from "../components/PhoneInput";
import { COUNTRIES, DEFAULT_COUNTRY } from "../data/countries";

// Split a stored full number (e.g. "+2348030000000") into { dial, number }.
function splitPhone(full: string): { dial: string; number: string } {
  const v = (full || "").trim();
  if (!v.startsWith("+")) return { dial: DEFAULT_COUNTRY.dial, number: v.replace(/[^0-9]/g, "") };
  // Longest matching dial code wins (e.g. +1 vs +1...).
  const match = [...COUNTRIES]
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((c) => v.startsWith(c.dial));
  if (match) return { dial: match.dial, number: v.slice(match.dial.length).replace(/[^0-9]/g, "") };
  return { dial: DEFAULT_COUNTRY.dial, number: v.replace(/[^0-9]/g, "") };
}

export function EditProfileScreen() {
  const navigation = useNavigation<any>();
  const { colors, glass, gradients, glow } = useTheme();
  const [name, setName] = useState("");
  const [dial, setDial] = useState(DEFAULT_COUNTRY.dial);
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user?.id) return;
    const { data } = await supabase.from("profiles").select("display_name, phone").eq("id", u.user.id).single();
    if (data) {
      setName(data.display_name ?? "");
      const { dial: d, number: n } = splitPhone(data.phone ?? "");
      setDial(d); setNumber(n);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function save() {
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const fullPhone = number.trim() ? `${dial}${number.trim()}` : null;
    const { error } = await supabase.from("profiles")
      .update({ display_name: name.trim() || null, phone: fullPhone })
      .eq("id", u.user?.id);
    setBusy(false);
    if (error) return showAlert({ title: "Could not save", message: error.message, tone: "error" });
    showAlert({ title: "Saved", message: "Your profile has been updated." });
    navigation.goBack();
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={[styles.back, { color: colors.accentOn }]}>‹ Back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Edit Profile</Text>
        <View style={{ width: 50 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl }}
          keyboardShouldPersistTaps="handled"
        >
          <View>
            <View style={styles.labelRow}>
              <User size={16} color={colors.accentOn} strokeWidth={2} />
              <Text style={[styles.label, { color: colors.text }]}>Display name</Text>
            </View>
            <TextInput style={[styles.input, { borderColor: glass.stroke, backgroundColor: glass.surface, color: colors.text, boxShadow: glow.soft } as any]}
              value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={colors.textMuted} />
          </View>

          <View>
            <View style={styles.labelRow}>
              <Phone size={16} color={colors.accentOn} strokeWidth={2} />
              <Text style={[styles.label, { color: colors.text }]}>Phone</Text>
            </View>
            <PhoneInput
              dial={dial}
              number={number}
              onChangeDial={setDial}
              onChangeNumber={setNumber}
              placeholder="Phone number"
            />
            <Text style={[styles.hint, { color: colors.textMuted }]}>Stored as contact info. Phone verification comes later.</Text>
          </View>

          <Pressable style={styles.saveWrap} onPress={save} disabled={busy}>
            <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={[styles.saveBtn, { boxShadow: glow.brand } as any, busy && { opacity: 0.7 }]}>
              <Text style={[styles.saveText, { color: colors.accentText }]}>{busy ? "Saving..." : "Save changes"}</Text>
            </LinearGradient>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { fontSize: 16, fontWeight: "700" },
  headerTitle: { fontSize: 18, fontWeight: "800" },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: spacing.sm },
  label: { fontSize: 15, fontWeight: "700" },
  input: { height: 56, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, fontSize: 16 },
  hint: { fontSize: 12, marginTop: 6 },
  saveWrap: { marginTop: spacing.md, borderRadius: radius.md },
  saveBtn: { height: 56, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  saveText: { fontSize: 16, fontWeight: "800" },
});
