// Settings (V2 rich + theming). Gradient section-icon chips, gradient active
// appearance button, richer cards. All logic unchanged.
import { useCallback, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { SunMoon, Bell, MapPin, UserCog, ChevronRight, CreditCard, Receipt, KeyRound, LifeBuoy, Mail, HelpCircle, FileText, Shield, ExternalLink, Compass } from "lucide-react-native";
import { useTour } from "../components/Tour";

// Replace these with your real hosted URLs before launch.
const SUPPORT_EMAIL = "flagrisk@gmail.com";
const FAQ_URL = "https://flagrisk.org/faq";
const TERMS_URL = "https://flagrisk.org/terms";
const PRIVACY_URL = "https://flagrisk.org/privacy";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing } from "../theme";

type Prefs = {
  push_enabled: boolean; in_app_enabled: boolean;
  email_enabled: boolean; sms_enabled: boolean;
};

export function SettingsScreen() {
  const navigation = useNavigation<any>();
  const { startTour } = useTour();
  const { colors, glass, gradients, glow, mode, setMode } = useTheme();
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("my_notification_prefs");
    if (data) setPrefs({
      push_enabled: data.push_enabled, in_app_enabled: data.in_app_enabled,
      email_enabled: data.email_enabled, sms_enabled: data.sms_enabled,
    });
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function toggle(key: keyof Prefs, value: boolean) {
    if (!prefs) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("notification_preferences")
      .upsert({ user_id: u.user?.id, [key]: value }, { onConflict: "user_id" });
  }

  const SectionHead = ({ icon: Icon, label }: { icon: any; label: string }) => (
    <View style={styles.sectionRow}>
      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.sectionChip, { boxShadow: glow.brand } as any]}>
        <Icon size={16} color={colors.accentText} strokeWidth={2} />
      </LinearGradient>
      <Text style={[styles.section, { color: colors.text }]}>{label}</Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={[styles.back, { color: colors.accentOn }]}>‹ Back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }}>
        <SectionHead icon={SunMoon} label="Appearance" />
        <View style={[styles.card, { backgroundColor: glass.surface, borderColor: glass.stroke, boxShadow: glow.soft } as any]}>
          <View style={styles.modeRow}>
            <ModeBtn label="Light" active={mode === "light"} onPress={() => setMode("light")}
              colors={colors} glass={glass} gradients={gradients} glow={glow} />
            <ModeBtn label="Dark" active={mode === "dark"} onPress={() => setMode("dark")}
              colors={colors} glass={glass} gradients={gradients} glow={glow} />
          </View>
        </View>

        <SectionHead icon={Bell} label="Notifications" />
        <View style={[styles.card, { backgroundColor: glass.surface, borderColor: glass.stroke, boxShadow: glow.soft, paddingHorizontal: spacing.lg } as any]}>
          <ToggleRow colors={colors} label="Push notifications" desc="Buzz my phone for alerts"
            value={prefs?.push_enabled ?? true} onChange={(v) => toggle("push_enabled", v)} />
          <ToggleRow colors={colors} label="In-app alerts" desc="Show alerts in my inbox"
            value={prefs?.in_app_enabled ?? true} onChange={(v) => toggle("in_app_enabled", v)} />
          <ToggleRow colors={colors} label="Email" desc="Email me alerts (coming soon)"
            value={prefs?.email_enabled ?? false} onChange={(v) => toggle("email_enabled", v)} />
          <ToggleRow colors={colors} label="SMS" desc="Text me alerts (coming soon)"
            value={prefs?.sms_enabled ?? false} onChange={(v) => toggle("sms_enabled", v)} last />
        </View>

        <SectionHead icon={Compass} label="Guide" />
        <Pressable style={[styles.linkRow, { backgroundColor: glass.surface, borderColor: glass.stroke, boxShadow: glow.soft } as any]} onPress={() => { navigation.goBack(); setTimeout(() => startTour(), 350); }}>
          <Text style={[styles.linkText, { color: colors.text }]}>Take a tour</Text>
          <ChevronRight size={20} color={colors.textMuted} />
        </Pressable>
        <SectionHead icon={MapPin} label="Places" />
        <Pressable style={[styles.linkRow, { backgroundColor: glass.surface, borderColor: glass.stroke, boxShadow: glow.soft } as any]} onPress={() => navigation.navigate("SavedPlaces")}>
          <Text style={[styles.linkText, { color: colors.text }]}>Saved places</Text>
          <ChevronRight size={20} color={colors.textMuted} />
        </Pressable>
        <Pressable style={[styles.linkRow, { backgroundColor: glass.surface, borderColor: glass.stroke, boxShadow: glow.soft, marginTop: spacing.sm } as any]} onPress={() => navigation.navigate("TripWatch")}>
          <Text style={[styles.linkText, { color: colors.text }]}>Trip Watch</Text>
          <ChevronRight size={20} color={colors.textMuted} />
        </Pressable>

        <SectionHead icon={CreditCard} label="Subscription" />
        <Pressable style={[styles.linkRow, { backgroundColor: glass.surface, borderColor: glass.stroke, boxShadow: glow.soft } as any]} onPress={() => navigation.navigate("PlanPricing")}>
          <Text style={[styles.linkText, { color: colors.text }]}>Plans and pricing</Text>
          <ChevronRight size={20} color={colors.textMuted} />
        </Pressable>
        <Pressable style={[styles.linkRow, { backgroundColor: glass.surface, borderColor: glass.stroke, boxShadow: glow.soft, marginTop: spacing.sm } as any]} onPress={() => navigation.navigate("PaymentHistory")}>
          <Text style={[styles.linkText, { color: colors.text }]}>Payment history</Text>
          <ChevronRight size={20} color={colors.textMuted} />
        </Pressable>

        <SectionHead icon={UserCog} label="Account" />
        <Pressable style={[styles.linkRow, { backgroundColor: glass.surface, borderColor: glass.stroke, boxShadow: glow.soft } as any]} onPress={() => navigation.navigate("EditProfile")}>
          <Text style={[styles.linkText, { color: colors.text }]}>Edit profile</Text>
          <ChevronRight size={20} color={colors.textMuted} />
        </Pressable>
        <Pressable style={[styles.linkRow, { backgroundColor: glass.surface, borderColor: glass.stroke, boxShadow: glow.soft, marginTop: spacing.sm } as any]} onPress={() => navigation.navigate("ChangePassword")}>
          <Text style={[styles.linkText, { color: colors.text }]}>Change password</Text>
          <ChevronRight size={20} color={colors.textMuted} />
        </Pressable>

        <SectionHead icon={LifeBuoy} label="Support and legal" />
        <Pressable style={[styles.linkRow, { backgroundColor: glass.surface, borderColor: glass.stroke, boxShadow: glow.soft } as any]} onPress={() => Linking.openURL("mailto:" + SUPPORT_EMAIL)}>
          <View style={styles.rowLeft}><Mail size={18} color={colors.textMuted} strokeWidth={2} /><Text style={[styles.linkText, { color: colors.text }]}>Email support</Text></View>
          <ExternalLink size={18} color={colors.textMuted} />
        </Pressable>
        <Pressable style={[styles.linkRow, { backgroundColor: glass.surface, borderColor: glass.stroke, boxShadow: glow.soft, marginTop: spacing.sm } as any]} onPress={() => navigation.navigate("Help")}>
          <View style={styles.rowLeft}><HelpCircle size={18} color={colors.textMuted} strokeWidth={2} /><Text style={[styles.linkText, { color: colors.text }]}>Help & FAQs</Text></View>
          <ChevronRight size={18} color={colors.textMuted} />
        </Pressable>
        <Pressable style={[styles.linkRow, { backgroundColor: glass.surface, borderColor: glass.stroke, boxShadow: glow.soft, marginTop: spacing.sm } as any]} onPress={() => navigation.navigate("Support")}>
          <View style={styles.rowLeft}><LifeBuoy size={18} color={colors.textMuted} strokeWidth={2} /><Text style={[styles.linkText, { color: colors.text }]}>Contact support</Text></View>
          <ChevronRight size={18} color={colors.textMuted} />
        </Pressable>
        <Pressable style={[styles.linkRow, { backgroundColor: glass.surface, borderColor: glass.stroke, boxShadow: glow.soft, marginTop: spacing.sm } as any]} onPress={() => Linking.openURL(TERMS_URL)}>
          <View style={styles.rowLeft}><FileText size={18} color={colors.textMuted} strokeWidth={2} /><Text style={[styles.linkText, { color: colors.text }]}>Terms of Use</Text></View>
          <ExternalLink size={18} color={colors.textMuted} />
        </Pressable>
        <Pressable style={[styles.linkRow, { backgroundColor: glass.surface, borderColor: glass.stroke, boxShadow: glow.soft, marginTop: spacing.sm } as any]} onPress={() => Linking.openURL(PRIVACY_URL)}>
          <View style={styles.rowLeft}><Shield size={18} color={colors.textMuted} strokeWidth={2} /><Text style={[styles.linkText, { color: colors.text }]}>Privacy Policy</Text></View>
          <ExternalLink size={18} color={colors.textMuted} />
        </Pressable>
        <Pressable style={[styles.linkRow, { borderColor: colors.danger + "55", backgroundColor: colors.danger + "12", marginTop: spacing.md }]} onPress={() => supabase.auth.signOut({ scope: "local" })}>
          <Text style={[styles.linkText, { color: colors.danger, fontWeight: "700" }]}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function ModeBtn({ label, active, onPress, colors, glass, gradients, glow }: any) {
  if (active) {
    return (
      <Pressable onPress={onPress} style={{ flex: 1 }}>
        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[styles.modeBtn, { boxShadow: glow.brand } as any]}>
          <Text style={{ color: colors.accentText, fontWeight: "800", fontSize: 15 }}>{label}</Text>
        </LinearGradient>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} style={[styles.modeBtn, { flex: 1, borderWidth: 1, borderColor: glass.strokeStrong, backgroundColor: "transparent" }]}>
      <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

function ToggleRow({ label, desc, value, onChange, colors, last }: any) {
  return (
    <View style={[styles.toggleRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.toggleLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.toggleDesc, { color: colors.textMuted }]}>{desc}</Text>
      </View>
      <Switch value={value} onValueChange={onChange}
        trackColor={{ true: colors.accent, false: "#9a9a9a" }} thumbColor="#fff" />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { fontSize: 16, fontWeight: "700" },
  headerTitle: { fontSize: 18, fontWeight: "800" },
  sectionRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.sm },
  sectionChip: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  section: { fontSize: 14, fontWeight: "800" },
  card: { borderRadius: radius.lg, borderWidth: 1 },
  modeRow: { flexDirection: "row", gap: spacing.md, padding: spacing.md },
  modeBtn: { height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  toggleRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md },
  toggleLabel: { fontSize: 16, fontWeight: "600" },
  toggleDesc: { fontSize: 13, marginTop: 2 },
  linkRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg },
  linkText: { fontSize: 16, fontWeight: "600" },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
});


