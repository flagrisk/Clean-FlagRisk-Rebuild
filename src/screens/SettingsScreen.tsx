// ============================================================================
// Settings - FlagRisk v2.1
// Rebuilt against Figma "Settings" (node 71:728) with the FULL entry list, not
// the mockup's three-row version: the decision was that Settings keeps
// everything, so Account stays identity-only.
//   header 36pt round back | title 20/700 centred
//   grouped cards #FAFAFA r16 | rows with 40pt white icon circle, chevron right
// The appearance switcher is gone: v2.1 is a single light system. Dark mode
// returns with its own designs.
// ============================================================================
import { useCallback, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import {
  ArrowLeft, Bell, MapPin, ChevronRight, CreditCard, Receipt, KeyRound,
  LifeBuoy, Mail, HelpCircle, FileText, Shield, ExternalLink, Compass,
  UserCog, Car, LogOut,
} from "lucide-react-native";
import { useTour } from "../components/Tour";
import { supabase } from "../../lib/supabase";
import { colors, radius, spacing, type } from "../theme";

const SUPPORT_EMAIL = "flagrisk@gmail.com";
const TERMS_URL = "https://flagrisk.org/terms";
const PRIVACY_URL = "https://flagrisk.org/privacy";

type Prefs = {
  push_enabled: boolean; in_app_enabled: boolean;
  email_enabled: boolean; sms_enabled: boolean;
};

function GroupLabel({ children }: { children: string }) {
  return <Text style={styles.groupLabel}>{children}</Text>;
}

function Row({
  Icon, label, onPress, right, last,
}: { Icon: any; label: string; onPress: () => void; right?: "chevron" | "external"; last?: boolean }) {
  return (
    <Pressable style={[styles.row, last && { borderBottomWidth: 0 }]} onPress={onPress}>
      <View style={styles.rowIcon}>
        <Icon size={18} color={colors.ink} strokeWidth={2} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      {right === "external"
        ? <ExternalLink size={17} color={colors.textMuted} strokeWidth={2} />
        : <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />}
    </Pressable>
  );
}

function ToggleRow({
  label, desc, value, onChange, last,
}: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void; last?: boolean }) {
  return (
    <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleDesc}>{desc}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.ink, false: "#CDCDCD" }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

export function SettingsScreen() {
  const navigation = useNavigation<any>();
  const { startTour } = useTour();
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

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtnPlain} hitSlop={8}>
          <ArrowLeft size={20} color={colors.ink} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headTitle}>Settings</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <GroupLabel>Notifications</GroupLabel>
        <View style={styles.card}>
          <ToggleRow
            label="Push notifications" desc="Buzz my phone for alerts"
            value={prefs ? prefs.push_enabled : true} onChange={(v) => toggle("push_enabled", v)} />
          <ToggleRow
            label="In-app alerts" desc="Show alerts in my inbox"
            value={prefs ? prefs.in_app_enabled : true} onChange={(v) => toggle("in_app_enabled", v)} />
          <ToggleRow
            label="Email" desc="Email me alerts, coming soon"
            value={prefs ? prefs.email_enabled : false} onChange={(v) => toggle("email_enabled", v)} />
          <ToggleRow
            label="SMS" desc="Text me alerts, coming soon"
            value={prefs ? prefs.sms_enabled : false} onChange={(v) => toggle("sms_enabled", v)} last />
        </View>

        <GroupLabel>Safety</GroupLabel>
        <View style={styles.card}>
          <Row Icon={Car} label="Trip Watch" onPress={() => navigation.navigate("TripWatch")} />
          <Row Icon={MapPin} label="Saved places" onPress={() => navigation.navigate("SavedPlaces")} last />
        </View>
        <Text style={styles.groupHint}>
          Saved places are the addresses that matter to you, such as home or work. FlagRisk uses them to
          recognise where you are heading and to warn you about risks near them.
        </Text>

        <GroupLabel>Subscription</GroupLabel>
        <View style={styles.card}>
          <Row Icon={CreditCard} label="Plans and pricing" onPress={() => navigation.navigate("PlanPricing")} />
          <Row Icon={Receipt} label="Payment history" onPress={() => navigation.navigate("PaymentHistory")} last />
        </View>

        <GroupLabel>Account</GroupLabel>
        <View style={styles.card}>
          <Row Icon={UserCog} label="Edit profile" onPress={() => navigation.navigate("EditProfile")} />
          <Row Icon={KeyRound} label="Change password" onPress={() => navigation.navigate("ChangePassword")} />
          <Row
            Icon={Compass}
            label="Take a tour"
            onPress={() => { navigation.goBack(); setTimeout(() => startTour(), 350); }}
            last
          />
        </View>

        <GroupLabel>Support and legal</GroupLabel>
        <View style={styles.card}>
          <Row Icon={HelpCircle} label="Help and FAQs" onPress={() => navigation.navigate("Help")} />
          <Row Icon={LifeBuoy} label="Contact support" onPress={() => navigation.navigate("Support")} />
          <Row Icon={Mail} label="Email support" right="external" onPress={() => Linking.openURL("mailto:" + SUPPORT_EMAIL)} />
          <Row Icon={FileText} label="Terms of use" right="external" onPress={() => Linking.openURL(TERMS_URL)} />
          <Row Icon={Shield} label="Privacy policy" right="external" onPress={() => Linking.openURL(PRIVACY_URL)} last />
        </View>

        <Pressable style={styles.signOut} onPress={() => supabase.auth.signOut({ scope: "local" })}>
          <LogOut size={18} color={colors.riskHigh} strokeWidth={2} />
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  header: { height: 36, flexDirection: "row", alignItems: "center", marginHorizontal: spacing.gutter, marginTop: spacing.md },
  headBtnPlain: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headTitle: { flex: 1, ...type.heading, color: colors.ink, textAlign: "center" },

  scroll: { paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, paddingBottom: spacing.xxl },

  groupLabel: { fontSize: 12, lineHeight: 24, fontWeight: "600", color: "#333333", marginTop: spacing.lg, marginBottom: spacing.sm },
  groupHint: { ...type.caption, color: colors.textMuted, lineHeight: 17, marginTop: spacing.sm },

  card: { backgroundColor: "#FAFAFA", borderRadius: radius.md, paddingHorizontal: spacing.md },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.ms,
    paddingVertical: spacing.ms, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  rowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  rowLabel: { flex: 1, ...type.label, fontWeight: "500", color: colors.ink },
  toggleLabel: { ...type.label, fontWeight: "500", color: colors.ink },
  toggleDesc: { ...type.caption, color: colors.textMuted, marginTop: 2 },

  signOut: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginTop: spacing.xl,
  },
  signOutText: { ...type.label, fontWeight: "600", color: colors.riskHigh },
});
