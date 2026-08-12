// ============================================================================
// Edit Profile - FlagRisk v2.1
// Rebuilt against Figma "Edit Profile" (11.0 Profile flow) and Profile_Saved.
//   header 36pt round back | title 20/700 centred | 36pt #F0F0F0 close
//   avatar 100pt with confirm badge | name 20/700 | email 12 muted
//   field label 14/500 | input 48pt r8 #FAFAFA, ink border when focused
//   Save Changes: ink pill, lime label, pinned at the foot
// The mockup label reads "Diplay Name". Corrected here.
// ============================================================================
import { useCallback, useState } from "react";
import {
  Image, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { ArrowLeft, X, Check } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { showAlert } from "../components/Feedback";
import { useRiskCache } from "../theme/RiskCache";
import { PhoneInput } from "../components/PhoneInput";
import { COUNTRIES, DEFAULT_COUNTRY } from "../data/countries";
import { colors, radius, spacing, type } from "../theme";

// The primary fill. Ink through graphite on the same 135 degree axis as the
// Dashboard tiles. A stylesheet cannot hold a gradient, so it is laid behind
// the button content instead.
const PRIMARY_GRAD = ["#101216", "#1B1E24", "#33373F"] as const;
const PRIMARY_STOPS = [0, 0.45, 1] as const;


function splitPhone(full: string): { dial: string; number: string } {
  const v = (full || "").trim();
  if (!v.startsWith("+")) return { dial: DEFAULT_COUNTRY.dial, number: v.replace(/[^0-9]/g, "") };
  const match = [...COUNTRIES]
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((c) => v.startsWith(c.dial));
  if (match) return { dial: match.dial, number: v.slice(match.dial.length).replace(/[^0-9]/g, "") };
  return { dial: DEFAULT_COUNTRY.dial, number: v.replace(/[^0-9]/g, "") };
}

export function EditProfileScreen() {
  const navigation = useNavigation<any>();
  const cache = useRiskCache();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [dial, setDial] = useState(DEFAULT_COUNTRY.dial);
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    setEmail(u.user?.email ?? "");
    if (!u.user?.id) return;
    const { data } = await supabase
      .from("profiles").select("display_name, phone, avatar_url").eq("id", u.user.id).single();
    if (data) {
      setName(data.display_name ?? "");
      setAvatarUrl(data.avatar_url ?? null);
      const parts = splitPhone(data.phone ?? "");
      setDial(parts.dial); setNumber(parts.number);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function save() {
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const fullPhone = number.trim() ? dial + number.trim() : null;
    const { error } = await supabase.from("profiles")
      .update({ display_name: name.trim() || null, phone: fullPhone })
      .eq("id", u.user?.id);
    setBusy(false);
    if (error) return showAlert({ title: "Could not save", message: error.message, tone: "error" });
    cache.setProfile({
      name: name.trim(),
      email,
      phone: fullPhone ?? "",
      tier: cache.profile ? cache.profile.tier : "basic",
      avatarUrl,
    });
    showAlert({ title: "Saved", message: "Your profile has been updated." });
    navigation.goBack();
  }

  const initials = (name || email || "?").split(/[ @]/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtnPlain} hitSlop={8}>
          <ArrowLeft size={20} color={colors.ink} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headTitle}>Edit profile</Text>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtnFilled} hitSlop={8}>
          <X size={18} color={colors.ink} strokeWidth={2} />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
              ) : (
                <Text style={styles.avatarText}>{initials}</Text>
              )}
            </View>
            <View style={styles.badge}>
              <Check size={13} color={colors.ink} strokeWidth={3} />
            </View>
          </View>

          <Text style={styles.name}>{name || "Your name"}</Text>
          <Text style={styles.email} numberOfLines={1}>{email || "-"}</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Display name</Text>
            <TextInput
              style={[styles.input, focused && styles.inputFocused]}
              value={name}
              onChangeText={setName}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Enter display name"
              placeholderTextColor="#8B8F96"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Phone number</Text>
            <PhoneInput
              dial={dial}
              number={number}
              onChangeDial={setDial}
              onChangeNumber={setNumber}
              placeholder="Phone number"
            />
            <Text style={styles.hint}>Stored as contact information. Phone verification comes later.</Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable style={[styles.saveBtn, busy && { opacity: 0.7 }]} onPress={save} disabled={busy}>
            <LinearGradient colors={PRIMARY_GRAD} locations={PRIMARY_STOPS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
            <Text style={styles.saveText}>{busy ? "Saving" : "Save changes"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  header: { height: 36, flexDirection: "row", alignItems: "center", marginHorizontal: spacing.gutter, marginTop: spacing.md },
  headBtnPlain: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headBtnFilled: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#F0F0F0", alignItems: "center", justifyContent: "center" },
  headTitle: { flex: 1, ...type.heading, color: colors.ink, textAlign: "center" },

  scroll: { paddingHorizontal: spacing.gutter, paddingTop: spacing.xl, paddingBottom: spacing.xl, alignItems: "center" },

  avatarWrap: { width: 100, height: 100 },
  avatar: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: "#F0F0F0",
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarText: { ...type.display, color: colors.textMuted },
  badge: {
    position: "absolute", right: 2, bottom: 4, width: 26, height: 26, borderRadius: 13,
    backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.bg,
    alignItems: "center", justifyContent: "center",
  },

  name: { ...type.heading, color: colors.ink, marginTop: spacing.md },
  email: { ...type.caption, color: colors.textMuted, marginTop: 2 },

  field: { width: "100%", marginTop: spacing.xl },
  label: { ...type.label, fontWeight: "500", color: colors.ink, marginBottom: spacing.sm },
  input: {
    height: 48, borderRadius: radius.sm, backgroundColor: "#F1F2F5", borderWidth: 1, borderColor: "rgba(20,21,42,0.14)",
    borderWidth: 1, borderColor: colors.bgElevated,
    paddingHorizontal: spacing.md, ...type.body, color: colors.ink,
  },
  inputFocused: { borderColor: colors.ink, backgroundColor: colors.bg },
  hint: { ...type.caption, color: colors.textMuted, marginTop: 8 },

  footer: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.md },
  saveBtn: { height: 52, borderRadius: radius.md, backgroundColor: "transparent", overflow: "hidden", alignItems: "center", justifyContent: "center" },
  saveText: { ...type.bodyStrong, fontWeight: "600", color: colors.accent},
});
