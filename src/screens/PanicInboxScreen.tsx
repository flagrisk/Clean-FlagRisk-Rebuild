// Panic Inbox: panics fired by people whose panic circle you are in.
// Active alarms shown urgently at top. Recipients pick one of four honest responses:
//   "I've noted this" (seen), "Getting help" (getting_help),
//   "On my way" (on_way), "They're safe" (marked_safe).
// Responses may be upgraded; the current one is read back from my_response.
// No call action by design: ringing a phone mid-emergency can expose someone hiding.
import { useCallback, useState } from "react";
import { showAlert } from "../components/Feedback";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { ChevronLeft, Siren, MapPin, Eye, LifeBuoy, Navigation2, ShieldCheck } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { Avatar } from "../components/Avatar";
import { MiniMap } from "../components/MiniMap";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing } from "../theme";

type Panic = {
  alarm_id: string; firer_id: string; firer_name: string;
  latitude: number; longitude: number; status: string;
  triggered_at: string; expires_at: string | null; my_response: string | null;
};

const RESPONSES = [
  { value: "seen", label: "I've noted this", Icon: Eye, tone: "muted" },
  { value: "getting_help", label: "Getting help", Icon: LifeBuoy, tone: "accentOn" },
  { value: "on_way", label: "On my way", Icon: Navigation2, tone: "accent" },
  { value: "marked_safe", label: "They're safe", Icon: ShieldCheck, tone: "safe" },
] as const;

function respLabel(v: string | null) {
  if (v === "seen") return "I've noted this";
  if (v === "getting_help") return "Getting help";
  if (v === "on_way" || v === "responding") return "On my way";
  if (v === "marked_safe") return "They're safe";
  return v ?? "";
}
function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}
function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + " min ago";
  if (diff < 86400) return Math.floor(diff / 3600) + " h ago";
  return new Date(iso).toLocaleDateString();
}

export function PanicInboxScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { colors, glass } = useTheme();
  const [items, setItems] = useState<Panic[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("my_incoming_panics");
    setItems(data ?? []); setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function respond(p: Panic, response: string) {
    setBusy(p.alarm_id);
    const { error } = await supabase.rpc("acknowledge_panic", { p_alarm: p.alarm_id, p_response: response });
    setBusy(null);
    if (error) return showAlert({ title: "Could not respond", message: error.message, tone: "error" });
    load();
  }

  function toggleMap(p: Panic) {
    setMapOpen((cur) => (cur === p.alarm_id ? null : p.alarm_id));
  }

  function fillFor(tone: string) {
    if (tone === "accent") return { bg: colors.accent, on: colors.accentText };
    if (tone === "accentOn") return { bg: colors.accentOn, on: "#fff" };
    if (tone === "safe") return { bg: colors.safe, on: "#fff" };
    return { bg: colors.textMuted, on: "#fff" };
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top", "bottom"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}><ChevronLeft size={22} color={colors.text} strokeWidth={2} /></Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Alarms</Text>
        <Pressable onPress={() => navigation.navigate("Panic")} hitSlop={10}>
          <Text style={[styles.fireLink, { color: colors.danger }]}>Panic</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.danger} /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <ShieldCheck size={40} color={colors.safe} strokeWidth={1.8} />
          <Text style={[styles.emptyText, { color: colors.text }]}>No active alarms.</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>Panic alarms from people whose circle you are in will appear here.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.alarm_id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}
          renderItem={({ item }) => {
            const active = item.status === "active";
            return (
              <View style={[styles.card, {
                backgroundColor: active ? colors.danger + "12" : glass.surface,
                borderColor: active ? colors.danger : glass.stroke,
              } as any]}>
                <View style={styles.cardHead}>
                  <Avatar uri={item.firer_avatar} name={item.firer_name} id={item.firer_id} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.firer, { color: colors.text }]}>{item.firer_name}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <Siren size={14} color={active ? colors.danger : colors.textMuted} strokeWidth={2.5} />
                      <Text style={[styles.sub, { color: active ? colors.danger : colors.textMuted, fontWeight: active ? "800" : "600" }]}>
                        {active ? "PANIC ALARM ACTIVE" : "Alarm ended"}
                      </Text>
                    </View>
                    <Text style={[styles.time, { color: colors.textMuted }]}>{timeAgo(item.triggered_at)}</Text>
                  </View>
                </View>

                <Pressable onPress={() => toggleMap(item)} style={[styles.mapRow, { borderColor: glass.stroke }]}>
                  <MapPin size={16} color={colors.accentOn} strokeWidth={2} />
                  <Text style={[styles.mapText, { color: colors.accentOn }]}>
                    {mapOpen === item.alarm_id ? "Hide location" : "View their location"}
                  </Text>
                </Pressable>
                {mapOpen === item.alarm_id && (
                  <View style={{ marginTop: spacing.sm }}>
                    <MiniMap lat={item.latitude} lng={item.longitude} />
                  </View>
                )}

                {active && (
                  <>
                    <Text style={[styles.actionsLabel, { color: colors.textMuted }]}>How can you respond?</Text>
                    <View style={styles.actions}>
                      {RESPONSES.map(({ value, label, Icon, tone }) => {
                        const selected = item.my_response === value;
                        const f = fillFor(tone);
                        return (
                          <Pressable key={value} disabled={busy === item.alarm_id} onPress={() => respond(item, value)}
                            style={[styles.actBtn, selected ? { backgroundColor: f.bg, borderColor: f.bg } : { borderColor: glass.stroke }]}>
                            <Icon size={15} color={selected ? f.on : colors.text} strokeWidth={2} />
                            <Text style={[styles.actText, { color: selected ? f.on : colors.text, fontWeight: selected ? "800" : "700" }]}>{label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                )}

                {item.my_response ? (
                  <Text style={[styles.ackNote, { color: colors.safe }]}>You responded: {respLabel(item.my_response)}</Text>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  headerTitle: { fontSize: 17, fontWeight: "800" },
  fireLink: { fontSize: 15, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.sm },
  emptyText: { fontSize: 16, fontWeight: "700" },
  emptySub: { fontSize: 14, textAlign: "center" },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg },
  cardHead: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  firer: { fontSize: 18, fontWeight: "800" },
  sub: { fontSize: 13, letterSpacing: 0.3 },
  time: { fontSize: 12, marginTop: 2 },
  mapRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: spacing.md, marginTop: spacing.md },
  mapText: { fontSize: 14, fontWeight: "700" },
  actionsLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 0.3, marginTop: spacing.md, marginBottom: spacing.sm },
  actions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 8 },
  actBtn: { width: "48%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 46, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 6 },
  actText: { fontSize: 14, fontWeight: "700" },
  ackNote: { fontSize: 13, fontWeight: "600", marginTop: spacing.md, textAlign: "center" },
});
