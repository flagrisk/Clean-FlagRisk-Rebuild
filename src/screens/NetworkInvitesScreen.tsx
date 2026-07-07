// Incoming network invites — the consent surface. Lists pending requests to join
// someone's safety circle; Accept creates the connection, Decline dismisses it.
import { useCallback, useState } from "react";
import { showAlert } from "../components/Feedback";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronLeft, ShieldCheck, UserPlus } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing } from "../theme";

type Invite = { token: string; inviter_name: string; created_at: string; expires_at: string };

export function NetworkInvitesScreen() {
  const navigation = useNavigation<any>();
  const { colors, glass, gradients, glow } = useTheme();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("my_incoming_invites");
    setInvites(data ?? []); setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function respond(token: string, accept: boolean, name: string) {
    setBusy(token);
    const fn = accept ? "accept_network_invite" : "decline_network_invite";
    const { error } = await supabase.rpc(fn, { p_token: token });
    setBusy(null);
    if (error) { showAlert({ title: "Could not respond", message: error.message, tone: "error" }); load(); return; }
    showAlert({
      title: accept ? "Added to circle" : "Request declined",
      message: accept ? `You are now in ${name}'s safety circle.` : `You declined ${name}'s request.`
    });
    load();
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={{ flexDirection: "row", alignItems: "center" }}>
          <ChevronLeft size={22} color={colors.text} strokeWidth={2} /><Text style={[styles.back, { color: colors.text }]}>Back</Text>
        </Pressable>
      </View>
      <Text style={[styles.header, { color: colors.text }]}>Safety circle requests</Text>
      <Text style={[styles.sub, { color: colors.textMuted }]}>People asking to add you to their trusted circle.</Text>

      {!loading && invites.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyChip}><UserPlus size={28} color="#fff" strokeWidth={2} /></View>
          <Text style={[styles.emptyBig, { color: colors.text }]}>No pending requests</Text>
          <Text style={[styles.empty, { color: colors.textMuted }]}>When someone asks to add you, it appears here.</Text>
        </View>
      ) : (
        <FlatList
          data={invites}
          keyExtractor={(i) => i.token}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140, gap: spacing.md }}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: glass.surface, borderColor: glass.stroke, boxShadow: glow.soft } as any]}>
              <View style={styles.cardHead}>
                <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.chip, { boxShadow: glow.brand } as any]}>
                  <ShieldCheck size={18} color={colors.accentText} strokeWidth={2} />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.text }]}>{item.inviter_name}</Text>
                  <Text style={[styles.meta, { color: colors.textMuted }]}>wants you in their safety circle</Text>
                </View>
              </View>
              <Text style={[styles.explain, { color: colors.textMuted }]}>
                If you accept, they can alert you when they flag a risk or trigger a panic alarm. You can leave anytime.
              </Text>
              <View style={styles.btnRow}>
                <Pressable style={[styles.declineBtn, { borderColor: glass.strokeStrong }]} disabled={busy === item.token}
                  onPress={() => respond(item.token, false, item.inviter_name)}>
                  <Text style={[styles.declineText, { color: colors.text }]}>Decline</Text>
                </Pressable>
                <Pressable style={[styles.acceptWrap, busy === item.token && { opacity: 0.6 }]} disabled={busy === item.token}
                  onPress={() => respond(item.token, true, item.inviter_name)}>
                  <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.acceptBtn, { boxShadow: glow.brand } as any]}>
                    <Text style={[styles.acceptText, { color: colors.accentText }]}>{busy === item.token ? "..." : "Accept"}</Text>
                  </LinearGradient>
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
  safe: { flex: 1 },
  topbar: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  back: { fontSize: 16, fontWeight: "700", marginLeft: 2 },
  header: { fontSize: 24, fontWeight: "800", paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  sub: { fontSize: 14, paddingHorizontal: spacing.lg, marginTop: 2, marginBottom: spacing.sm },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  chip: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 18, fontWeight: "800" },
  meta: { fontSize: 13, marginTop: 2 },
  explain: { fontSize: 13, lineHeight: 19, marginTop: spacing.md },
  btnRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  declineBtn: { flex: 1, height: 50, borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  declineText: { fontSize: 15, fontWeight: "700" },
  acceptWrap: { flex: 2, borderRadius: radius.md },
  acceptBtn: { height: 50, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  acceptText: { fontSize: 15, fontWeight: "800" },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyChip: { width: 70, height: 70, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "#5b6cf0", marginBottom: spacing.md },
  emptyBig: { fontSize: 17, fontWeight: "800" },
  empty: { fontSize: 14, marginTop: 4, textAlign: "center" },
});
