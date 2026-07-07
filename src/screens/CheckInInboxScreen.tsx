// Check-in Inbox. Roster of people who have YOU in their panic circle; tap one
// to see their filterable check-in trail. Read-only; powered by definer RPCs.
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { ChevronLeft, MapPin, Inbox as InboxIcon } from "lucide-react-native";
import * as Location from "expo-location";
import { supabase } from "../../lib/supabase";
import { Avatar } from "../components/Avatar";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing } from "../theme";

type Sender = { sender_id: string; display_name: string | null; avatar_url?: string | null; last_check_in: string | null; total: number };
type Entry = { id: string; latitude: number; longitude: number; note: string | null; created_at: string };
type Filter = "all" | "today" | "week";

const AVATAR_COLORS = ["#e0457b", "#3ec46a", "#5b6cf0", "#e0a045", "#9c45e0"];
function avatarColor(id: string) { let h = 0; for (const c of id) h = (h + c.charCodeAt(0)) % AVATAR_COLORS.length; return AVATAR_COLORS[h]; }
function initials(name: string | null) { if (!name) return "?"; return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase(); }
function ago(ts: string | null) {
  if (!ts) return "no check-ins yet";
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60); if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}

export function CheckInInboxScreen() {
  const navigation = useNavigation<any>();
  const { colors, glass, gradients, glow } = useTheme();
  const [senders, setSenders] = useState<Sender[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Sender | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [placeNames, setPlaceNames] = useState<Record<string, string>>({});
  const [hasNew, setHasNew] = useState(false);
  const recheckRunning = useRef(false);
  async function resolvePlaceNames(list: Entry[]) {
    for (const e of list) {
      try {
        const res = await Location.reverseGeocodeAsync({ latitude: e.latitude, longitude: e.longitude });
        const a = res && res[0];
        if (!a) continue;
        const parts = [a.street || a.name || a.district, a.city || a.subregion || a.region].filter(Boolean);
        const label = parts.join(", ");
        if (label) setPlaceNames((prev) => ({ ...prev, [e.id]: "Near " + label }));
      } catch (_e) { /* geocoding unavailable; coords remain */ }
    }
  }
  const [filter, setFilter] = useState<Filter>("all");

  useFocusEffect(useCallback(() => {
    (async () => {
      const { data } = await supabase.rpc("my_checkin_senders");
      setSenders(data ?? []); setLoading(false);
    })();
  }, []));

  async function openTrail(s: Sender, f: Filter = "all") {
    setActive(s); setFilter(f);
    let since: string | null = null;
    if (f === "today") since = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    if (f === "week") since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { data } = await supabase.rpc("checkin_trail", { p_sender: s.sender_id, p_since: since, p_until: null, p_limit: 200 });
    const list = data ?? [];
    setEntries(list);
    resolvePlaceNames(list);
  }

  // Quietly recheck the open trail for new check-ins. Does NOT mutate the list;
  // only raises a banner so the reader is not interrupted (snapshot pattern).
  async function recheckTrail() {
    if (!active || recheckRunning.current) return;
    recheckRunning.current = true;
    try {
      let since = null;
      if (filter === "today") since = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
      if (filter === "week") since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const { data } = await supabase.rpc("checkin_trail", { p_sender: active.sender_id, p_since: since, p_until: null, p_limit: 1 });
      const newest = data && data[0];
      if (newest) {
        setEntries((cur) => {
          const shownNewest = cur[0];
          if (shownNewest && new Date(newest.created_at).getTime() > new Date(shownNewest.created_at).getTime()) {
            setHasNew(true);
          }
          return cur;
        });
      }
    } catch (_e) {}
    recheckRunning.current = false;
  }

  useEffect(() => {
    if (!active) { setHasNew(false); return; }
    const id = setInterval(recheckTrail, 25000);
    return () => clearInterval(id);
  }, [active, filter]);

  // ---- Trail view ----
  if (active) {
    const ac = avatarColor(active.sender_id);
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top"]}>
        <View style={styles.topbar}>
          <Pressable onPress={() => { setActive(null); setEntries([]); }} hitSlop={12} style={{ flexDirection: "row", alignItems: "center" }}>
            <ChevronLeft size={22} color={colors.text} strokeWidth={2} /><Text style={[styles.back, { color: colors.text }]}>Inbox</Text>
          </Pressable>
        </View>
        <View style={styles.trailHead}>
          <Avatar uri={active.avatar_url} name={active.display_name} id={active.sender_id} size={48} />
          <Text style={[styles.trailName, { color: colors.text }]}>{active.display_name ?? "FlagRisk user"}</Text>
        </View>
        <View style={styles.filterRow}>
          {(["all", "today", "week"] as Filter[]).map((f) => (
            <Pressable key={f} onPress={() => openTrail(active, f)}
              style={[styles.chip, { borderColor: filter === f ? colors.accentOn : glass.stroke, backgroundColor: filter === f ? colors.accent : glass.surface }]}>
              <Text style={[styles.chipText, { color: filter === f ? colors.accentText : colors.textMuted }]}>{f === "all" ? "All" : f === "today" ? "Today" : "7 days"}</Text>
            </Pressable>
          ))}
        </View>
        {hasNew ? (
          <Pressable onPress={() => { setHasNew(false); openTrail(active, filter); }} style={[styles.refreshBanner, { backgroundColor: colors.accentOn }]}>
            <Text style={[styles.refreshText, { color: "#ffffff" }]}>New check-ins available. Tap to refresh.</Text>
          </Pressable>
        ) : null}
        <FlatList
          data={entries}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140, gap: spacing.md }}
          ListEmptyComponent={<Text style={[styles.empty, { color: colors.textMuted }]}>No check-ins in this range.</Text>}
          renderItem={({ item }) => (
            <View style={[styles.entry, { backgroundColor: glass.surface, borderColor: glass.stroke }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.entryTime, { color: colors.text }]}>{new Date(item.created_at).toLocaleString()}</Text>
                {placeNames[item.id] ? <Text style={[styles.entryPlace, { color: colors.text }]}>{placeNames[item.id]}</Text> : null}
                <Text style={[styles.entryCoord, { color: colors.textMuted }]}>{item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}</Text>
                {item.note ? <Text style={[styles.entryNote, { color: colors.textMuted }]}>{item.note}</Text> : null}
              </View>
              <Pressable hitSlop={8} onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${item.latitude},${item.longitude}`)}>
                <MapPin size={22} color={colors.accentOn} strokeWidth={2} />
              </Pressable>
            </View>
          )}
        />
      </SafeAreaView>
    );
  }

  // ---- Roster view ----
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={{ flexDirection: "row", alignItems: "center" }}>
          <ChevronLeft size={22} color={colors.text} strokeWidth={2} /><Text style={[styles.back, { color: colors.text }]}>Profile</Text>
        </Pressable>
      </View>
      <Text style={[styles.header, { color: colors.text }]}>Check-ins</Text>
      <Text style={[styles.sub, { color: colors.textMuted }]}>People who share their trips with you.</Text>

      {!loading && senders.length === 0 ? (
        <View style={styles.emptyWrap}>
          <LinearGradientFallback colors={gradients.brand} glow={glow.brand}>
            <InboxIcon size={30} color={colors.accentText} strokeWidth={2} />
          </LinearGradientFallback>
          <Text style={[styles.emptyBig, { color: colors.text }]}>No one yet</Text>
          <Text style={[styles.empty, { color: colors.textMuted }]}>When someone adds you to their panic circle, their check-ins appear here.</Text>
        </View>
      ) : (
        <FlatList
          data={senders}
          keyExtractor={(s) => s.sender_id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140, gap: spacing.md }}
          renderItem={({ item }) => {
            const ac = avatarColor(item.sender_id);
            return (
              <Pressable onPress={() => openTrail(item)} style={[styles.row, { backgroundColor: glass.surface, borderColor: glass.stroke, boxShadow: glow.soft } as any]}>
                <Avatar uri={item.avatar_url} name={item.display_name} id={item.sender_id} size={48} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.text }]}>{item.display_name ?? "FlagRisk user"}</Text>
                  <Text style={[styles.meta, { color: colors.textMuted }]}>{item.total} check-in{item.total === 1 ? "" : "s"} · {ago(item.last_check_in)}</Text>
                </View>
                <ChevronLeft size={20} color={colors.textMuted} strokeWidth={2} style={{ transform: [{ rotate: "180deg" }] }} />
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

function LinearGradientFallback({ children }: any) {
  return <View style={styles.emptyChip}>{children}</View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topbar: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  back: { fontSize: 16, fontWeight: "700", marginLeft: 2 },
  header: { fontSize: 24, fontWeight: "800", paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  sub: { fontSize: 14, paddingHorizontal: spacing.lg, marginTop: 2, marginBottom: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  name: { fontSize: 17, fontWeight: "700" },
  meta: { fontSize: 13, marginTop: 3 },
  trailHead: { alignItems: "center", gap: 10, paddingVertical: spacing.md },
  trailName: { fontSize: 20, fontWeight: "800" },
  filterRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: "700" },
  entry: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  entryTime: { fontSize: 15, fontWeight: "700" },
  entryPlace: { fontSize: 14, fontWeight: "700", marginTop: 3 },
  entryCoord: { fontSize: 13, marginTop: 3 },
  entryNote: { fontSize: 13, marginTop: 4, fontStyle: "italic" },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyChip: { width: 70, height: 70, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "#5b6cf0", marginBottom: spacing.md },
  emptyBig: { fontSize: 17, fontWeight: "800" },
refreshBanner: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.md, alignItems: "center" },
  refreshText: { fontSize: 13, fontWeight: "700" },
  empty: { fontSize: 14, marginTop: 4, textAlign: "center" },
});
