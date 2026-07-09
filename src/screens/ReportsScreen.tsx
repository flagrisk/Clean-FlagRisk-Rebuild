// Reports - "My Reports" (V2 rich + theming). Gradient empty-state chip, lifted cards.
// Shows humanized labels (no raw DB values), a risk band instead of raw score, and an
// evidence badge that appears only when media is attached (tap to view full-screen).
import { useCallback, useState } from "react";
import { FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { ClipboardList, Paperclip, X } from "lucide-react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { supabase } from "../../lib/supabase";
import { showAlert } from "../components/Feedback";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing } from "../theme";
import { humanize, scoreBand } from "../format";

type Report = {
  id: string; category_id: string; occurred_at: string;
  weighted_score: number | null; decision: string | null;
  alert_level: string | null; status: string; media_url: string | null;
};

function isVideo(url: string) {
  return /\.(mp4|mov|m4v|webm|3gp|mkv)(\?|$)/i.test(url);
}

// Full-screen viewer for a single image or video.
function EvidenceViewer({ url, onClose }: { url: string; onClose: () => void }) {
  const video = isVideo(url);
  const player = useVideoPlayer(video ? url : "", (p) => { if (video) { p.loop = false; p.play(); } });
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.viewerWrap}>
        <Pressable style={styles.viewerClose} onPress={onClose} hitSlop={12}>
          <X size={28} color="#ffffff" strokeWidth={2.5} />
        </Pressable>
        {video ? (
          <VideoView style={styles.viewerMedia} player={player} contentFit="contain" allowsFullscreen nativeControls />
        ) : (
          <Image source={{ uri: url }} style={styles.viewerMedia} resizeMode="contain" />
        )}
      </View>
    </Modal>
  );
}

export function ReportsScreen() {
  const { colors, glass, gradients, glow } = useTheme();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<string | null>(null);

  const bandColor = (tone: string) =>
    tone === "high" ? colors.danger : tone === "medium" ? colors.warning : colors.textMuted;

  useFocusEffect(useCallback(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) { setLoading(false); return; }
      const { data } = await supabase
        .from("reports")
        .select("id, category_id, occurred_at, weighted_score, decision, alert_level, status, media_url")
        .eq("reporter_id", uid)
        .order("occurred_at", { ascending: false });
      setReports(data ?? []);
      setLoading(false);
    })();
  }, []));

  async function openEvidence(path: string) {
    const { data, error } = await supabase.storage.from("report-evidence").createSignedUrl(path, 3600);
    if (error || !data) { showAlert({ title: "Could not open", message: "This evidence is unavailable right now." }); return; }
    setViewing(data.signedUrl);
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top"]}>
      <Text style={[styles.header, { color: colors.text }]}>My Reports</Text>

      {!loading && reports.length === 0 ? (
        <View style={styles.empty}>
          <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={[styles.emptyChip, { boxShadow: glow.brand } as any]}>
            <ClipboardList size={30} color={colors.accentText} strokeWidth={2} />
          </LinearGradient>
          <Text style={[styles.emptyText, { color: colors.text }]}>You haven't flagged anything yet.</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>Reports you file will show here with their status.</Text>
        </View>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: spacing.md }}
          renderItem={({ item }) => {
            const band = scoreBand(item.weighted_score);
            return (
              <View style={[styles.card, { backgroundColor: glass.surface, borderColor: glass.stroke, boxShadow: glow.soft } as any]}>
                <View style={styles.cardTop}>
                  <Text style={[styles.cat, { color: colors.text }]}>{humanize(item.category_id)}</Text>
                  {item.media_url ? (
                    <Pressable onPress={() => openEvidence(item.media_url!)} style={[styles.badge, { backgroundColor: colors.accentOn + "22", borderColor: colors.accentOn }]}>
                      <Paperclip size={13} color={colors.accentOn} strokeWidth={2.5} />
                      <Text style={[styles.badgeText, { color: colors.accentOn }]}>Attached</Text>
                    </Pressable>
                  ) : null}
                </View>
                <Text style={[styles.meta, { color: colors.textMuted }]}>{new Date(item.occurred_at).toLocaleString()}</Text>
                <View style={styles.detailRow}>
                  <Text style={[styles.detail, { color: colors.textMuted }]}>Visibility: {humanize(item.alert_level)}</Text>
                  <Text style={[styles.detail, { color: bandColor(band.tone), fontWeight: "700" }]}>Risk: {band.label}</Text>
                </View>
              </View>
            );
          }}
        />
      )}

      {viewing ? <EvidenceViewer url={viewing} onClose={() => setViewing(null)} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { fontSize: 22, fontWeight: "800", textAlign: "center", paddingVertical: spacing.md },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyChip: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  emptyText: { fontSize: 16, fontWeight: "700" },
  emptySub: { fontSize: 14, marginTop: 4, textAlign: "center" },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cat: { fontSize: 17, fontWeight: "700" },
  badge: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: "700" },
  meta: { fontSize: 13, marginTop: 6 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm },
  detail: { fontSize: 13 },
  viewerWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", alignItems: "center", justifyContent: "center" },
  viewerClose: { position: "absolute", top: 50, right: 20, zIndex: 10, width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  viewerMedia: { width: "100%", height: "80%" },
});
