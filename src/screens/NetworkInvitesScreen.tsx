// ============================================================================
// Safety circle requests - FlagRisk v2.1
// Designed, not rebuilt: no mockup exists.
//   header | intro | request cards with the consequence spelled out
//   Accept is ink with a lime label, Decline is an outlined ghost
// This is a consent surface, so the card states plainly what accepting allows
// and that it can be undone. Logic unchanged.
// ============================================================================
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { ArrowLeft, ShieldCheck, UserPlus } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { showAlert } from "../components/Feedback";
import { colors, radius, spacing, type, screenBottomPad } from "../theme";

// The primary fill. Ink through graphite on the same 135 degree axis as the
// Dashboard tiles. A stylesheet cannot hold a gradient, so it is laid behind
// the button content instead.
const PRIMARY_GRAD = ["#101216", "#1B1E24", "#33373F"] as const;
const PRIMARY_STOPS = [0, 0.45, 1] as const;


type Invite = { token: string; inviter_name: string; created_at: string; expires_at: string };

function expiresIn(iso: string) {
  if (!iso) return "";
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  if (days <= 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  return "Expires in " + days + " days";
}

export function NetworkInvitesScreen() {
  const navigation = useNavigation<any>();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("my_incoming_invites");
    setInvites(data ?? []);
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function respond(token: string, accept: boolean, name: string) {
    setBusy(token);
    const fn = accept ? "accept_network_invite" : "decline_network_invite";
    const { error } = await supabase.rpc(fn, { p_token: token });
    setBusy(null);
    if (error) {
      showAlert({ title: "Could not respond", message: error.message, tone: "error" });
      load();
      return;
    }
    showAlert({
      title: accept ? "Added to circle" : "Request declined",
      message: accept
        ? "You are now in the safety circle of " + name + "."
        : "You declined the request from " + name + ".",
    });
    load();
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtnPlain} hitSlop={8}>
          <ArrowLeft size={20} color={colors.ink} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headTitle}>Requests</Text>
        <View style={{ width: 36 }} />
      </View>

      <Text style={styles.intro}>People asking to add you to their trusted circle.</Text>

      {loading ? (
        <ActivityIndicator color={colors.ink} style={{ marginTop: 40 }} />
      ) : invites.length === 0 ? (
        <View style={styles.empty}>
          <UserPlus size={32} color={colors.textFaint} strokeWidth={1.8} />
          <Text style={styles.emptyTitle}>No pending requests</Text>
          <Text style={styles.emptySub}>When someone asks to add you, it appears here.</Text>
        </View>
      ) : (
        <FlatList
          data={invites}
          keyExtractor={(i) => i.token}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, paddingBottom: screenBottomPad }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.chip}>
                  <ShieldCheck size={18} color={colors.ink} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{item.inviter_name}</Text>
                  <Text style={styles.meta}>Wants you in their safety circle</Text>
                </View>
              </View>

              <Text style={styles.explain}>
                If you accept, they can alert you when they flag a risk or fire a panic alarm, and you
                will see their check-ins. You can leave at any time.
              </Text>

              <Text style={styles.expiry}>{expiresIn(item.expires_at)}</Text>

              <View style={styles.actions}>
                <Pressable
                  style={[styles.ghostBtn, busy === item.token && { opacity: 0.6 }]}
                  disabled={busy === item.token}
                  onPress={() => respond(item.token, false, item.inviter_name)}
                >
                  <Text style={styles.ghostText}>Decline</Text>
                </Pressable>
                <Pressable
                  style={[styles.acceptBtn, busy === item.token && { opacity: 0.6 }]}
                  disabled={busy === item.token}
                  onPress={() => respond(item.token, true, item.inviter_name)}
                >
                  <LinearGradient colors={PRIMARY_GRAD} locations={PRIMARY_STOPS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
                  <Text style={styles.acceptText}>Accept</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { height: 36, flexDirection: "row", alignItems: "center", marginHorizontal: spacing.gutter, marginTop: spacing.md },
  headBtnPlain: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headTitle: { flex: 1, ...type.heading, color: colors.ink, textAlign: "center" },
  intro: { ...type.caption, color: colors.textMuted, marginHorizontal: spacing.gutter, marginTop: spacing.sm },

  card: { backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.ms },
  chip: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  name: { ...type.subheading, color: colors.ink },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  explain: { ...type.caption, color: colors.textMuted, lineHeight: 18, marginTop: spacing.ms },
  expiry: { ...type.caption, color: colors.textFaint, marginTop: spacing.sm },

  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  ghostBtn: {
    flex: 1, height: 48, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center", backgroundColor: colors.bg,
  },
  ghostText: { ...type.label, fontWeight: "600", color: colors.ink },
  acceptBtn: { flex: 1, height: 48, borderRadius: radius.sm, backgroundColor: "transparent", overflow: "hidden", alignItems: "center", justifyContent: "center" },
  acceptText: { ...type.label, fontWeight: "600", color: colors.accent},

  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, gap: 8 },
  emptyTitle: { ...type.subheading, color: colors.ink },
  emptySub: { ...type.caption, color: colors.textMuted, textAlign: "center" },
});
