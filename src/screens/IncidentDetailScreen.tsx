// Incident Detail (V2 + theming). Logic + safety content unchanged; theme-aware.
// AI "Context-aware suggestions" now come from the safety-suggestions Edge
// Function (Gemini + Google Maps grounding), called with just the incidentId.
// The advisory is cached per-incident server-side; real nearby places are shown
// as tappable source chips (Google Maps attribution).
import { useCallback, useState } from "react";
import { showAlert } from "../components/Feedback";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRoute, useNavigation } from "@react-navigation/native";
import * as Location from "expo-location";
import { supabase } from "../../lib/supabase";
import { compassDirection, reverseGeocode } from "../../lib/geo";
import { MiniMap } from "../components/MiniMap";
import { useTheme } from "../theme/ThemeProvider";
import { ShieldCheck, Sparkles, Siren, ChevronLeft } from "lucide-react-native";
import { radius, spacing } from "../theme";

type Detail = {
  id: string; category_id: string; status: string;
  latitude: number; longitude: number;
  created_at: string; expires_at: string | null;
  confirms: number; disputes: number;
};
type Source = { title: string; uri: string };

const SAFETY_STEPS: Record<string, string[]> = {
  robbery: [
    "Avoid the flagged area and find a safe, populated place.",
    "Do not confront anyone - your safety comes first.",
    "Alert your network so they know your situation.",
    "If you are in immediate danger, call local emergency services.",
  ],
  assault: [
    "Move away from the area toward people and lighting.",
    "Get to a safe indoor location if you can.",
    "Alert your network and share your location.",
    "If anyone is hurt or in danger, call emergency services now.",
  ],
  kidnapping: [
    "Do not approach the flagged location.",
    "Stay in a public, busy place; avoid travelling alone nearby.",
    "Alert your network immediately and share your location.",
    "Contact local authorities if you have information or feel at risk.",
  ],
  fire: [
    "Move upwind and away from the fire and smoke.",
    "Do not return for belongings.",
    "Warn others nearby if it is safe to do so.",
    "Call emergency services to report the fire.",
  ],
  accident: [
    "Keep clear of the road/area to avoid secondary incidents.",
    "Do not move seriously injured people unless they are in danger.",
    "Call emergency services if there are injuries.",
    "Alert your network if this affects your route.",
  ],
  flood: [
    "Move to higher ground immediately.",
    "Do not walk or drive through moving water.",
    "Avoid the flagged area until conditions are confirmed safe.",
    "Alert your network and follow official guidance.",
  ],
  protest: [
    "Avoid the area; protests can change quickly.",
    "Stay calm and move away from crowds and confrontation.",
    "Keep your phone charged and your network informed.",
    "Follow lawful instructions from authorities.",
  ],
};
const DEFAULT_STEPS = [
  "Stay alert and avoid the flagged area if you can.",
  "Move toward a safe, populated, well-lit place.",
  "Alert your network and share your location.",
  "Contact local emergency services if you are in danger.",
];
function stepsFor(cat: string) { return SAFETY_STEPS[cat] ?? DEFAULT_STEPS; }

function distanceM(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function prettyDistance(m: number) {
  if (m < 1000) return `${Math.round(m / 10) * 10} m away`;
  return `${(m / 1000).toFixed(1)} km away`;
}
function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

export function IncidentDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { colors, glass } = useTheme();
  const incidentId: string = route.params?.incidentId;

  const [d, setD] = useState<Detail | null>(null);
  const [dist, setDist] = useState<number | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [direction, setDirection] = useState<string | null>(null);
  const [aiSteps, setAiSteps] = useState<string[] | null>(null);
  const [aiSources, setAiSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("incident_detail", { p_incident: incidentId });
    const detail = data && data[0] ? data[0] : null;
    setD(detail);
    setLoading(false);
    if (!detail) return;
    let userLat: number | null = null, userLng: number | null = null;
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === "granted") {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        userLat = pos.coords.latitude; userLng = pos.coords.longitude;
        const dm = distanceM(userLat, userLng, detail.latitude, detail.longitude);
        setDist(dm);
        setDirection(compassDirection(userLat, userLng, detail.latitude, detail.longitude));
      }
    } catch { /* distance optional */ }
    const placeName = await reverseGeocode(detail.latitude, detail.longitude);
    setPlace(placeName);
    // AI advisory: grounded in Google Maps, cached per-incident server-side.
    try {
      const { data: s } = await supabase.auth.getSession();
      const resp = await fetch("https://aqgkntulbuqqqjxjafmw.supabase.co/functions/v1/safety-suggestions", {
        method: "POST",
        headers: { Authorization: `Bearer ${s.session?.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId }),
      });
      const j = await resp.json();
      if (j.ok && Array.isArray(j.suggestions) && j.suggestions.length) {
        setAiSteps(j.suggestions);
        setAiSources(Array.isArray(j.sources) ? j.sources : []);
      }
    } catch { /* enrichment optional */ }
  }, [incidentId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function confirm(still: boolean) {
    setBusy(true);
    let lat: number | null = null, lng: number | null = null;
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === "granted") {
        const pos = await Location.getCurrentPositionAsync({});
        lat = pos.coords.latitude; lng = pos.coords.longitude;
      }
    } catch { /* optional */ }
    const { error } = await supabase.rpc("confirm_incident", { p_incident: incidentId, p_still: still, p_lat: lat, p_lng: lng });
    setBusy(false);
    if (error) return showAlert({ title: "Could not submit", message: error.message, tone: "error" });
    showAlert({
      title: still ? "Confirmed" : "Marked cleared",
      message: still ? "Thanks - you confirmed this is still happening." : "Thanks - you reported this as cleared / not accurate."
    });
    load();
  }

  const Header = () => (
    <View style={styles.header}>
      <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backRow}>
        <ChevronLeft size={20} color={colors.accentOn} strokeWidth={2.5} />
        <Text style={[styles.back, { color: colors.accentOn }]}>Back</Text>
      </Pressable>
      <Text style={[styles.headerTitle, { color: colors.text }]}>Risk nearby</Text>
      <View style={{ width: 50 }} />
    </View>
  );

  if (loading) return <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}><ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} /></SafeAreaView>;
  if (!d) return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}><Header />
      <Text style={[styles.empty, { color: colors.textMuted }]}>This incident is no longer available.</Text></SafeAreaView>
  );

  const catLabel = d.category_id.replace(/_/g, " ");
  const steps = stepsFor(d.category_id);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top", "bottom"]}>
      <Header />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}>
        <Text style={[styles.cat, { color: colors.text }]}>{catLabel}</Text>

        <View style={[styles.proximityCard, { backgroundColor: glass.surface, borderLeftColor: colors.danger }]}>
          <View style={styles.proximityDistRow}>
            <Text style={[styles.proximityDist, { color: colors.text }]}>
              {dist != null ? prettyDistance(dist) : "Distance unavailable"}
            </Text>
            {direction ? <View style={[styles.inlineDot, { backgroundColor: colors.textMuted }]} /> : null}
            {direction ? <Text style={[styles.proximityDist, { color: colors.text }]}>{direction}</Text> : null}
          </View>
          {place ? <Text style={[styles.proximityPlace, { color: colors.accentOn }]}>Near {place}</Text> : null}
          <Text style={[styles.proximityTime, { color: colors.textMuted }]}>Flagged {timeAgo(d.created_at)}</Text>
        </View>

        <MiniMap lat={d.latitude} lng={d.longitude} />
        <Text style={[styles.mapNote, { color: colors.textMuted }]}>Exact flagged location</Text>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.xl, marginBottom: spacing.sm }}><ShieldCheck size={19} color={colors.safe} strokeWidth={2} /><Text style={[styles.stepsHeading, { color: colors.text, marginTop: 0, marginBottom: 0 }]}>Stay safe - do this now</Text></View>
        <View style={[styles.stepsCard, { backgroundColor: glass.surface, borderColor: glass.stroke }]}>
          {steps.map((s, i) => (
            <View key={i} style={styles.stepRow}>
              <Text style={[styles.stepNum, { color: colors.accentText, backgroundColor: colors.accent }]}>{i + 1}</Text>
              <Text style={[styles.stepText, { color: colors.text }]}>{s}</Text>
            </View>
          ))}
        </View>

        {aiSteps && aiSteps.length > 0 && (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.xl, marginBottom: spacing.sm }}><Sparkles size={19} color={colors.accentOn} strokeWidth={2} /><Text style={[styles.aiHeading, { color: colors.text, marginTop: 0, marginBottom: 0 }]}>Context-aware suggestions</Text></View>
            <View style={[styles.aiCard, { backgroundColor: glass.surface, borderColor: glass.stroke }]}>
              {aiSteps.map((s, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={[styles.aiDot, { backgroundColor: colors.accentOn }]} />
                  <Text style={[styles.stepText, { color: colors.text }]}>{s}</Text>
                </View>
              ))}
              {aiSources.length > 0 && (
                <View style={styles.sourcesWrap}>
                  <Text style={[styles.sourcesLabel, { color: colors.textMuted }]}>Nearby places via Google Maps</Text>
                  <View style={styles.sourcesRow}>
                    {aiSources.map((src, i) => (
                      <Pressable key={i} onPress={() => src.uri && Linking.openURL(src.uri)} style={[styles.sourceChip, { borderColor: glass.stroke }]}>
                        <Text style={[styles.sourceChipText, { color: colors.accentOn }]} numberOfLines={1}>{src.title}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
              <Text style={[styles.aiNote, { color: colors.textMuted }]}>AI-generated for your situation - use your own judgement; not official advice.</Text>
            </View>
          </>
        )}

        <Pressable style={[styles.panicBtn, { backgroundColor: colors.danger }]} onPress={() => navigation.navigate("Panic")}>
          <Siren size={20} color="#fff" strokeWidth={2} /><Text style={[styles.panicText, { marginLeft: 8 }]}>Activate Panic Alarm</Text>
        </Pressable>

        <Text style={[styles.prompt, { color: colors.text }]}>Are you near this? Help others by confirming.</Text>
        <Pressable style={[styles.confirmBtn, { backgroundColor: colors.accent }, busy && { opacity: 0.6 }]} disabled={busy} onPress={() => confirm(true)}>
          <Text style={[styles.confirmText, { color: colors.accentText }]}>Still happening</Text>
        </Pressable>
        <Pressable style={[styles.disputeBtn, { borderColor: colors.danger }, busy && { opacity: 0.6 }]} disabled={busy} onPress={() => confirm(false)}>
          <Text style={[styles.disputeText, { color: colors.danger }]}>Cleared / not accurate</Text>
        </Pressable>
        <View style={styles.tallyRow}>
          <Text style={[styles.tally, { color: colors.textMuted }]}>{d.confirms} confirmed</Text>
          <View style={[styles.inlineDotSm, { backgroundColor: colors.textMuted }]} />
          <Text style={[styles.tally, { color: colors.textMuted }]}>{d.disputes} disputed</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backRow: { flexDirection: "row", alignItems: "center" },
  back: { fontSize: 16, fontWeight: "700" },
  headerTitle: { fontSize: 18, fontWeight: "800" },
  empty: { textAlign: "center", marginTop: 40 },
  cat: { fontSize: 28, fontWeight: "800", textTransform: "capitalize" },
  proximityCard: { borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.md, borderLeftWidth: 4 },
  proximityDistRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  proximityDist: { fontSize: 24, fontWeight: "800" },
  inlineDot: { width: 5, height: 5, borderRadius: 2.5, marginHorizontal: 8 },
  proximityPlace: { fontSize: 15, fontWeight: "600", marginTop: 4 },
  proximityTime: { fontSize: 14, marginTop: 4 },
  mapNote: { fontSize: 12, textAlign: "center", marginTop: 6 },
  aiHeading: { fontSize: 17, fontWeight: "800", marginTop: spacing.xl, marginBottom: spacing.sm },
  aiCard: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, borderWidth: 1 },
  aiDot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  aiNote: { fontSize: 11, fontStyle: "italic", marginTop: spacing.sm },
  sourcesWrap: { marginTop: 8 },
  sourcesLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3, marginBottom: 6 },
  sourcesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  sourceChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, maxWidth: "100%" },
  sourceChipText: { fontSize: 12, fontWeight: "700" },
  stepsHeading: { fontSize: 17, fontWeight: "800", marginTop: spacing.xl, marginBottom: spacing.sm },
  stepsCard: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, borderWidth: 1 },
  stepRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  stepNum: { width: 24, height: 24, borderRadius: 12, textAlign: "center", lineHeight: 24, fontWeight: "800", fontSize: 13, overflow: "hidden" },
  stepText: { fontSize: 15, flex: 1, lineHeight: 21 },
  panicBtn: { borderRadius: radius.md, height: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: spacing.xl },
  panicText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  prompt: { fontSize: 15, fontWeight: "600", marginTop: spacing.xl, marginBottom: spacing.md, textAlign: "center" },
  confirmBtn: { height: 52, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  confirmText: { fontSize: 16, fontWeight: "800" },
  disputeBtn: { height: 52, borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center", marginTop: spacing.md },
  disputeText: { fontSize: 16, fontWeight: "700" },
  tallyRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: spacing.md },
  inlineDotSm: { width: 3, height: 3, borderRadius: 1.5, marginHorizontal: 6 },
  tally: { fontSize: 13 },
});
