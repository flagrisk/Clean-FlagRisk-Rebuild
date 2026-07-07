// Edit Profile (V2 + theming). Field icons, lifted inputs, gradient save. Logic unchanged.
import { useCallback, useState } from "react";
import { showAlert } from "../components/Feedback";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { User, Phone } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing } from "../theme";

export function EditProfileScreen() {
  const navigation = useNavigation<any>();
  const { colors, glass, gradients, glow } = useTheme();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user?.id) return;
    const { data } = await supabase.from("profiles").select("display_name, phone").eq("id", u.user.id).single();
    if (data) { setName(data.display_name ?? ""); setPhone(data.phone ?? ""); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function save() {
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("profiles")
      .update({ display_name: name.trim() || null, phone: phone.trim() || null })
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

      <View style={{ padding: spacing.lg, gap: spacing.lg }}>
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
          <TextInput style={[styles.input, { borderColor: glass.stroke, backgroundColor: glass.surface, color: colors.text, boxShadow: glow.soft } as any]}
            value={phone} onChangeText={setPhone} placeholder="e.g. +234..." placeholderTextColor={colors.textMuted} keyboardType="phone-pad" />
          <Text style={[styles.hint, { color: colors.textMuted }]}>Stored as contact info. Phone verification comes later.</Text>
        </View>
        <Pressable style={styles.saveWrap} onPress={save} disabled={busy}>
          <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={[styles.saveBtn, { boxShadow: glow.brand } as any, busy && { opacity: 0.7 }]}>
            <Text style={[styles.saveText, { color: colors.accentText }]}>{busy ? "Saving..." : "Save changes"}</Text>
          </LinearGradient>
        </Pressable>
      </View>
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
