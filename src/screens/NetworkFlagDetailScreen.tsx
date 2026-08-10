// ============================================================================
// Network flag - FlagRisk v2.1
// Designed, not rebuilt: no mockup exists.
// The personal view of "someone in your circle flagged a risk". Leads with who
// and where, then the map, then a link through to the public safety detail for
// the what-to-do guidance.
// Gated server side by network_flag_detail, which returns nothing unless the
// viewer is in the flagger's network. Logic unchanged.
// ============================================================================
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRoute, useNavigation } from "@react-navigation/native";
import * as Location from "expo-location";
import { ArrowLeft, MapPin, Clock, ShieldAlert, ChevronRight, Siren } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { Avatar } from "../components/Avatar";
import { reverseGeocode } from "../../lib/geo";
import { MiniMap } from "../components/MiniMap";
import { colors, radius, spacing, type } from "../theme";

type Detail = {
  flagger_id: string; flagger_name: string; flagger_avatar?: string | null; category_id: string;
  severity_score: number | null; status: string;
  latitude: number; longitude: number; flagged_at: string; is_panic_circle: boolean;
};

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + " mins ago";
  if (diff < 86400) return Math.floor(diff / 3600) + " hrs ago";
  return new Date(iso).toLocaleDateString();
}
function distanceM(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000, toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(s));
}
function prettyDistance(m: number) {
  if (m < 1000) return Math.round(m / 10) * 10 + " m away";
  return (m / 1000).toFixed(1) + " km away";
}
function sevBand(s: number | null) {
  if (s == null) return { label: "Unknown", fg: colors.textMuted, bg: "#EBEBEB" };
  if (s >= 0.7) return { label: "High", fg: colors.riskHigh, bg: "#FBD1CF" };
  if (s >= 0.4) return { label: "Medium", fg: "#B26A12", bg: "#FDE7CF" };
  return { label: "Low", fg: "#1C9D6B", bg: "#D2F0E3" };
}

export function NetworkFlagDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const incidentId: string = route.params?.incidentId;

  const [d, setD] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [place, setPlace] = useState<string | null>(null);
  const [dist, setDist] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("network_flag_detail", { p_incident: incidentId });
    const detail = data && data[0] ? data[0] : null;
    setD(detail);
    setLoading(false);
    if (!detail) return;
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === "granted") {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setDist(distanceM(pos.coords.latitude, pos.coords.longitude, detail.latitude, detail.longitude));
      }
    } catch { /* distance optional */ }
    setPlace(await reverseGeocode(detail.latitude, detail.longitude));
  }, [incidentId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const Header = () => (
    <View style={styles.header}>
      <Pressable onPress={() => navigation.goBack()} style={styles.headBtnPlain} hitSlop={8}>
        <ArrowLeft size={20} color={colors.ink} strokeWidth={2} />
      </Pressable>
      <Text style={styles.headTitle}>From your circle</Text>
      <View style={{ width: 36 }} />
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Header />
        <ActivityIndicator color={colors.ink} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  if (!d) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Header />
        <Text style={styles.gone}>
          This alert is no longer available, or you do not have access to the personal view.
        </Text>
      </SafeAreaView>
    );
  }

  const sev = sevBand(d.severity_score);
  const catLabel = d.category_id.replace(/_/g, " ");

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Header />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingBottom: insets.bottom + spacing.xxl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.who}>
          <Avatar uri={d.flagger_avatar} name={d.flagger_name} id={d.flagger_id} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={styles.whoName} numberOfLines={1}>{d.flagger_name}</Text>
            <Text style={styles.whoLine}>flagged {catLabel}</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: sev.bg }]}>
            <Text style={[styles.pillText, { color: sev.fg }]}>{sev.label}</Text>
          </View>
        </View>

        {d.is_panic_circle ? (
          <View style={styles.circleNote}>
            <ShieldAlert size={15} color={colors.ink} strokeWidth={2} />
            <Text style={styles.circleNoteText}>This person is in your panic circle.</Text>
          </View>
        ) : null}

        <View style={styles.factCard}>
          <View style={styles.factRow}>
            <View style={styles.factIcon}><MapPin size={17} color={colors.ink} strokeWidth={2} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.factLabel}>Where</Text>
              <Text style={styles.factValue} numberOfLines={2}>
                {place ?? d.latitude.toFixed(5) + ", " + d.longitude.toFixed(5)}
              </Text>
            </View>
          </View>
          <View style={[styles.factRow, { borderBottomWidth: 0 }]}>
            <View style={styles.factIcon}><Clock size={17} color={colors.ink} strokeWidth={2} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.factLabel}>When</Text>
              <Text style={styles.factValue}>
                {timeAgo(d.flagged_at)}{dist != null ? ",  " + prettyDistance(dist) : ""}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ marginTop: spacing.lg }}>
          <MiniMap lat={d.latitude} lng={d.longitude} />
        </View>

        <Pressable
          style={styles.linkCard}
          onPress={() => navigation.navigate("IncidentDetail", { incidentId })}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.linkTitle}>What to do about this</Text>
            <Text style={styles.linkSub}>Safety steps and safe places nearby.</Text>
          </View>
          <ChevronRight size={19} color={colors.textMuted} strokeWidth={2} />
        </Pressable>

        <Pressable style={styles.panicBtn} onPress={() => navigation.navigate("Panic")}>
          <Siren size={19} color="#FFFFFF" strokeWidth={2} />
          <Text style={styles.panicText}>Activate panic alarm</Text>
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
  gone: { ...type.label, fontWeight: "400", color: colors.textMuted, textAlign: "center", marginTop: 60, paddingHorizontal: spacing.xl, lineHeight: 20 },

  who: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.lg },
  whoName: { ...type.subheading, color: colors.ink },
  whoLine: { ...type.caption, color: colors.textMuted, marginTop: 2, textTransform: "capitalize" },
  pill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontSize: 11, lineHeight: 15, fontWeight: "600" },

  circleNote: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#F0F0F0", borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 10, marginTop: spacing.md,
  },
  circleNoteText: { ...type.caption, fontWeight: "600", color: colors.ink },

  factCard: { backgroundColor: "#FAFAFA", borderRadius: radius.md, paddingHorizontal: spacing.md, marginTop: spacing.md },
  factRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.ms,
    paddingVertical: spacing.ms, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  factIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  factLabel: { ...type.caption, color: colors.textMuted },
  factValue: { ...type.label, color: colors.ink, marginTop: 2, lineHeight: 19 },

  linkCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.ms,
    backgroundColor: "#FAFAFA", borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg,
  },
  linkTitle: { ...type.label, fontWeight: "600", color: colors.ink },
  linkSub: { ...type.caption, color: colors.textMuted, marginTop: 3 },

  panicBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    height: 52, borderRadius: radius.md, backgroundColor: colors.riskHigh, marginTop: spacing.lg,
  },
  panicText: { ...type.bodyStrong, fontWeight: "600", color: "#FFFFFF" },
});
