// ============================================================================
// Risk Summary - FlagRisk v2.1
// Presented as a DRAWER over the dimmed Dashboard, which is what the mock name
// "Risk Score Drawup" means. Registered with presentation: "transparentModal"
// so the Dashboard stays visible behind the scrim.
// Rebuilt against Figma "2.0 Risk Score Drawup" (nodes 1:2249 / 1:2419).
//   header 36pt round back | title 20/700 centred
//   dial + band word | summary sentence | "What is feeding this" section
//   factor cards white r16 with the decay bar and its explanation
//   "How your score works" card
// Snapshot model unchanged: loads once, re-checks quietly, and offers a banner
// rather than mutating the numbers while they are being read.
// ============================================================================
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, useNavigation } from "@react-navigation/native";
import { ArrowUpRight, ShieldAlert, RefreshCw } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { RiskGauge } from "../components/RiskGauge";
import { colors, radius, spacing, type, elevation } from "../theme";

type Factor = {
  incident_id: string; category_id: string; severity: number; confidence: number;
  distance_m: number; age_hours: number; freshness_weight: number; contribution: number;
};
type Explained = {
  score: number; band: string; radius_km: number;
  incident_count: number; summary: string; factors: Factor[];
};

function prettyDistance(m: number) {
  if (m < 1000) return Math.round(m) + " meters away";
  return (m / 1000).toFixed(1) + " km away";
}
function prettyAge(h: number) {
  if (h < 1) return "in the last hour";
  if (h < 24) return Math.round(h) + " hours ago";
  return Math.round(h / 24) + " days ago";
}

export function RiskBreakdownScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const location: string | undefined = route.params?.location;
  const radiusKm: number = route.params?.radiusKm ?? 1;

  const [data, setData] = useState<Explained | null>(null);
  const [pending, setPending] = useState<Explained | null>(null);
  const [loading, setLoading] = useState(true);
  const RECHECK_MS = 120000;

  const bandKey = (data ? data.band : "low").toLowerCase();
  const bandColor =
    bandKey === "high" ? colors.riskHigh : bandKey === "medium" ? colors.riskMedium : colors.riskLow;
  const bandWord = bandKey.charAt(0).toUpperCase() + bandKey.slice(1);

  const fetchSnapshot = useCallback(async (): Promise<Explained | null> => {
    if (!location) return null;
    try {
      const { data: res, error } = await supabase.rpc("risk_score_explained", {
        p_location: location, p_radius_km: radiusKm,
      });
      if (!error && res) return res as Explained;
    } catch { /* ignore */ }
    return null;
  }, [location, radiusKm]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const snap = await fetchSnapshot();
      if (alive) { setData(snap); setLoading(false); }
    })();
    return () => { alive = false; };
  }, [fetchSnapshot]);

  useEffect(() => {
    const id = setInterval(async () => {
      const snap = await fetchSnapshot();
      if (snap && data && Math.round(snap.score) !== Math.round(data.score)) setPending(snap);
    }, RECHECK_MS);
    return () => clearInterval(id);
  }, [fetchSnapshot, data]);

  return (
    <View style={styles.shell}>
      <Pressable style={styles.scrim} onPress={() => navigation.goBack()} />
      <View style={[styles.drawer, { paddingBottom: insets.bottom }]}>
        <View style={styles.grabber} />
        <Text style={styles.drawerTitle}>Risk summary</Text>

      {loading ? (
        <ActivityIndicator color={colors.ink} style={{ marginTop: 40 }} />
      ) : !data ? (
        <Text style={styles.empty}>
          The breakdown could not be loaded. Make sure location is switched on, then try again.
        </Text>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingBottom: insets.bottom + spacing.xxl }}
          showsVerticalScrollIndicator={false}
        >
          {pending ? (
            <Pressable onPress={() => { setData(pending); setPending(null); }} style={styles.banner}>
              <RefreshCw size={15} color={colors.ink} strokeWidth={2.4} />
              <Text style={styles.bannerText}>
                Score updated to {Math.round(pending.score)}. Tap to refresh.
              </Text>
            </Pressable>
          ) : null}

          <View style={styles.dialWrap}>
            {/* The gauge prints the band inside itself, and this screen prints it
                again beneath. Two labels, so the dial keeps quiet here. */}
            <RiskGauge score={data.score} size={196} showLabel={false} />
            <Text style={[styles.bandWord, { color: bandColor }]}>{bandWord}</Text>
          </View>

          <Text style={styles.summary}>{data.summary}</Text>

          {data.factors.length > 0 ? (
            <>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>What is feeding this</Text>
                <View style={styles.sectionChip}>
                  <ArrowUpRight size={17} color={colors.ink} strokeWidth={2} />
                </View>
              </View>

              {data.factors.map((f) => {
                const pct = Math.max(0, Math.min(1, Number(f.freshness_weight)));
                const shown = Math.round(pct * 100);
                return (
                  <Pressable
                    key={f.incident_id}
                    style={styles.factorCard}
                    onPress={() => navigation.navigate("IncidentDetail", { incidentId: f.incident_id })}
                  >
                    <View style={styles.factorTop}>
                      <Text style={styles.factorCat} numberOfLines={1}>
                        {f.category_id.replace(/_/g, " ")}
                      </Text>
                      <Text style={styles.factorPct}>{shown}%</Text>
                    </View>
                    <Text style={styles.factorMeta}>
                      {prettyDistance(f.distance_m)}  |  {prettyAge(f.age_hours)}
                    </Text>
                    <View style={styles.freshTrack}>
                      <View style={[styles.freshFill, { width: shown + "%", backgroundColor: bandColor }]} />
                    </View>
                    <Text style={styles.freshNote}>Counts at {shown}% now, fading as it ages</Text>
                  </Pressable>
                );
              })}

              {data.incident_count > data.factors.length ? (
                <Text style={styles.more}>
                  {data.incident_count - data.factors.length} more within {data.radius_km} km
                </Text>
              ) : null}
            </>
          ) : null}

          <View style={styles.howCard}>
            <View style={styles.howHead}>
              <ShieldAlert size={17} color={colors.ink} strokeWidth={2} />
              <Text style={styles.howTitle}>How your score works</Text>
            </View>
            <Text style={styles.howText}>
              Your score weighs each nearby incident by how close it is, how recent, how severe, and how
              confirmed. Older incidents fade quickly, so the score reflects the danger around you right
              now, within {data.radius_km} km.
            </Text>
          </View>
        </ScrollView>
      )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, justifyContent: "flex-end" },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(1,1,20,0.34)" },
  drawer: {
    maxHeight: "88%", backgroundColor: "#FFFFFF",
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    paddingTop: spacing.sm, ...elevation.sheet,
  },
  grabber: { alignSelf: "center", width: 44, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: spacing.md },
  drawerTitle: { ...type.title, color: colors.ink, textAlign: "center", marginBottom: spacing.sm },
  empty: { ...type.body, color: colors.textMuted, textAlign: "center", marginTop: 60, paddingHorizontal: spacing.xl },

  banner: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: "#F0F0F0", borderRadius: radius.md,
    paddingVertical: 12, paddingHorizontal: spacing.md, marginTop: spacing.md,
  },
  bannerText: { ...type.caption, fontWeight: "600", color: colors.ink },

  dialWrap: { alignItems: "center", marginTop: spacing.lg },
  bandWord: { ...type.subheading, marginTop: spacing.sm },
  summary: { ...type.label, fontWeight: "400", color: colors.ink, textAlign: "center", lineHeight: 20, marginTop: spacing.ms },

  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 28, marginTop: spacing.xl, marginBottom: spacing.sm },
  sectionTitle: { fontSize: 16, lineHeight: 20, fontWeight: "700", color: colors.ink },
  sectionChip: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#EBEBEB", alignItems: "center", justifyContent: "center" },

  factorCard: {
    backgroundColor: colors.bg, borderRadius: radius.md, padding: spacing.md,
    marginBottom: spacing.sm, ...elevation.hairline,
  },
  factorTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  factorCat: { ...type.label, fontWeight: "600", color: colors.ink, textTransform: "capitalize", flex: 1 },
  factorPct: { ...type.label, fontWeight: "600", color: colors.ink },
  factorMeta: { ...type.caption, color: colors.textMuted, marginTop: 3 },
  freshTrack: { height: 6, borderRadius: 3, backgroundColor: "#EBEBEB", marginTop: spacing.ms, overflow: "hidden" },
  freshFill: { height: 6, borderRadius: 3 },
  freshNote: { ...type.caption, color: colors.textMuted, marginTop: 6 },
  more: { ...type.caption, color: colors.textMuted, marginTop: 2, marginBottom: spacing.sm },

  howCard: { backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg },
  howHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  howTitle: { fontSize: 16, lineHeight: 20, fontWeight: "700", color: colors.ink },
  howText: { ...type.caption, color: colors.textMuted, lineHeight: 18 },
});


