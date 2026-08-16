// ============================================================================
// Reports - FlagRisk v2.1
// Rebuilt against Figma "Reports" (node 1:2713) and the 4.0 Reports flow.
//   header: 36pt round back | title 20/700 centred | 36pt #F0F0F0 round right
//   search 327x42 r16 #FAFAFA | day group label 12/600 | rows with 48pt tile
// Thumbnails are category tiles rather than the evidence image: rendering the
// real media would need one signed-URL round trip per row. The Attached badge
// still opens the full-screen viewer on demand.
// ============================================================================
import { useCallback, useMemo, useState } from "react";
import { Image, Modal, Pressable, SectionList, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import {
  ArrowLeft, EllipsisVertical, Search, Paperclip, X, TriangleAlert,
  ArrowDownUp, Check, Image as ImageIcon,
} from "lucide-react-native";
import { riskIcon } from "../riskIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVideoPlayer, VideoView } from "expo-video";
import { supabase } from "../../lib/supabase";
import { showAlert } from "../components/Feedback";
import { colors, radius, spacing, type, elevation, screenBottomPad } from "../theme";
import { humanize, scoreBand } from "../format";

type Report = {
  id: string; category_id: string; occurred_at: string;
  weighted_score: number | null; decision: string | null;
  alert_level: string | null; status: string; media_url: string | null;
};

function isVideo(url: string) {
  return /\.(mp4|mov|m4v|webm|3gp|mkv)(\?|$)/i.test(url);
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

// The player is split out so it is only created with a real video source.
// useVideoPlayer("") throws, and a photograph opened here would have hit it.
function VideoPane({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => { p.loop = false; p.play(); });
  return <VideoView style={styles.viewerMedia} player={player} contentFit="contain" allowsFullscreen nativeControls />;
}

function EvidenceViewer({ url, onClose }: { url: string; onClose: () => void }) {
  const video = isVideo(url);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.viewerWrap}>
        <Pressable style={styles.viewerClose} onPress={onClose} hitSlop={12}>
          <X size={28} color="#FFFFFF" strokeWidth={2.5} />
        </Pressable>
        {video ? (
          <VideoPane url={url} />
        ) : (
          <Image source={{ uri: url }} style={styles.viewerMedia} resizeMode="contain" />
        )}
      </View>
    </Modal>
  );
}

export function ReportsScreen() {
  const navigation = useNavigation<any>();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<Report | null>(null);
  const [detailMedia, setDetailMedia] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [newestFirst, setNewestFirst] = useState(true);
  const [onlyEvidence, setOnlyEvidence] = useState(false);
  const insets = useSafeAreaInsets();

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

  async function openDetail(r: Report) {
    setDetail(r);
    setDetailMedia(null);
    if (!r.media_url) return;
    const { data } = await supabase.storage.from("report-evidence").createSignedUrl(r.media_url, 3600);
    if (data) setDetailMedia(data.signedUrl);
  }

  async function openEvidence(path: string) {
    const { data, error } = await supabase.storage.from("report-evidence").createSignedUrl(path, 3600);
    if (error || !data) {
      showAlert({ title: "Could not open", message: "This evidence is unavailable right now." });
      return;
    }
    setViewing(data.signedUrl);
  }

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    let filtered = q
      ? reports.filter((r) => humanize(r.category_id).toLowerCase().includes(q))
      : reports.slice();
    if (onlyEvidence) filtered = filtered.filter((r) => !!r.media_url);
    filtered.sort((a, b) => {
      const d = new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime();
      return newestFirst ? d : -d;
    });
    const groups: Record<string, Report[]> = {};
    const order: string[] = [];
    filtered.forEach((r) => {
      const k = dayLabel(r.occurred_at);
      if (!groups[k]) { groups[k] = []; order.push(k); }
      groups[k].push(r);
    });
    return order.map((k) => ({ title: k, data: groups[k] }));
  }, [reports, query, newestFirst, onlyEvidence]);

  const chipFor = (tone: string) =>
    tone === "high"
      ? { bg: "#FBD1CF", fg: colors.riskHigh, label: "High Risk" }
      : tone === "medium"
      ? { bg: "#FDE7CF", fg: "#B26A12", label: "Medium" }
      : { bg: "#EBEBEB", fg: colors.textMuted, label: "Low" };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtnPlain} hitSlop={8}>
          <ArrowLeft size={20} color={colors.ink} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headTitle}>Reports</Text>
        <Pressable onPress={() => setMenuOpen(true)} style={styles.headBtnFilled} hitSlop={8}>
          <EllipsisVertical size={18} color={colors.ink} strokeWidth={2} />
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
            {query ? "Nothing matches that search" : "No risks reported"}
          </Text>
          <Text style={styles.emptySub}>
            {query
              ? "Try a different word."
              : "You have not reported any incidents yet. Help keep your community informed by reporting hazards around you."}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(r) => r.id}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          renderSectionHeader={({ section }) => (
            <Text style={styles.dayLabel}>{section.title}</Text>
          )}
          renderItem={({ item }) => {
            const band = scoreBand(item.weighted_score);
            const chip = chipFor(band.tone);
            const Icon = riskIcon(item.category_id);
            return (
              <Pressable style={styles.row} onPress={() => openDetail(item)}>
                <View style={styles.thumb}>
                  <Icon size={20} color={chip.fg} strokeWidth={2} />
                </View>
                {/* The time joins the title row rather than holding a lane down
                    the right, so the line beneath runs the full width instead
                    of truncating against empty space. */}
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{humanize(item.category_id)}</Text>
                    <View style={[styles.chip, { backgroundColor: chip.bg }]}>
                      <Text style={[styles.chipText, { color: chip.fg }]}>{chip.label}</Text>
                    </View>
                    <View style={{ flex: 1 }} />
                    <Text style={styles.rowTime}>{timeAgo(item.occurred_at)}</Text>
                  </View>
                  <Text style={styles.rowSub} numberOfLines={2}>
                    Visibility: {humanize(item.alert_level) || "On the map"}
                  </Text>
                  {item.media_url ? (
                    <View style={styles.attachRow}>
                      <Paperclip size={12} color={colors.textMuted} strokeWidth={2} />
                      <Text style={styles.attachText}>Evidence attached</Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <Modal visible={!!detail} transparent animationType="slide" onRequestClose={() => setDetail(null)}>
        <Pressable style={styles.backdrop} onPress={() => setDetail(null)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} onPress={() => {}}>
            <View style={styles.grabber} />
            {detail ? (() => {
              const band = scoreBand(detail.weighted_score);
              const chip = chipFor(band.tone);
              const pct = Math.round(Math.max(0, Math.min(1, Number(detail.weighted_score ?? 0))) * 100);
              const Icon = riskIcon(detail.category_id);
              return (
                <>
                  {detailMedia ? (
                    <Pressable onPress={() => { setViewing(detailMedia); }}>
                      <Image source={{ uri: detailMedia }} style={styles.detMedia} resizeMode="cover" />
                    </Pressable>
                  ) : (
                    <View style={[styles.detMedia, styles.detMediaEmpty]}>
                      <Icon size={30} color={colors.textFaint} strokeWidth={1.8} />
                      <Text style={styles.detNoMedia}>No evidence attached</Text>
                    </View>
                  )}

                  <View style={styles.detHead}>
                    <Text style={styles.detTitle} numberOfLines={1}>{humanize(detail.category_id)}</Text>
                    <Text style={styles.detPct}>{pct}%</Text>
                  </View>
                  <Text style={styles.detMeta}>
                    {timeAgo(detail.occurred_at)}  |  {humanize(detail.alert_level) || "On the map"}
                  </Text>

                  <Text style={styles.detBody}>
                    You reported {humanize(detail.category_id).toLowerCase()} {timeAgo(detail.occurred_at)}.
                    This is the weight the engine gave it, after your standing, how precise the location
                    was, and how severe the category is.
                  </Text>

                  <View style={styles.detTrack}>
                    <View style={[styles.detFill, { width: pct + "%", backgroundColor: chip.fg }]} />
                  </View>
                  <Text style={styles.detNote}>
                    Counts at {pct} percent now, fading as it ages.
                  </Text>
                </>
              );
            })() : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={menuOpen} transparent animationType="slide" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} onPress={() => {}}>
            <View style={styles.grabber} />
            <Text style={styles.menuTitle}>Sort and filter</Text>
            <Pressable style={styles.menuRow} onPress={() => setNewestFirst((v) => !v)}>
              <ArrowDownUp size={19} color={colors.ink} strokeWidth={2} />
              <Text style={styles.menuText}>{newestFirst ? "Newest first" : "Oldest first"}</Text>
              <Check size={17} color={colors.ink} strokeWidth={2.4} />
            </Pressable>
            <Pressable style={styles.menuRow} onPress={() => setOnlyEvidence((v) => !v)}>
              <ImageIcon size={19} color={colors.ink} strokeWidth={2} />
              <Text style={styles.menuText}>Only reports with evidence</Text>
              {onlyEvidence ? <Check size={17} color={colors.ink} strokeWidth={2.4} /> : null}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {viewing ? <EvidenceViewer url={viewing} onClose={() => setViewing(null)} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  header: {
    height: 36, flexDirection: "row", alignItems: "center",
    marginHorizontal: spacing.gutter, marginTop: spacing.md,
  },
  headBtnPlain: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headBtnFilled: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: "#F0F0F0",
    alignItems: "center", justifyContent: "center",
  },
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
    paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  thumb: {
    width: 48, height: 48, borderRadius: radius.sm, backgroundColor: "#F0F0F0",
    alignItems: "center", justifyContent: "center",
  },
  rowTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowTitle: { ...type.label, fontWeight: "600", color: colors.ink, flexShrink: 1 },
  chip: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  chipText: { fontSize: 10, lineHeight: 14, fontWeight: "600" },
  rowSub: { ...type.caption, color: colors.textMuted, marginTop: 3 },
  attachRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  attachText: { ...type.caption, color: colors.textMuted },
  rowTime: { ...type.caption, color: colors.textFaint },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl },
  emptyTitle: { ...type.subheading, color: colors.ink },
  emptySub: { ...type.caption, color: colors.textMuted, textAlign: "center", marginTop: 6, lineHeight: 18 },

  backdrop: { flex: 1, backgroundColor: "rgba(1,1,20,0.30)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#FFFFFF", borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.gutter, paddingTop: spacing.sm,
  },
  grabber: { alignSelf: "center", width: 44, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: spacing.md },
  detMedia: { width: "100%", height: 200, borderRadius: radius.md, backgroundColor: "#F0F0F0" },
  detMediaEmpty: { alignItems: "center", justifyContent: "center", gap: 8 },
  detNoMedia: { ...type.caption, color: colors.textMuted },
  detHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md },
  detTitle: { ...type.heading, color: colors.ink, flex: 1 },
  detPct: { ...type.heading, color: colors.ink },
  detMeta: { ...type.caption, color: colors.textMuted, marginTop: 4 },
  detBody: { ...type.label, fontWeight: "400", color: colors.ink, lineHeight: 21, marginTop: spacing.md },
  detTrack: { height: 8, borderRadius: 4, backgroundColor: "#EBEBEB", marginTop: spacing.md, overflow: "hidden" },
  detFill: { height: 8, borderRadius: 4 },
  detNote: { ...type.caption, color: colors.textMuted, marginTop: 8 },

  menuTitle: { ...type.subheading, color: colors.ink, marginBottom: spacing.sm },
  menuRow: { flexDirection: "row", alignItems: "center", gap: spacing.ms, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  menuText: { flex: 1, ...type.label, fontWeight: "500", color: colors.ink },

  viewerWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", alignItems: "center", justifyContent: "center" },
  viewerClose: { position: "absolute", top: 50, right: 20, zIndex: 10, width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  viewerMedia: { width: "100%", height: "80%" },
});




