// ============================================================================
// Risk Situation Details - FlagRisk v2.1
// Rebuilt against Figma "Risk Situation Details" (node 75:2431) and its empty
// state (75:2324).
//   hero band with floating 36pt back button | title 20/700 with meta line
//   description | divider | safety advice | confirm actions | Comments
//
// TWO DATA GAPS, deliberately left blank rather than invented:
//  1. The mockup shows "70%" and "Counts at 2% now - fading as it ages".
//     incident_detail does not return severity_score or confidence_score, so
//     the weight bar is omitted. Adding those two columns to the RPC turns it on.
//  2. The mockup hero is a photograph. incident_detail returns no media, so the
//     hero is a category band. Evidence lives on reports, not incidents.
//
// Comments are live, backed by incident_comments and its three RPCs.
// Media comes from incident_media, video first, then verified, then newest.
// ============================================================================
import { useCallback, useState } from "react";
import {
  ActivityIndicator, Image, Linking, Modal, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRoute, useNavigation } from "@react-navigation/native";
import * as Location from "expo-location";
import {
  ArrowLeft, ShieldCheck, Siren, Check, X, MessageSquare, Map as MapIcon, Send, Trash2,
} from "lucide-react-native";
import { riskIcon } from "../riskIcons";
import { supabase } from "../../lib/supabase";
import { showAlert } from "../components/Feedback";
import { compassDirection, reverseGeocode } from "../../lib/geo";
import { MiniMap, type RefugePlace } from "../components/MiniMap";
import { Avatar } from "../components/Avatar";
import { useVideoPlayer, VideoView } from "expo-video";
import { colors, radius, spacing, type } from "../theme";

type Detail = {
  id: string; category_id: string; status: string;
  latitude: number; longitude: number;
  created_at: string; expires_at: string | null;
  confirms: number; disputes: number;
};
type Source = { title: string; uri: string };
type Comment = {
  id: string; author_id: string; author_name: string; author_avatar: string | null;
  body: string; created_at: string; is_mine: boolean;
};

const SAFETY_STEPS: Record<string, string[]> = {
  robbery: [
    "Avoid the flagged area and find a safe, populated place.",
    "Do not confront anyone. Your safety comes first.",
    "Alert your network so they know your situation.",
    "If you are in immediate danger, call local emergency services.",
  ],
  kidnapping: [
    "Do not approach the flagged location.",
    "Stay in a public, busy place and avoid travelling alone nearby.",
    "Alert your network immediately and share your location.",
    "Contact local authorities if you have information or feel at risk.",
  ],
  fire_outbreak: [
    "Move upwind and away from the fire and smoke.",
    "Do not return for belongings.",
    "Warn others nearby if it is safe to do so.",
    "Call emergency services to report the fire.",
  ],
  flood: [
    "Move to higher ground immediately.",
    "Do not walk or drive through moving water.",
    "Avoid the flagged area until conditions are confirmed safe.",
    "Alert your network and follow official guidance.",
  ],
  protest: [
    "Avoid the area. Protests can change quickly.",
    "Stay calm and move away from crowds and confrontation.",
    "Keep your phone charged and your network informed.",
    "Follow lawful instructions from authorities.",
  ],
};
const DEFAULT_STEPS = [
  "Stay alert and avoid the flagged area if you can.",
  "Move toward a safe, populated, well lit place.",
  "Alert your network and share your location.",
  "Contact local emergency services if you are in danger.",
];
function stepsFor(cat: string) { return SAFETY_STEPS[cat] ?? DEFAULT_STEPS; }

function distanceM(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000, toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(s));
}
function prettyDistance(m: number) {
  if (m < 1000) return Math.round(m / 10) * 10 + " meters";
  return (m / 1000).toFixed(1) + " km";
}
function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + " mins ago";
  if (diff < 86400) return Math.floor(diff / 3600) + " hrs ago";
  return new Date(iso).toLocaleDateString();
}

// The player lives in its own component so it is only ever created with a real
// video source. Calling useVideoPlayer("") on the screen itself threw during
// render and blanked the whole screen, which is what happened on every incident
// that had a photograph or no media at all.
function HeroVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url, (pl) => { pl.loop = true; pl.muted = true; pl.play(); });
  return (
    <VideoView
      style={StyleSheet.absoluteFill}
      player={player}
      contentFit="cover"
      allowsFullscreen
      nativeControls
    />
  );
}

export function IncidentDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const incidentId: string = route.params?.incidentId;

  const [d, setD] = useState<Detail | null>(null);
  const [dist, setDist] = useState<number | null>(null);
  const [distStatus, setDistStatus] = useState<"calculating" | "ready" | "unavailable">("calculating");
  const [place, setPlace] = useState<string | null>(null);
  const [direction, setDirection] = useState<string | null>(null);
  const [aiSteps, setAiSteps] = useState<string[] | null>(null);
  const [aiSources, setAiSources] = useState<Source[]>([]);
  const [aiPlaces, setAiPlaces] = useState<RefugePlace[]>([]);
  const [adviceStatus, setAdviceStatus] = useState<"loading" | "ai" | "fallback">("loading");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [media, setMedia] = useState<{ url: string; isVideo: boolean } | null>(null);
  const [mediaState, setMediaState] = useState<"loading" | "ready" | "none">("loading");
  const [viewer, setViewer] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("incident_detail", { p_incident: incidentId });
    const detail = data && data[0] ? data[0] : null;
    setD(detail);
    setLoading(false);
    if (!detail) return;
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === "granted") {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const dm = distanceM(pos.coords.latitude, pos.coords.longitude, detail.latitude, detail.longitude);
        setDist(dm);
        setDirection(compassDirection(pos.coords.latitude, pos.coords.longitude, detail.latitude, detail.longitude));
        setDistStatus("ready");
      } else setDistStatus("unavailable");
    } catch { setDistStatus("unavailable"); }
    const placeName = await reverseGeocode(detail.latitude, detail.longitude);
    setPlace(placeName);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s.session ? s.session.access_token : null;
      const resp = await fetch("https://aqgkntulbuqqqjxjafmw.supabase.co/functions/v1/safety-suggestions", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId }),
      });
      const j = await resp.json();
      if (j.ok && Array.isArray(j.suggestions) && j.suggestions.length) {
        setAiSteps(j.suggestions);
        setAiSources(Array.isArray(j.sources) ? j.sources : []);
        setAiPlaces(Array.isArray(j.places) ? j.places : []);
        setAdviceStatus("ai");
      } else setAdviceStatus("fallback");
    } catch { setAdviceStatus("fallback"); }
  }, [incidentId]);

  // Evidence lives on reports, not incidents. Take the newest verified one.
  // Media attached to a report is always shown. Only media the checks have
  // positively rejected is withheld, and that decision now lives in the SQL.
  // Video wins over a photograph when both exist.
  const loadMedia = useCallback(async () => {
    setMediaState("loading");
    try {
      const { data } = await supabase.rpc("incident_media", { p_incident: incidentId });
      const row = Array.isArray(data) && data[0] ? data[0] : null;
      if (!row || !row.media_url) { setMediaState("none"); return; }
      const signed = await supabase.storage.from("report-evidence").createSignedUrl(row.media_url, 3600);
      if (!signed.data) { setMediaState("none"); return; }
      setMedia({ url: signed.data.signedUrl, isVideo: !!row.is_video });
      setMediaState("ready");
    } catch (_e) { setMediaState("none"); }
  }, [incidentId]);

  const loadComments = useCallback(async () => {
    const { data } = await supabase.rpc("incident_comments_list", { p_incident: incidentId, p_limit: 100 });
    setComments((data ?? []) as Comment[]);
  }, [incidentId]);

  useFocusEffect(useCallback(() => { load(); loadComments(); loadMedia(); }, [load, loadComments, loadMedia]));

  async function postComment() {
    const body = draft.trim();
    if (body === "" || posting) return;
    setPosting(true);
    const { error } = await supabase.rpc("post_incident_comment", { p_incident: incidentId, p_body: body });
    setPosting(false);
    if (error) {
      const m = error.message || "";
      const msg = m.includes("commenting_too_fast") ? "Please wait a moment before commenting again."
        : m.includes("comment_too_long") ? "That comment is too long. Keep it under 600 characters."
        : m.includes("empty_comment") ? "Write something first."
        : m || "Your comment was not posted. Please try again.";
      return showAlert({ title: "Not posted", message: msg, tone: "error" });
    }
    setDraft("");
    loadComments();
  }

  function removeComment(c: Comment) {
    showAlert({
      title: "Remove comment",
      message: "Remove your comment from this incident?",
      buttons: [
        { text: "Keep", style: "cancel" },
        {
          text: "Remove", style: "destructive", onPress: async () => {
            await supabase.rpc("remove_incident_comment", { p_id: c.id });
            loadComments();
          },
        },
      ],
    });
  }

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
      message: still
        ? "Thank you. You confirmed this is still happening."
        : "Thank you. You reported this as cleared or not accurate.",
    });
    load();
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={colors.ink} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }
  if (!d) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.floatBackWrap}>
          <Pressable onPress={() => navigation.goBack()} style={styles.floatBack} hitSlop={8}>
            <ArrowLeft size={20} color={colors.ink} strokeWidth={2} />
          </Pressable>
        </View>
        <Text style={styles.gone}>This incident is no longer available.</Text>
      </SafeAreaView>
    );
  }

  const catLabel = d.category_id.replace(/_/g, " ");
  const Icon = riskIcon(d.category_id);
  const steps = stepsFor(d.category_id);
  const metaLine = [
    dist != null ? prettyDistance(dist) : distStatus === "unavailable" ? null : "Calculating distance",
    direction,
    timeAgo(d.created_at),
  ].filter(Boolean).join("  |  ");

  return (
    <View style={styles.safe}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          {mediaState === "ready" && media ? (
            media.isVideo ? (
              <HeroVideo url={media.url} />
            ) : (
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setViewer(media.url)}>
                <Image source={{ uri: media.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              </Pressable>
            )
          ) : mediaState === "loading" ? (
            <ActivityIndicator color={colors.riskHigh} />
          ) : (
            <Icon size={56} color={colors.riskHigh} strokeWidth={1.6} />
          )}
          {mediaState === "none" ? (
            <View style={styles.noMediaTag}>
              <Text style={styles.noMediaText}>No media was supplied</Text>
            </View>
          ) : null}
          <SafeAreaView style={styles.floatBackWrap} edges={["top"]}>
            <Pressable onPress={() => navigation.goBack()} style={styles.floatBack} hitSlop={8}>
              <ArrowLeft size={20} color={colors.ink} strokeWidth={2} />
            </Pressable>
          </SafeAreaView>
        </View>

        <View style={styles.body}>
          <Text style={styles.title}>{catLabel}</Text>
          <Text style={styles.meta}>{metaLine}</Text>
          <Text style={styles.desc}>
            {place
              ? "Reported near " + place + ", " + timeAgo(d.created_at) + "."
              : "Reported " + timeAgo(d.created_at) + "."}
          </Text>

          <View style={styles.divider} />

          <MiniMap lat={d.latitude} lng={d.longitude} places={aiPlaces} />
          <Text style={styles.mapNote}>
            {aiPlaces.length > 0
              ? "Red is the flagged risk. Green are safe places nearby. Tap one to open it in Maps."
              : "Exact flagged location"}
          </Text>

          <View style={styles.sectionHead}>
            <ShieldCheck size={18} color={colors.safe} strokeWidth={2} />
            <Text style={styles.sectionTitle}>Stay safe, do this now</Text>
          </View>

          {adviceStatus === "loading" ? (
            <View style={[styles.card, { flexDirection: "row", alignItems: "center", gap: 10 }]}>
              <ActivityIndicator size="small" color={colors.ink} />
              <Text style={styles.stepText}>Finding safe places nearby</Text>
            </View>
          ) : adviceStatus === "fallback" ? (
            <View style={styles.card}>
              {steps.map((s, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
                  <Text style={styles.stepText}>{s}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.card}>
              {(aiSteps ?? []).map((s, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={styles.stepDot} />
                  <Text style={styles.stepText}>{s}</Text>
                </View>
              ))}
              {aiSources.length > 0 ? (
                <View style={{ marginTop: spacing.sm }}>
                  <Text style={styles.sourcesLabel}>Nearby places via Google Maps</Text>
                  <View style={styles.sourcesRow}>
                    {aiSources.map((src, i) => (
                      <Pressable key={i} onPress={() => src.uri && Linking.openURL(src.uri)} style={styles.sourceChip}>
                        <Text style={styles.sourceChipText} numberOfLines={1}>{src.title}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
              <Text style={styles.aiNote}>
                Generated for your situation. Use your own judgement. This is not official advice.
              </Text>
            </View>
          )}

          <View style={styles.actionPair}>
            <Pressable style={styles.actionGhost} onPress={() => navigation.navigate("Panic")}>
              <Siren size={17} color={colors.riskHigh} strokeWidth={2} />
              <Text style={[styles.actionGhostText, { color: colors.riskHigh }]}>Panic alarm</Text>
            </Pressable>
            <Pressable
              style={styles.actionSolid}
              onPress={() => navigation.navigate("Main", {
                screen: "Map",
                params: { focusLat: d.latitude, focusLng: d.longitude, focusId: d.id },
              })}
            >
              <MapIcon size={17} color={colors.accent} strokeWidth={2} />
              <Text style={styles.actionSolidText}>Open on the map</Text>
            </Pressable>
          </View>

          <View style={styles.divider} />

          <Text style={styles.prompt}>Are you near this? Help others by confirming.</Text>
          <View style={styles.confirmRow}>
            <Pressable style={[styles.confirmBtn, busy && { opacity: 0.6 }]} disabled={busy} onPress={() => confirm(true)}>
              <Check size={17} color={colors.safe} strokeWidth={2.4} />
              <Text style={[styles.confirmText, { color: colors.safe }]}>Still happening</Text>
            </Pressable>
            <Pressable style={[styles.confirmBtn, busy && { opacity: 0.6 }]} disabled={busy} onPress={() => confirm(false)}>
              <X size={17} color={colors.riskHigh} strokeWidth={2.4} />
              <Text style={[styles.confirmText, { color: colors.riskHigh }]}>Cleared</Text>
            </Pressable>
          </View>
          <Text style={styles.tally}>{d.confirms} confirmed  |  {d.disputes} disputed</Text>

          <View style={styles.divider} />

          <Text style={styles.commentsHead}>
            Comments{comments.length > 0 ? " (" + comments.length + ")" : ""}
          </Text>

          {comments.length === 0 ? (
            <View style={styles.commentsEmpty}>
              <MessageSquare size={22} color={colors.textFaint} strokeWidth={1.8} />
              <Text style={styles.commentsEmptyTitle}>No comments yet</Text>
              <Text style={styles.commentsEmptySub}>Be the first to post a comment.</Text>
            </View>
          ) : (
            comments.map((c) => (
              <View key={c.id} style={styles.cRow}>
                <Avatar uri={c.author_avatar} name={c.author_name} id={c.author_id} size={36} />
                <View style={{ flex: 1 }}>
                  <View style={styles.cTop}>
                    <Text style={styles.cName} numberOfLines={1}>{c.author_name}</Text>
                    <Text style={styles.cTime}>{timeAgo(c.created_at)}</Text>
                    {c.is_mine ? (
                      <Pressable onPress={() => removeComment(c)} hitSlop={10}>
                        <Trash2 size={15} color={colors.textMuted} strokeWidth={2} />
                      </Pressable>
                    ) : null}
                  </View>
                  <Text style={styles.cBody}>{c.body}</Text>
                </View>
              </View>
            ))
          )}

          <View style={styles.composer}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Add what you are seeing"
              placeholderTextColor="#8B8F96"
              multiline
              maxLength={600}
              style={styles.cInput}
            />
            <Pressable
              onPress={postComment}
              disabled={posting || draft.trim() === ""}
              style={[styles.cSend, draft.trim() === "" && { opacity: 0.4 }]}
            >
              <Send size={18} color={colors.accent} strokeWidth={2.5} />
            </Pressable>
          </View>
          <Text style={styles.cRule}>
            Say what you can see. Do not name people, and do not post anything you have not
            witnessed yourself.
          </Text>
        </View>
      </ScrollView>

      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable style={styles.viewerWrap} onPress={() => setViewer(null)}>
          {viewer ? <Image source={{ uri: viewer }} style={styles.viewerMedia} resizeMode="contain" /> : null}
          <Text style={[styles.viewerHint, { bottom: insets.bottom + 32 }]}>Tap anywhere to close</Text>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  hero: { height: 240, backgroundColor: "#FBD1CF", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  noMediaTag: {
    position: "absolute", bottom: spacing.md, alignSelf: "center",
    backgroundColor: "rgba(1,1,20,0.62)", borderRadius: radius.pill,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  noMediaText: { ...type.caption, fontWeight: "600", color: "#FFFFFF" },
  viewerWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.94)", alignItems: "center", justifyContent: "center" },
  viewerMedia: { width: "100%", height: "80%" },
  viewerHint: { ...type.caption, color: "rgba(255,255,255,0.6)", position: "absolute" },
  floatBackWrap: { position: "absolute", top: 0, left: spacing.gutter },
  floatBack: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: "#FFFFFF",
    alignItems: "center", justifyContent: "center", marginTop: spacing.md,
  },
  gone: { ...type.body, color: colors.textMuted, textAlign: "center", marginTop: 80 },

  body: { paddingHorizontal: spacing.gutter, paddingTop: spacing.lg },
  title: { ...type.heading, color: colors.ink, textTransform: "capitalize" },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 4 },
  desc: { ...type.label, fontWeight: "400", color: colors.ink, marginTop: spacing.ms, lineHeight: 20 },

  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },

  mapNote: { ...type.caption, color: colors.textMuted, textAlign: "center", marginTop: 6 },

  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.xl, marginBottom: spacing.sm },
  sectionTitle: { fontSize: 16, lineHeight: 20, fontWeight: "700", color: colors.ink },

  card: { backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: spacing.md, gap: spacing.ms },
  stepRow: { flexDirection: "row", gap: spacing.ms, alignItems: "flex-start" },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  stepNumText: { fontSize: 11, lineHeight: 14, fontWeight: "700", color: colors.accent },
  stepDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.ink, marginTop: 7 },
  stepText: { ...type.label, fontWeight: "400", color: colors.ink, flex: 1, lineHeight: 20 },
  sourcesLabel: { ...type.caption, fontWeight: "600", color: colors.textMuted, marginBottom: 6 },
  sourcesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  sourceChip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: colors.bg },
  sourceChipText: { fontSize: 12, lineHeight: 16, fontWeight: "500", color: colors.ink },
  aiNote: { ...type.caption, color: colors.textMuted, marginTop: spacing.sm },

  actionPair: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xl },
  actionGhost: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.riskHigh,
  },
  actionGhostText: { ...type.label, fontWeight: "600" },
  actionSolid: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    height: 52, borderRadius: radius.md, backgroundColor: "#F7F7F7", borderWidth: 1, borderColor: "rgba(20,21,42,0.10)",
  },
  actionSolidText: { ...type.label, fontWeight: "600", color: colors.ink },

  prompt: { ...type.label, fontWeight: "500", color: colors.ink, textAlign: "center", marginBottom: spacing.md },
  confirmRow: { flexDirection: "row", gap: spacing.md },
  confirmBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  confirmText: { ...type.label, fontWeight: "600" },
  tally: { ...type.caption, color: colors.textMuted, textAlign: "center", marginTop: spacing.ms },

  commentsHead: { fontSize: 16, lineHeight: 20, fontWeight: "700", color: colors.ink },
  commentsEmpty: { alignItems: "center", paddingVertical: spacing.xl, gap: 6 },
  commentsEmptyTitle: { ...type.label, fontWeight: "600", color: colors.ink },
  commentsEmptySub: { ...type.caption, color: colors.textMuted, textAlign: "center" },

  cRow: { flexDirection: "row", gap: spacing.ms, paddingVertical: spacing.ms, borderBottomWidth: 1, borderBottomColor: colors.border },
  cTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cName: { ...type.label, fontWeight: "600", color: colors.ink, flex: 1 },
  cTime: { ...type.caption, color: colors.textFaint },
  cBody: { ...type.label, fontWeight: "400", color: colors.ink, lineHeight: 20, marginTop: 3 },

  composer: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, marginTop: spacing.md },
  cInput: {
    flex: 1, minHeight: 48, maxHeight: 120, borderRadius: radius.md, backgroundColor: "#F1F2F5", borderWidth: 1, borderColor: "rgba(20,21,42,0.14)",
    paddingHorizontal: spacing.md, paddingVertical: 12,
    ...type.label, fontWeight: "400", color: colors.ink,
  },
  cSend: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  cRule: { ...type.caption, color: colors.textMuted, lineHeight: 17, marginTop: spacing.sm },
});
