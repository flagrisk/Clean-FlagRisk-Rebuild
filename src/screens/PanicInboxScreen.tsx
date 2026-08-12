// ============================================================================
// Alarm History - FlagRisk v2.1
// Rebuilt against Figma "Alarm History" (nodes 75:1734 / 75:1802).
//   header 36pt round back | title 20/700 centred | 36pt #F0F0F0 filter
//   rows: 40pt avatar, name 14/500, time 12 muted, map action on the right
//
// The mockup shows an Incoming / Outgoing segmented control. Only Incoming has
// a data source today: my_incoming_panics. There is no RPC returning the alarms
// this user fired, so the control is omitted rather than shipped half dead.
// Adding my_outgoing_panics turns it on with no change to this layout.
//
// No call action, by design: ringing a phone mid-emergency can expose someone
// who is hiding.
// ============================================================================
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import {
  ArrowLeft, Siren, Map as MapIcon, Eye,
  LifeBuoy, Navigation2, ShieldCheck, HelpCircle,
} from "lucide-react-native";
import * as Location from "expo-location";
import { supabase } from "../../lib/supabase";
import { showAlert } from "../components/Feedback";
import { Avatar } from "../components/Avatar";
import { MiniMap } from "../components/MiniMap";
import { colors, radius, spacing, type, elevation, screenBottomPad } from "../theme";

type Nearby = {
  alarm_id: string; latitude: number; longitude: number;
  triggered_at: string; expires_at: string | null;
};

type Panic = {
  alarm_id: string; firer_id: string; firer_name: string; firer_avatar?: string | null;
  latitude: number; longitude: number; status: string;
  triggered_at: string; expires_at: string | null; my_response: string | null;
};

const RESPONSES = [
  { value: "seen", label: "Noted this", Icon: Eye },
  { value: "getting_help", label: "Getting help", Icon: LifeBuoy },
  { value: "on_way", label: "On my way", Icon: Navigation2 },
  { value: "marked_safe", label: "They are safe", Icon: ShieldCheck },
] as const;

function respLabel(v: string | null) {
  if (v === "seen") return "Noted this";
  if (v === "getting_help") return "Getting help";
  if (v === "on_way" || v === "responding") return "On my way";
  if (v === "marked_safe") return "They are safe";
  return v ?? "";
}
function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + " mins ago";
  if (diff < 86400) return Math.floor(diff / 3600) + " hrs ago";
  return new Date(iso).toLocaleDateString();
}

export function PanicInboxScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Panic[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState<string | null>(null);
  const [nearby, setNearby] = useState<Nearby[]>([]);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("my_incoming_panics");
    setItems(data ?? []);
    // Alarms from people whose circle you are not in. No identity is returned,
    // by design: strangers get the fact and the place, never the person.
    const { data: near } = await supabase.rpc("nearby_panics");
    setNearby((near ?? []) as Nearby[]);
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === "granted") {
        const p = await Location.getLastKnownPositionAsync();
        if (p) setMyPos({ lat: p.coords.latitude, lng: p.coords.longitude });
      }
    } catch (_e) {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function respond(p: Panic, response: string) {
    setBusy(p.alarm_id);
    const { error } = await supabase.rpc("acknowledge_panic", { p_alarm: p.alarm_id, p_response: response });
    setBusy(null);
    if (error) return showAlert({ title: "Could not respond", message: error.message, tone: "error" });
    load();
  }

  const activeCount = items.filter((i) => i.status === "active").length;

  function metres(aLat: number, aLng: number, bLat: number, bLng: number) {
    const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
    const s2 = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s2));
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtnPlain} hitSlop={8}>
          <ArrowLeft size={20} color={colors.ink} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headTitle}>Alarm history</Text>
        <Pressable onPress={() => navigation.navigate("Panic")} style={styles.headBtnFilled} hitSlop={8}>
          <Siren size={17} color={colors.riskHigh} strokeWidth={2} />
        </Pressable>
      </View>

      {activeCount > 0 ? (
        <View style={styles.activeBanner}>
          <Siren size={15} color={colors.riskHigh} strokeWidth={2.4} />
          <Text style={styles.activeBannerText}>
            {activeCount === 1 ? "1 alarm is active right now" : activeCount + " alarms are active right now"}
          </Text>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color={colors.ink} style={{ marginTop: 40 }} />
      ) : items.length === 0 && nearby.length === 0 ? (
        <View style={styles.empty}>
          <ShieldCheck size={34} color={colors.safe} strokeWidth={1.8} />
          <Text style={styles.emptyTitle}>No alarms</Text>
          <Text style={styles.emptySub}>
            Panic alarms from people whose circle you are in will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.alarm_id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, paddingBottom: insets.bottom + screenBottomPad }}
          ListHeaderComponent={
            nearby.length > 0 ? (
              <View style={{ marginBottom: spacing.md }}>
                <Text style={styles.groupLabel}>Someone nearby needs help</Text>
                {nearby.map((n) => {
                  const away = myPos ? metres(myPos.lat, myPos.lng, n.latitude, n.longitude) : null;
                  const open = mapOpen === n.alarm_id;
                  return (
                    <View key={n.alarm_id} style={[styles.card, styles.cardActive]}>
                      <View style={styles.row}>
                        <View style={styles.anonAvatar}>
                          <HelpCircle size={20} color={colors.riskHigh} strokeWidth={2} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.name}>A FlagRisk user</Text>
                          <Text style={[styles.sub, { color: colors.riskHigh, fontWeight: "600" }]}>
                            {away != null
                              ? (away < 1000 ? Math.round(away / 10) * 10 + " m away" : (away / 1000).toFixed(1) + " km away")
                              : "Close to you"}
                            {"  |  "}{timeAgo(n.triggered_at)}
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => setMapOpen(open ? null : n.alarm_id)}
                          hitSlop={10}
                          style={styles.mapBtn}
                        >
                          <MapIcon size={19} color={colors.ink} strokeWidth={2} />
                        </Pressable>
                      </View>
                      {open ? (
                        <View style={{ marginTop: spacing.ms }}>
                          <MiniMap lat={n.latitude} lng={n.longitude} />
                        </View>
                      ) : null}
                      <Text style={styles.anonNote}>
                        You are not in this person's circle, so their name is not shared. Go only if
                        it is safe to do so, or call local emergency services.
                      </Text>
                    </View>
                  );
                })}
                {items.length > 0 ? (
                  <Text style={[styles.groupLabel, { marginTop: spacing.lg }]}>From your circle</Text>
                ) : null}
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const active = item.status === "active";
            const open = mapOpen === item.alarm_id;
            return (
              <View style={[styles.card, active && styles.cardActive]}>
                <View style={styles.row}>
                  <Avatar uri={item.firer_avatar} name={item.firer_name} id={item.firer_id} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>{item.firer_name}</Text>
                    <Text style={[styles.sub, active && { color: colors.riskHigh, fontWeight: "600" }]}>
                      {active ? "Alarm active" : "Alarm ended"}  |  {timeAgo(item.triggered_at)}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => setMapOpen(open ? null : item.alarm_id)}
                    hitSlop={10}
                    style={styles.mapBtn}
                  >
                    <MapIcon size={19} color={colors.ink} strokeWidth={2} />
                  </Pressable>
                </View>

                {open ? (
                  <View style={{ marginTop: spacing.ms }}>
                    <MiniMap lat={item.latitude} lng={item.longitude} />
                  </View>
                ) : null}

                {active ? (
                  <>
                    <Text style={styles.actionsLabel}>How can you respond?</Text>
                    <View style={styles.actions}>
                      {RESPONSES.map(({ value, label, Icon }) => {
                        const selected = item.my_response === value;
                        return (
                          <Pressable
                            key={value}
                            disabled={busy === item.alarm_id}
                            onPress={() => respond(item, value)}
                            style={[styles.actBtn, selected && styles.actBtnOn]}
                          >
                            <Icon size={15} color={selected ? colors.accent : colors.ink} strokeWidth={2} />
                            <Text style={[styles.actText, selected && { color: colors.ink }]}>{label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                ) : null}

                {item.my_response ? (
                  <Text style={styles.ackNote}>You responded: {respLabel(item.my_response)}</Text>
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
  safe: { flex: 1, backgroundColor: colors.bg },

  header: { height: 36, flexDirection: "row", alignItems: "center", marginHorizontal: spacing.gutter, marginTop: spacing.md },
  headBtnPlain: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headBtnFilled: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#F0F0F0", alignItems: "center", justifyContent: "center" },
  headTitle: { flex: 1, ...type.heading, color: colors.ink, textAlign: "center" },

  activeBanner: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    backgroundColor: "#FBD1CF", borderRadius: radius.md,
    marginHorizontal: spacing.gutter, marginTop: spacing.md, paddingVertical: 12,
  },
  activeBannerText: { ...type.caption, fontWeight: "600", color: colors.riskHigh },

  card: {
    backgroundColor: colors.bg, borderRadius: radius.md, padding: spacing.md,
    marginBottom: spacing.sm, ...elevation.hairline,
  },
  cardActive: { borderWidth: 1, borderColor: colors.riskHigh },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.ms },
  name: { ...type.label, color: "#000000" },
  sub: { ...type.caption, color: colors.textMuted, marginTop: 3 },
  mapBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#F0F0F0", alignItems: "center", justifyContent: "center" },

  actionsLabel: { ...type.caption, fontWeight: "600", color: colors.textMuted, marginTop: spacing.md, marginBottom: spacing.sm },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  actBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    flexGrow: 1, flexBasis: "46%", height: 44, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: 6,
  },
  actBtnOn: { backgroundColor: "#EDEDED", borderWidth: 1.5, borderColor: colors.ink },
  actText: { fontSize: 13, lineHeight: 17, fontWeight: "600", color: colors.ink },
  ackNote: { ...type.caption, fontWeight: "600", color: colors.safe, marginTop: spacing.ms, textAlign: "center" },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, gap: 8 },
  emptyTitle: { ...type.subheading, color: colors.ink },
  emptySub: { ...type.caption, color: colors.textMuted, textAlign: "center", lineHeight: 18 },
  groupLabel: { fontSize: 12, lineHeight: 24, fontWeight: "600", color: colors.ink, marginBottom: spacing.xs },
  anonAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "#FBD1CF",
    alignItems: "center", justifyContent: "center",
  },
  anonNote: { ...type.caption, color: colors.textMuted, lineHeight: 17, marginTop: spacing.ms },
});
