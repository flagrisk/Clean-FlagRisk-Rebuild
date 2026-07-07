// Inbox / Notifications (V2 rich + theming). Lucide icons, gradient empty-state chip, lifted rows.
import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Inbox as InboxIcon, Siren, MapPin, Users, Bell, UserPlus } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing } from "../theme";

type Notif = {
  id: string; kind: string; title: string; body: string | null;
  is_read: boolean; created_at: string; incident_id: string | null;
};

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationsScreen() {
  const { colors, glass, gradients, glow } = useTheme();
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation<any>();

  const kindMeta = (kind: string) => {
    if (kind === "panic") return { color: colors.danger, Icon: Siren };
    if (kind === "incident_nearby") return { color: colors.warning, Icon: MapPin };
    if (kind === "network_flag") return { color: colors.accentSecondary, Icon: Users };
    if (kind === "network_invite") return { color: colors.accentOn, Icon: UserPlus };
    return { color: colors.textMuted, Icon: Bell };
  };

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user?.id) { setLoading(false); return; }
    const { data } = await supabase
      .from("notifications")
      .select("id, kind, title, body, is_read, created_at, incident_id")
      .order("created_at", { ascending: false }).limit(100);
    setItems(data ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function markRead(n: Notif) {
    if (!n.is_read) {
      await supabase.from("notifications").update({ is_read: true }).eq("id", n.id);
      setItems((prev) => prev.map((x) => x.id === n.id ? { ...x, is_read: true } : x));
    }
    if (n.kind === "network_invite") navigation.navigate("NetworkInvites");
    else if (n.kind === "panic") navigation.navigate("PanicInbox");
    else if (n.kind === "network_flag" && n.incident_id) navigation.navigate("NetworkFlagDetail", { incidentId: n.incident_id });
    else if (n.incident_id) navigation.navigate("IncidentDetail", { incidentId: n.incident_id });
  }

  const unread = items.filter((i) => !i.is_read).length;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top"]}>
      <View style={styles.headerRow}>
        <Text style={[styles.header, { color: colors.text }]}>Inbox</Text>
        {unread > 0 && (
          <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.badge}>
            <Text style={[styles.badgeText, { color: colors.accentText }]}>{unread} new</Text>
          </LinearGradient>
        )}
      </View>

      {!loading && items.length === 0 ? (
        <View style={styles.empty}>
          <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={[styles.emptyChip, { boxShadow: glow.brand } as any]}>
            <InboxIcon size={30} color={colors.accentText} strokeWidth={2} />
          </LinearGradient>
          <Text style={[styles.emptyText, { color: colors.text }]}>No alerts yet.</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>Risks flagged near you and by your network will appear here.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: spacing.md }}
          renderItem={({ item }) => {
            const { color, Icon } = kindMeta(item.kind);
            return (
              <Pressable style={[styles.row, { backgroundColor: glass.surface, borderColor: !item.is_read ? color + "55" : glass.stroke, boxShadow: glow.soft } as any]} onPress={() => markRead(item)}>
                <View style={[styles.rowChip, { backgroundColor: color + "1f", borderColor: color + "44" }]}>
                  <Icon size={18} color={color} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
                  {item.body ? <Text style={[styles.body, { color: colors.textMuted }]}>{item.body}</Text> : null}
                  <Text style={[styles.time, { color: colors.textFaint }]}>{timeAgo(item.created_at)}</Text>
                </View>
                {!item.is_read && <View style={[styles.unreadPip, { backgroundColor: color }]} />}
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: spacing.md, gap: spacing.sm },
  header: { fontSize: 22, fontWeight: "800" },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
  badgeText: { fontSize: 12, fontWeight: "800" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyChip: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  emptyText: { fontSize: 16, fontWeight: "700" },
  emptySub: { fontSize: 14, marginTop: 4, textAlign: "center" },
  row: { flexDirection: "row", gap: spacing.md, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, alignItems: "flex-start" },
  rowChip: { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 15, fontWeight: "700" },
  body: { fontSize: 13, marginTop: 2 },
  time: { fontSize: 11, marginTop: 4 },
  unreadPip: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
});


