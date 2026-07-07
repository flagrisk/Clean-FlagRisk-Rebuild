// Risk Breakdown - full-screen "why is my score this number" detail.
// Calls risk_score_explained(location, radius) and shows the score, a plain-
// language summary, and each contributing incident with distance, recency, and
// a freshness bar (how much the incident has decayed). Every value is real -
// the same math that produced the score, surfaced for transparency.
// Snapshot model: loads once, re-checks quietly every 2 min; if the score moved
// it shows a tap-to-refresh banner rather than mutating the page under the reader.
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, useNavigation } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../theme/ThemeProvider";
import { ChevronLeft, ShieldAlert, RefreshCw } from "lucide-react-native";
import { radius as rad, spacing } from "../theme";

type Factor = {
  incident_id: string;
  category_id: string;
  severity: number;
  confidence: number;
  distance_m: number;
  age_hours: number;
  freshness_weight: number;
  contribution: number;
};
type Explained = {
  score: number;
  band: string;
  radius_km: number;
  incident_count: number;
  summary: string;
  factors: Factor[];
};

function prettyDistance(m: number) {
  if (m < 1000) return `${Math.round(m)} mtrs away`;
  return `${(m / 1000).toFixed(1)} km away`;
}
function prettyAge(h: number) {
  if (h < 1) return "in the last hour";
  if (h < 24) return `${Math.round(h)} hours ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function RiskBreakdownScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { colors, glass } = useTheme();

  const location: string | undefined = route.params?.location;
  const radiusKm: number = route.params?.radiusKm ?? 1;

  const [data, setData] = useState<Explained | null>(null);
  const [pending, setPending] = useState<Explained | null>(null);
  const [loading, setLoading] = useState(true);
  const RECHECK_MS = 120000;

  const bandKey = (data?.band ?? "low").toLowerCase();
  const bandColor =
    bandKey === "high" ? colors.riskHigh : bandKey === "medium" ? colors.riskMedium : colors.riskLow;
  const bandWord = bandKey.charAt(0).toUpperCase() + bandKey.slice(1);

  const fetchSnapshot = useCallback(async (): Promise<Explained | null> => {
    if (!location) return null;
    try {
      const { data: res, error } = await supabase.rpc("risk_score_explained", {
        p_location: location,
        p_radius_km: radiusKm,
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
      if (snap && data && Math.round(snap.score) !== Math.round(data.score)) {
        setPending(snap);
      }
    }, RECHECK_MS);
    return () => clearInterval(id);
  }, [fetchSnapshot, data]);

  const applyPending = () => {
    if (pending) { setData(pending); setPending(null); }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backRow}>
          <ChevronLeft size={20} color={colors.accentOn} strokeWidth={2.5} />
          <Text style={[styles.back, { color: colors.accentOn }]}>Back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Your risk score</Text>
        <View style={{ width: 50 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : !data ? (
        <Text style={[styles.empty, { color: colors.textMuted }]}>
          Couldn't load the breakdown. Make sure location is enabled, then try again.
        </Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}>
          {pending && (
            <Pressable onPress={applyPending} style={[styles.banner, { backgroundColor: glass.surface, borderColor: glass.stroke }]}>
              <RefreshCw size={15} color={colors.accentOn} strokeWidth={2.5} />
              <Text style={[styles.bannerText, { color: colors.text }]}>
                Score updated to {Math.round(pending.score)} - tap to refresh
              </Text>
            </Pressable>
          )}
          <View style={[styles.scoreCard, { backgroundColor: glass.surface, borderColor: glass.stroke, borderLeftColor: bandColor }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.scoreLabel, { color: colors.textMuted }]}>Current risk</Text>
              <Text style={[styles.bandWord, { color: bandColor }]}>{bandWord}</Text>
            </View>
            <Text style={[styles.scoreBig, { color: colors.text }]}>{Math.round(data.score)}</Text>
          </View>

          <Text style={[styles.summary, { color: colors.text }]}>{data.summary}</Text>

          {data.factors.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>What's feeding this</Text>
              <View style={[styles.factorsCard, { backgroundColor: glass.surface, borderColor: glass.stroke }]}>
                {data.factors.map((f, i) => {
                  const pct = Math.max(0, Math.min(1, Number(f.freshness_weight)));
                  return (
                    <View key={f.incident_id} style={[styles.factorRow, i > 0 && { borderTopWidth: 1, borderTopColor: glass.stroke }]}>
                      <View style={styles.factorTop}>
                        <Text style={[styles.factorCat, { color: colors.text }]} numberOfLines={1}>
                          {f.category_id.charAt(0).toUpperCase() + f.category_id.slice(1)}
                        </Text>
                        <Text style={[styles.factorMeta, { color: colors.textMuted }]}>
                          {prettyDistance(f.distance_m)}  -  {prettyAge(f.age_hours)}
                        </Text>
                      </View>
                      <View style={styles.freshRow}>
                        <View style={[styles.freshTrack, { backgroundColor: colors.border }]}>
                          <View style={[styles.freshFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: bandColor }]} />
                        </View>
                        <Text style={[styles.freshPct, { color: colors.textMuted }]}>{Math.round(pct * 100)}%</Text>
                      </View>
                      <Text style={[styles.freshNote, { color: colors.textMuted }]}>
                        Counts at {Math.round(pct * 100)}% now - fading as it ages
                      </Text>
                    </View>
                  );
                })}
              </View>

              {data.incident_count > data.factors.length && (
                <Text style={[styles.more, { color: colors.textMuted }]}>
                  + {data.incident_count - data.factors.length} more within {data.radius_km} km
                </Text>
              )}
            </>
          )}

          <View style={[styles.howCard, { backgroundColor: glass.surface, borderColor: glass.stroke }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.xs }}>
              <ShieldAlert size={16} color={colors.accentOn} strokeWidth={2} />
              <Text style={[styles.howTitle, { color: colors.text }]}>How your score works</Text>
            </View>
            <Text style={[styles.howText, { color: colors.textMuted }]}>
              Your score weighs each nearby incident by how close it is, how recent, how severe, and how confirmed.
              Older incidents fade quickly, so the score reflects the danger around you right now, within {data.radius_km} km.
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backRow: { flexDirection: "row", alignItems: "center" },
  back: { fontSize: 16, fontWeight: "700" },
  headerTitle: { fontSize: 18, fontWeight: "800" },
  empty: { textAlign: "center", marginTop: 40, paddingHorizontal: spacing.xl, lineHeight: 21 },
  banner: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: rad.md, borderWidth: 1, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.md },
  bannerText: { fontSize: 13, fontWeight: "700", flex: 1 },
  scoreCard: { flexDirection: "row", alignItems: "center", borderRadius: rad.lg, padding: spacing.lg, borderWidth: 1, borderLeftWidth: 4 },
  scoreLabel: { fontSize: 13, fontWeight: "600" },
  bandWord: { fontSize: 26, fontWeight: "800", marginTop: 2 },
  scoreBig: { fontSize: 52, fontWeight: "800" },
  summary: { fontSize: 16, lineHeight: 23, marginTop: spacing.lg, fontWeight: "500" },
  sectionTitle: { fontSize: 17, fontWeight: "800", marginTop: spacing.xl, marginBottom: spacing.sm },
  factorsCard: { borderRadius: rad.lg, borderWidth: 1, overflow: "hidden" },
  factorRow: { padding: spacing.lg },
  factorTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 4 },
  factorCat: { fontSize: 16, fontWeight: "700", textTransform: "capitalize" },
  factorMeta: { fontSize: 13 },
  freshRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.sm },
  freshTrack: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  freshFill: { height: 6, borderRadius: 3 },
  freshPct: { fontSize: 12, fontWeight: "700", width: 36, textAlign: "right" },
  freshNote: { fontSize: 11, marginTop: 4 },
  more: { fontSize: 13, marginTop: spacing.md, textAlign: "center" },
  howCard: { borderRadius: rad.lg, padding: spacing.lg, borderWidth: 1, marginTop: spacing.xl },
  howTitle: { fontSize: 14, fontWeight: "800" },
  howText: { fontSize: 13, lineHeight: 20 },
});
