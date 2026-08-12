// ============================================================================
// Inbox - FlagRisk v2.1
// Rebuilt against Figma "Inbox" (3.0 Inbox flow) and the Inbox_1 mockup.
//   header 36pt round back | title 20/700 centred | 36pt #F0F0F0 round right
//   search 42pt r16 | day group label 12/600 | rows: 40pt avatar, name 14/600
//   with a coloured kind tag, body 12/400 two lines, time 12 on the right
// Kind tags follow the mockup colour coding. Unread is carried by a pip and a
// tinted row, never by lime, which is not legal on a light surface.
// ============================================================================
import { useCallback, useMemo, useState } from "react";
import { Pressable, SectionList, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import {
  ArrowLeft, EllipsisVertical, Search, Siren, MapPin, Users, Bell,
  UserPlus, Car, MessageSquare, ShieldCheck, CheckCheck, X, CircleAlert,
} from "lucide-react-native";
import * as Location from "expo-location";
import { Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "../components/Avatar";
import { supabase } from "../../lib/supabase";
import { colors, radius, spacing, type, screenBottomPad } from "../theme";

type Notif = {
  id: string; kind: string; title: string; body: string | null;
  is_read: boolean; created_at: string; incident_id: string | null;
  actor_id: string | null;
  actor_name?: string | null;
  actor_avatar?: string | null;
};

const KIND: Record<string, { label: string; fg: string; bg: string; Icon: any }> = {
  panic:            { label: "Emergency Alert", fg: colors.riskHigh, bg: "#FBD1CF", Icon: Siren },
  trip_overdue:     { label: "Trip Watch",      fg: "#2F80ED", bg: "#D6E7FB", Icon: Car },
  trip_overdue_self:{ label: "Trip Watch",      fg: "#2F80ED", bg: "#D6E7FB", Icon: Car },
  trip_end:         { label: "Trip Watch",      fg: "#2F80ED", bg: "#D6E7FB", Icon: Car },
  check_in:         { label: "Check-In",        fg: colors.safe, bg: "#D2F0E3", Icon: ShieldCheck },
  network_invite:   { label: "Network",         fg: "#9B51E0", bg: "#EADCFA", Icon: UserPlus },
  network_flag:     { label: "Network",         fg: "#9B51E0", bg: "#EADCFA", Icon: Users },
  comment:          { label: "Comment",         fg: "#9B51E0", bg: "#EADCFA", Icon: MessageSquare },
  incident_nearby:  { label: "Nearby Risk",     fg: colors.riskMedium, bg: "#FDE7CF", Icon: MapPin },
};

function kindMeta(kind: string) {
  return KIND[kind] ?? { label: "Update", fg: colors.textMuted, bg: "#EBEBEB", Icon: Bell };
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, now)) return "Today";
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (same(d, y)) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + " mins ago";
  if (diff < 86400) return Math.floor(diff / 3600) + " hrs ago";
  return new Date(iso).toLocaleDateString();
}

export function NotificationsScreen() {
  const navigation = useNavigation<any>();
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [safetyPrompt, setSafetyPrompt] = useState<Notif | null>(null);
  const [answering, setAnswering] = useState(false);
  const insets = useSafeAreaInsets();

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user?.id) { setLoading(false); return; }
    const { data } = await supabase
      .from("notifications")
      .select("id, kind, title, body, is_read, created_at, incident_id, actor_id")
      .order("created_at", { ascending: false }).limit(100);
    const rows = (data ?? []) as Notif[];
    const ids = Array.from(new Set(rows.map((r) => r.actor_id).filter(Boolean))) as string[];
    if (ids.length > 0) {
      const { data: people } = await supabase
        .from("profiles").select("id, display_name, avatar_url").in("id", ids);
      const byId: Record<string, any> = {};
      (people ?? []).forEach((p: any) => { byId[p.id] = p; });
      rows.forEach((r) => {
        const p = r.actor_id ? byId[r.actor_id] : null;
        if (p) { r.actor_name = p.display_name; r.actor_avatar = p.avatar_url; }
      });
    }
    setItems(rows);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function open(n: Notif) {
    if (!n.is_read) {
      await supabase.from("notifications").update({ is_read: true }).eq("id", n.id);
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    }
    if (n.kind === "trip_overdue_self") { setSafetyPrompt(n); return; }
    if (n.kind === "network_invite") navigation.navigate("NetworkInvites");
    else if (n.kind === "panic") navigation.navigate("PanicInbox");
    else if (n.kind === "network_flag" && n.incident_id) navigation.navigate("NetworkFlagDetail", { incidentId: n.incident_id });
    else if (n.incident_id) navigation.navigate("IncidentDetail", { incidentId: n.incident_id });
  }

  async function markAllRead() {
    const unreadIds = items.filter((i) => !i.is_read).map((i) => i.id);
    if (unreadIds.length === 0) return;
    await supabase.from("notifications").update({ is_read: true }).in("id", unreadIds);
    setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
  }

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? items.filter((n) =>
          n.title.toLowerCase().includes(q) || (n.body ?? "").toLowerCase().includes(q))
      : items;
    const groups: Record<string, Notif[]> = {};
    const order: string[] = [];
    filtered.forEach((n) => {
      const k = dayLabel(n.created_at);
      if (!groups[k]) { groups[k] = []; order.push(k); }
      groups[k].push(n);
    });
    return order.map((k) => ({ title: k, data: groups[k] }));
  }, [items, query]);

  const unread = items.filter((i) => !i.is_read).length;

  // Answering the overdue prompt without opening Trip Watch. This is the closing
  // half of the feature: silence raises the question, and one tap answers it.
  async function answerSafe() {
    if (answering) return;
    setAnswering(true);
    try {
      const { data: trips } = await supabase
        .from("trips").select("id")
        .in("status", ["active", "overdue", "escalated"])
        .order("started_at", { ascending: false }).limit(1);
      const trip = trips && trips[0] ? trips[0] : null;
      if (!trip) {
        setAnswering(false); setSafetyPrompt(null);
        return;
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      let lat: number | null = null; let lng: number | null = null;
      if (status === "granted") {
        const last = await Location.getLastKnownPositionAsync().catch(() => null);
        const pos = last || await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
        if (pos) { lat = pos.coords.latitude; lng = pos.coords.longitude; }
      }
      if (lat == null || lng == null) {
        setAnswering(false);
        return;
      }
      await supabase.rpc("send_trip_check_in", {
        p_trip_id: trip.id, p_lat: lat, p_lng: lng, p_recorded_at: new Date().toISOString(),
      });
      setAnswering(false);
      setSafetyPrompt(null);
      load();
    } catch (_e) {
      setAnswering(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtnPlain} hitSlop={8}>
          <ArrowLeft size={20} color={colors.ink} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headTitle}>Inbox</Text>
        <Pressable onPress={() => setMenuOpen(true)} style={styles.headBtnFilled} hitSlop={8}>
          <EllipsisVertical size={18} color={colors.ink} strokeWidth={2} />
          {unread > 0 ? <View style={styles.headPip} /> : null}
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <Search size={16} color="#8B8F96" strokeWidth={2} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search"
          placeholderTextColor="#8B8F96"
          style={styles.searchInput}
        />
      </View>

      {!loading && sections.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            {query ? "Nothing matches that search" : "No notifications yet"}
          </Text>
          <Text style={styles.emptySub}>
            {query
              ? "Try a different word."
              : "Updates from your trusted circle, Trip Watch, and nearby risks will appear here."}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(n) => n.id}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          renderSectionHeader={({ section }) => <Text style={styles.dayLabel}>{section.title}</Text>}
          renderItem={({ item }) => {
            const meta = kindMeta(item.kind);
            const Icon = meta.Icon;
            return (
              <Pressable style={styles.row} onPress={() => open(item)}>
                {item.actor_id ? (
                  <Avatar
                    uri={item.actor_avatar}
                    name={item.actor_name}
                    id={item.actor_id}
                    size={40}
                  />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: meta.bg }]}>
                    <Icon size={18} color={meta.fg} strokeWidth={2} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                    <View style={[styles.tag, { backgroundColor: meta.bg }]}>
                      <Text style={[styles.tagText, { color: meta.fg }]}>{meta.label}</Text>
                    </View>
                  </View>
                  {item.body ? (
                    <Text style={styles.rowBody} numberOfLines={2}>{item.body}</Text>
                  ) : null}
                </View>
                <View style={styles.rowRight}>
                  <Text style={styles.rowTime}>{timeAgo(item.created_at)}</Text>
                  {!item.is_read ? <View style={[styles.pip, { backgroundColor: meta.fg }]} /> : null}
                </View>
              </Pressable>
            );
          }}
        />
      )}
      <Modal
        visible={!!safetyPrompt}
        transparent
        animationType="slide"
        onRequestClose={() => setSafetyPrompt(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setSafetyPrompt(null)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} onPress={() => {}}>
            <View style={styles.promptTop}>
              <Text style={styles.promptTitle}>Are you safe?</Text>
              <Pressable onPress={() => setSafetyPrompt(null)} hitSlop={10}>
                <X size={20} color={colors.textMuted} strokeWidth={2} />
              </Pressable>
            </View>
            <Text style={styles.promptBody}>
              We have not received a check-in on your trip. Confirm you are safe, or raise the alarm
              and your circle will be told at once.
            </Text>
            <View style={styles.promptRow}>
              <Pressable
                style={[styles.promptBtn, { borderColor: colors.riskHigh }]}
                onPress={() => { setSafetyPrompt(null); navigation.navigate("Panic"); }}
              >
                <CircleAlert size={17} color={colors.riskHigh} strokeWidth={2.2} />
                <Text style={[styles.promptBtnText, { color: colors.riskHigh }]}>Emergency</Text>
              </Pressable>
              <Pressable
                style={[styles.promptBtn, { borderColor: colors.safe }, answering && { opacity: 0.6 }]}
                onPress={answerSafe}
                disabled={answering}
              >
                <ShieldCheck size={17} color={colors.safe} strokeWidth={2.2} />
                <Text style={[styles.promptBtnText, { color: colors.safe }]}>
                  {answering ? "Sending" : "Check-in"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={menuOpen} transparent animationType="slide" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} onPress={() => {}}>
            <View style={styles.grabber} />
            <Text style={styles.menuTitle}>Inbox</Text>
            <Pressable
              style={styles.menuRow}
              onPress={() => { setMenuOpen(false); markAllRead(); }}
            >
              <CheckCheck size={19} color={colors.ink} strokeWidth={2} />
              <Text style={styles.menuText}>Mark everything as read</Text>
              <Text style={styles.menuCount}>{unread}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  header: { height: 36, flexDirection: "row", alignItems: "center", marginHorizontal: spacing.gutter, marginTop: spacing.md },
  headBtnPlain: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headBtnFilled: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#F0F0F0", alignItems: "center", justifyContent: "center" },
  headPip: { position: "absolute", top: 7, right: 7, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.riskHigh },
  headTitle: { flex: 1, ...type.heading, color: colors.ink, textAlign: "center" },

  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    height: 42, borderRadius: radius.md, backgroundColor: "#F1F2F5", borderWidth: 1, borderColor: "rgba(20,21,42,0.14)",
    marginHorizontal: spacing.gutter, marginTop: spacing.lg, paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, ...type.label, fontWeight: "400", color: colors.ink, padding: 0 },

  list: { paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, paddingBottom: screenBottomPad },
  dayLabel: { fontSize: 12, lineHeight: 24, fontWeight: "600", color: colors.ink, marginBottom: spacing.xs },

  row: {
    flexDirection: "row", alignItems: "flex-start", gap: spacing.ms,
    paddingVertical: spacing.ms, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  rowTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowTitle: { ...type.label, fontWeight: "600", color: colors.ink, flexShrink: 1 },
  tag: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontSize: 10, lineHeight: 14, fontWeight: "600" },
  rowBody: { ...type.caption, color: colors.textMuted, marginTop: 4, lineHeight: 17 },
  rowRight: { alignItems: "flex-end", gap: 6, paddingTop: 2 },
  rowTime: { ...type.caption, color: colors.textFaint },
  pip: { width: 8, height: 8, borderRadius: 4 },

  backdrop: { flex: 1, backgroundColor: "rgba(1,1,20,0.30)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#F6F6F8", borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.gutter, paddingTop: spacing.sm,
  },
  grabber: { alignSelf: "center", width: 44, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: spacing.md },
  menuTitle: { ...type.subheading, color: colors.ink, marginBottom: spacing.sm },
  menuRow: { flexDirection: "row", alignItems: "center", gap: spacing.ms, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  menuText: { flex: 1, ...type.label, fontWeight: "500", color: colors.ink },
  menuCount: { ...type.caption, fontWeight: "600", color: colors.textMuted },

  promptTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  promptTitle: { ...type.title, color: colors.ink },
  promptBody: { ...type.label, fontWeight: "400", color: colors.textMuted, lineHeight: 21, marginTop: spacing.sm },
  promptRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xl },
  promptBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    height: 56, borderRadius: radius.md, borderWidth: 1.5,
  },
  promptBtnText: { ...type.label, fontWeight: "600" },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl },
  emptyTitle: { fontSize: 14, lineHeight: 18, fontWeight: "700", color: colors.ink },
  emptySub: { fontSize: 10, lineHeight: 14, fontWeight: "400", color: colors.ink, textAlign: "center", marginTop: 8, maxWidth: 220 },
});
