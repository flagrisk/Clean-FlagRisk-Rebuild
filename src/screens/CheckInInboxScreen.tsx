// ============================================================================
// Check-ins - FlagRisk v2.1
// Rebuilt against the 10.0 Check-In flow and the Account check-in sheet.
//   header 36pt round back | title 20/700 centred
//   roster rows: 40pt avatar, name 14/500, last check-in 12 muted, count chip
//   trail view: person header, notify toggle, segmented range, entry cards
// Read-only, powered by definer RPCs. Snapshot pattern kept: new check-ins
// raise a banner rather than moving the list under the reader.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Linking, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { ArrowLeft, MapPin, Inbox as InboxIcon, RefreshCw } from "lucide-react-native";
import * as Location from "expo-location";
import { supabase } from "../../lib/supabase";
import { Avatar } from "../components/Avatar";
import { colors, radius, spacing, type, elevation, screenBottomPad } from "../theme";

type Sender = {
  sender_id: string; display_name: string | null; avatar_url?: string | null;
  last_check_in: string | null; total: number;
};
type Entry = { id: string; latitude: number; longitude: number; note: string | null; created_at: string };
type Filter = "all" | "today" | "week";

const RANGES: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "today", label: "Today" },
  { key: "week", label: "7 days" },
];

function ago(ts: string | null) {
  if (!ts) return "No check-ins yet";
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return m + " mins ago";
  const h = Math.floor(m / 60); if (h < 24) return h + " hrs ago";
  return Math.floor(h / 24) + " days ago";
}

export function CheckInInboxScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [senders, setSenders] = useState<Sender[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Sender | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [notifyPref, setNotifyPref] = useState(false);
  const [placeNames, setPlaceNames] = useState<Record<string, string>>({});
  const [hasNew, setHasNew] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
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
      } catch (_e) { /* geocoding unavailable, coordinates remain */ }
    }
  }

  useFocusEffect(useCallback(() => {
    (async () => {
      const { data } = await supabase.rpc("my_checkin_senders");
      setSenders(data ?? []);
      setLoading(false);
    })();
  }, []));

  function sinceFor(f: Filter) {
    if (f === "today") return new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    if (f === "week") return new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    return null;
  }

  async function openTrail(s: Sender, f: Filter = "all") {
    setActive(s); setFilter(f); setHasNew(false);
    try {
      const { data: pref } = await supabase.rpc("get_checkin_push_pref", { p_traveler: s.sender_id });
      setNotifyPref(pref === true);
    } catch (_e) { setNotifyPref(false); }
    const { data } = await supabase.rpc("checkin_trail", {
      p_sender: s.sender_id, p_since: sinceFor(f), p_until: null, p_limit: 200,
    });
    const list = data ?? [];
    setEntries(list);
    resolvePlaceNames(list);
  }

  async function recheckTrail() {
    if (!active || recheckRunning.current) return;
    recheckRunning.current = true;
    try {
      const { data } = await supabase.rpc("checkin_trail", {
        p_sender: active.sender_id, p_since: sinceFor(filter), p_until: null, p_limit: 1,
      });
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

  async function toggleNotify(next: boolean) {
    if (!active) return;
    setNotifyPref(next);
    try {
      await supabase.rpc("set_checkin_push_pref", { p_traveler: active.sender_id, p_notify: next });
    } catch (_e) { setNotifyPref(!next); }
  }

  const Header = ({ title, onBack }: { title: string; onBack: () => void }) => (
    <View style={styles.header}>
      <Pressable onPress={onBack} style={styles.headBtnPlain} hitSlop={8}>
        <ArrowLeft size={20} color={colors.ink} strokeWidth={2} />
      </Pressable>
      <Text style={styles.headTitle}>{title}</Text>
      <View style={{ width: 36 }} />
    </View>
  );

  if (active) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Header title="Check-in trail" onBack={() => { setActive(null); setEntries([]); }} />

        <View style={styles.person}>
          <Avatar uri={active.avatar_url} name={active.display_name} id={active.sender_id} size={56} />
          <Text style={styles.personName}>{active.display_name ?? "FlagRisk user"}</Text>
          <Text style={styles.personSub}>{active.total} check-ins shared with you</Text>
        </View>

        <View style={styles.notifyCard}>
          <Text style={styles.notifyLabel}>Notify me when they check in</Text>
          <Switch
            value={notifyPref}
            onValueChange={toggleNotify}
            trackColor={{ false: colors.borderStrong, true: colors.ink }}
            thumbColor="#FFFFFF"
          />
        </View>

        <View style={styles.segment}>
          {RANGES.map((r) => {
            const on = filter === r.key;
            return (
              <Pressable
                key={r.key}
                onPress={() => openTrail(active, r.key)}
                style={[styles.segmentBtn, on && styles.segmentBtnOn]}
              >
                <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{r.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {hasNew ? (
          <Pressable onPress={() => openTrail(active, filter)} style={styles.banner}>
            <RefreshCw size={15} color={colors.ink} strokeWidth={2.4} />
            <Text style={styles.bannerText}>New check-ins available. Tap to refresh.</Text>
          </Pressable>
        ) : null}

        <FlatList
          data={entries}
          keyExtractor={(e) => e.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: insets.bottom + screenBottomPad }}
          ListEmptyComponent={<Text style={styles.emptyLine}>No check-ins in this range.</Text>}
          renderItem={({ item }) => (
            <View style={styles.entry}>
              <View style={{ flex: 1 }}>
                <Text style={styles.entryTime}>{new Date(item.created_at).toLocaleString()}</Text>
                {placeNames[item.id] ? <Text style={styles.entryPlace}>{placeNames[item.id]}</Text> : null}
                <Text style={styles.entryCoord}>
                  {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
                </Text>
                {item.note ? <Text style={styles.entryNote}>{item.note}</Text> : null}
              </View>
              <Pressable
                hitSlop={8}
                style={styles.mapBtn}
                onPress={() => Linking.openURL(
                  "https://www.google.com/maps/search/?api=1&query=" + item.latitude + "," + item.longitude
                )}
              >
                <MapPin size={18} color={colors.ink} strokeWidth={2} />
              </Pressable>
            </View>
          )}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Header title="Check-ins" onBack={() => navigation.goBack()} />
      <Text style={styles.intro}>People who share their trips with you.</Text>

      {loading ? (
        <ActivityIndicator color={colors.ink} style={{ marginTop: 40 }} />
      ) : senders.length === 0 ? (
        <View style={styles.empty}>
          <InboxIcon size={34} color={colors.textFaint} strokeWidth={1.8} />
          <Text style={styles.emptyTitle}>No one yet</Text>
          <Text style={styles.emptySub}>
            When someone adds you to their panic circle, their check-ins appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={senders}
          keyExtractor={(s) => s.sender_id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, paddingBottom: insets.bottom + screenBottomPad }}
          renderItem={({ item }) => (
            <Pressable onPress={() => openTrail(item)} style={styles.row}>
              <Avatar uri={item.avatar_url} name={item.display_name} id={item.sender_id} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName} numberOfLines={1}>{item.display_name ?? "FlagRisk user"}</Text>
                <Text style={styles.rowSub}>{ago(item.last_check_in)}</Text>
              </View>
              <View style={styles.countChip}>
                <Text style={styles.countText}>{item.total}</Text>
              </View>
            </Pressable>
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

  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.ms, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowName: { ...type.label, color: "#000000" },
  rowSub: { ...type.caption, color: "#8B8B8B", marginTop: 3 },
  countChip: { minWidth: 28, height: 24, borderRadius: radius.pill, backgroundColor: "#F0F0F0", alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  countText: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: colors.ink },

  person: { alignItems: "center", marginTop: spacing.lg },
  personName: { ...type.subheading, color: colors.ink, marginTop: spacing.sm },
  personSub: { ...type.caption, color: colors.textMuted, marginTop: 2 },

  notifyCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: colors.bgElevated, borderRadius: radius.md,
    marginHorizontal: spacing.gutter, marginTop: spacing.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.ms,
  },
  notifyLabel: { ...type.label, fontWeight: "500", color: colors.ink, flex: 1 },

  segment: {
    flexDirection: "row", backgroundColor: "#F0F0F0", borderRadius: radius.sm,
    marginHorizontal: spacing.gutter, marginTop: spacing.md, padding: 4, gap: 4,
  },
  segmentBtn: { flex: 1, height: 36, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  segmentBtnOn: { backgroundColor: colors.ink },
  segmentText: { fontSize: 13, lineHeight: 17, fontWeight: "500", color: "#91958E" },
  segmentTextOn: { color: "#FFFFFF", fontWeight: "600" },

  banner: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    backgroundColor: "#F0F0F0", borderRadius: radius.md,
    marginHorizontal: spacing.gutter, marginTop: spacing.md, paddingVertical: 12,
  },
  bannerText: { ...type.caption, fontWeight: "600", color: colors.ink },

  entry: {
    flexDirection: "row", alignItems: "center", gap: spacing.ms,
    backgroundColor: colors.bg, borderRadius: radius.md, padding: spacing.md,
    marginBottom: spacing.sm, ...elevation.hairline,
  },
  entryTime: { ...type.label, fontWeight: "600", color: colors.ink },
  entryPlace: { ...type.caption, color: colors.ink, marginTop: 3 },
  entryCoord: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  entryNote: { ...type.caption, color: colors.textMuted, marginTop: 4 },
  mapBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#F0F0F0", alignItems: "center", justifyContent: "center" },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, gap: 8 },
  emptyTitle: { ...type.subheading, color: colors.ink },
  emptySub: { ...type.caption, color: colors.textMuted, textAlign: "center", lineHeight: 18 },
  emptyLine: { ...type.caption, color: colors.textMuted, textAlign: "center", marginTop: spacing.xl },
});
