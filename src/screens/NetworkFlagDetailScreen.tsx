// Network Flag Detail: the personal "someone in your circle flagged a risk" view.
// Leads with WHO flagged and WHERE they are; links to the full public safety
// detail (IncidentDetail) for the "what to do" guidance. Gated by
// network_flag_detail, which only returns data if the viewer is in the flagger's network.
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRoute, useNavigation } from "@react-navigation/native";
import * as Location from "expo-location";
import { ChevronLeft, MapPin, Clock, ShieldAlert, ChevronRight } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { Avatar } from "../components/Avatar";
import { reverseGeocode } from "../../lib/geo";
import { MiniMap } from "../components/MiniMap";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing } from "../theme";

type Detail = {
  flagger_id: string; flagger_name: string; flagger_avatar?: string | null; category_id: string;
  severity_score: number | null; status: string;
  latitude: number; longitude: number; flagged_at: string; is_panic_circle: boolean;
};

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
function distanceM(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function prettyDistance(m: number) {
  if (m < 1000) return Math.round(m / 10) * 10 + " m away";
  return (m / 1000).toFixed(1) + " km away";
}
function sevBand(s: number | null) {
  if (s == null) return { label: "Unknown", c: "#9aa0aa" };
  if (s >= 0.7) return { label: "High", c: "#e0457b" };
  if (s >= 0.4) return { label: "Medium", c: "#e0a045" };
  return { label: "Low", c: "#3ec46a" };
}

export function NetworkFlagDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { colors, glass, gradients, glow } = useTheme();
  const incidentId: string = route.params?.incidentId;

  const [d, setD] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [place, setPlace] = useState<string | null>(null);
  const [dist, setDist] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("network_flag_detail", { p_incident: incidentId });
    const detail = data && data[0] ? data[0] : null;
    setD(detail); setLoading(false);
    if (!detail) return;
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === "granted") {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setDist(distanceM(pos.coords.latitude, pos.coords.longitude, detail.latitude, detail.longitude));
      }
    } catch {}
    setPlace(await reverseGeocode(detail.latitude, detail.longitude));
  }, [incidentId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}><ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} /></SafeAreaView>;

  if (!d) return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top"]}>
      <View style={styles.topbar}><Pressable onPress={() => navigation.goBack()} hitSlop={12}><ChevronLeft size={22} color={colors.text} /></Pressable></View>
      <Text style={[styles.empty, { color: colors.textMuted }]}>This alert is no longer available, or you do not have access to the personal view.</Text>
    </SafeAreaView>
  );

  const sev = sevBand(d.severity_score);
  const catLabel = d.category_id.replace(/_/g, " ");

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top", "bottom"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={{ flexDirection: "row", alignItems: "center" }}>
          <ChevronLeft size={22} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>From your circle</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}>
        <View style={styles.flaggerRow}>
          <Avatar uri={d.flagger_avatar} name={d.flagger_name} id={d.flagger_id} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.flagger, { color: colors.text }]}>{d.flagger_name}</Text>
            <Text style={[styles.flaggerSub, { color: colors.textMuted }]}>flagged a risk near them</Text>
          </View>
        </View>

        <View style={[styles.sevPill, { backgroundColor: sev.c + "22", borderColor: sev.c }]}>
          <ShieldAlert size={16} color={sev.c} strokeWidth={2.5} />
          <Text style={[styles.sevText, { color: sev.c }]}>{sev.label} severity</Text>
          <Text style={[styles.catText, { color: colors.text }]}>{catLabel}</Text>
        </View>

        <View style={[styles.infoCard, { backgroundColor: glass.surface, borderColor: glass.stroke }]}>
          <View style={styles.infoRow}>
            <MapPin size={18} color={colors.accentOn} strokeWidth={2} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Where they are</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>{place ?? "Locating..."}</Text>
              {dist != null && <Text style={[styles.infoSub, { color: colors.accentOn }]}>{prettyDistance(dist)} from you</Text>}
            </View>
          </View>
          <View style={[styles.infoRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.md }]}>
            <Clock size={18} color={colors.accentOn} strokeWidth={2} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoLabel, { color: colors.textMuted }]}>When</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>{timeAgo(d.flagged_at)}</Text>
            </View>
          </View>
        </View>

        <MiniMap lat={d.latitude} lng={d.longitude} />
        <Text style={[styles.mapNote, { color: colors.textMuted }]}>Their flagged location</Text>

        <Pressable onPress={() => navigation.navigate("IncidentDetail", { incidentId })}
          style={[styles.detailLink, { backgroundColor: glass.surface, borderColor: glass.stroke } as any]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.detailLinkTitle, { color: colors.text }]}>See the full risk details</Text>
            <Text style={[styles.detailLinkSub, { color: colors.textMuted }]}>Nature of the risk, safety steps, and confirmations.</Text>
          </View>
          <ChevronRight size={20} color={colors.textMuted} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  headerTitle: { fontSize: 17, fontWeight: "800" },
  empty: { textAlign: "center", marginTop: 40, paddingHorizontal: spacing.xl },
  flaggerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.lg },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 20 },
  flagger: { fontSize: 22, fontWeight: "800" },
  flaggerSub: { fontSize: 15, marginTop: 2 },
  sevPill: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", borderWidth: 1, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, marginBottom: spacing.lg },
  sevText: { fontSize: 14, fontWeight: "800" },
  catText: { fontSize: 14, fontWeight: "600", textTransform: "capitalize" },
  infoCard: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.md, marginBottom: spacing.lg },
  infoRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  infoLabel: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4 },
  infoValue: { fontSize: 16, fontWeight: "700", marginTop: 2 },
  infoSub: { fontSize: 14, fontWeight: "600", marginTop: 2 },
  mapNote: { fontSize: 12, textAlign: "center", marginTop: 6, marginBottom: spacing.lg },
  detailLink: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  detailLinkTitle: { fontSize: 16, fontWeight: "800" },
  detailLinkSub: { fontSize: 13, marginTop: 2 },
});
