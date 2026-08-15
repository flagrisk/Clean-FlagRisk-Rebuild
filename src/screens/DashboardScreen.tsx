// ============================================================================
// Dashboard - FlagRisk v2.1
// Rebuilt against Figma "Flagrisk v2.1" node 129:21117.
//   canvas #F5F5FA | hero 364 tall, white -> band gradient | tiles 152 sq r16
//   section heads 16/700 + 28px arrow chip | rows white r16, 8 apart
// Data logic is unchanged from the previous build. Presentation only, plus a
// Nearby Risks section fed by incidents_all (same source the map uses).
// ============================================================================
import { useCallback, useState } from "react";
import { LocationConsentCard } from "../components/LocationConsentCard";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import * as Location from "expo-location";
import { supabase } from "../../lib/supabase";
import { showAlert } from "../components/Feedback";
import { useRiskCache } from "../theme/RiskCache";
import { RiskGauge } from "../components/RiskGauge";
import {
  Siren, Bell, ArrowUpRight, ChevronRight, ArrowRight,
  TriangleAlert, ShieldCheck, Car, UserPlus, MapPin,
} from "lucide-react-native";
import { colors, radius, spacing, type, elevation, screenBottomPad } from "../theme";
import { riskIcon } from "../riskIcons";
import { humanize } from "../format";

const CANVAS = "#F5F5FA";
// Measured off the mock at its TRUE bounds: the tile is 608 x 608, square.
// Two earlier attempts measured only the top 60 percent, because the gradient
// passes through the page colour partway down and the detector stopped there.
//
// On the real tile the white edge runs from x 0.83 at the top to x 0.08 at the
// bottom, so the transition line crosses the middle corner to corner. Sampled
// along that line the mock reads:
//   t 0.40 #FFFFFF   t 0.50 #FBFBFB   t 0.60 #F5F5F5
//   t 0.70 #EEEEEE   t 0.80 #E7E7E7   t 0.90 #E0E0E0
// Deliberately deeper than the mock, which measures #DDDDDD at the corner. On a
// handset at everyday brightness that reads as flat, so the corner goes to
// #B0B0B0 and the midpoint follows it down. The diagonal and its position are
// unchanged: white to 45 percent, transition through the middle of the tile.
const TILE_GRAD = ["#FFFFFF", "#FFFFFF", "#DCDCDC", "#B0B0B0"] as const;

// Option A, the tinted wash, one step deeper. The ramp keeps the same shape and
// the same 135 degree axis; it ends 75 percent toward the hue. Ink stays
// readable there at 6.9 to 1 on the alarm and 8.9 on the network, both well
// above the 4.5 that body text needs.
const ALARM_GRAD = ["#FFFFFF", "#FAD2D2", "#F39797", "#EB5757"] as const;
const NETWORK_GRAD = ["#FFFFFF", "#CDEAE7", "#8CD0C8", "#46B3A6"] as const;
const CHIP_BG = "#EBEBEB";

// The radius the score explanation is read at. The card, the drawer and the
// factors line all use this one number so they cannot drift apart.
const RISK_RADIUS_KM = 1;

// The risk card grades continuously with the score: lime at rest, through amber,
// to full red. Three buckets would step; this reads as one ramp, which is what a
// score of 0 to 100 deserves.
// Lime is lifted toward white because at full strength it dominates the card.
// Amber and red stay as they are: a rising score should read as rising, and
// paling the top of the ramp would flatten it.
const TINT_LOW = [0xF0, 0xF7, 0xB5];
const TINT_MID = [0xF2, 0x99, 0x4A];
const TINT_HIGH = [0xEB, 0x57, 0x57];

function mix(a: number[], b: number[], t: number) {
  const v = a.map((c, i) => Math.round(c + (b[i] - c) * t));
  return "#" + v.map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function riskTint(score: number) {
  const s = Math.max(0, Math.min(100, score));
  return s <= 50
    ? mix(TINT_LOW, TINT_MID, s / 50)
    : mix(TINT_MID, TINT_HIGH, (s - 50) / 50);
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  return new Date(iso).toLocaleDateString();
}

function metresBetween(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function distanceLabel(m: number) {
  if (m < 950) return Math.round(m / 10) * 10 + " m away";
  return (m / 1000).toFixed(1) + " km away";
}

function SectionHead({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Pressable onPress={onPress} hitSlop={10} style={styles.sectionChip}>
        <ArrowUpRight size={17} color={colors.ink} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

// The tile takes its own ramp so the alarm and the network can differ. On a
// saturated ground the title, value and badge have to move with it, not just
// the background, or they sit at ink on red and cannot be read.
function Tile({
  title, value, onPress, badge, ramp, onColour,
}: {
  title: string; value: string; onPress: () => void; badge?: number;
  ramp: readonly string[]; onColour?: boolean;
}) {
  const fg = onColour ? "#FFFFFF" : colors.ink;
  return (
    <Pressable onPress={onPress} style={[styles.tileWrap, onColour && styles.tileWrapPlain]}>
      <LinearGradient
        colors={ramp}
        locations={[0, 0.45, 0.7, 1]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.tile}
      >
        <Text style={[styles.tileTitle, { color: fg }]}>{title}</Text>
        <View style={styles.tileFoot}>
          <Text style={[styles.tileValue, { color: fg }]}>{value}</Text>
          <View style={[styles.tileArrow, onColour && { backgroundColor: "rgba(255,255,255,0.94)" }]}>
            <ArrowRight size={20} color={colors.ink} strokeWidth={2} />
          </View>
        </View>
        {badge && badge > 0 ? (
          <View style={[styles.tileBadge, onColour && styles.tileBadgeOnColour]}>
            <Text style={[styles.tileBadgeText, onColour && { color: colors.ink }]}>{badge}</Text>
          </View>
        ) : null}
      </LinearGradient>
    </Pressable>
  );
}

export function DashboardScreen() {
  const navigation = useNavigation<any>();
  const cache = useRiskCache();
  const cp = cache.profile;
  const [name, setName] = useState(cp?.name ? cp.name.trim().split(/\s+/)[0] : "there");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(cp?.avatarUrl ?? null);
  const [score, setScore] = useState<number | null>(cache.score);
  const [band, setBand] = useState<string | null>(cache.band);
  const [coords, setCoords] = useState<string | null>(null);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [activity, setActivity] = useState<{ kind: string; title: string; ref_id: string | null; happened_at: string }[]>([]);
  const [nearby, setNearby] = useState<any[]>([]);
  const [networkCount, setNetworkCount] = useState(0);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [activePanics, setActivePanics] = useState(0);
  const [unread, setUnread] = useState(0);
  const [tier, setTier] = useState<string>(cp?.tier ?? "basic");
  const [hasCustom, setHasCustom] = useState(false);
  const [factors, setFactors] = useState<string[]>([]);

  // The factors come from risk_score_explained, the same function the Risk
  // Summary drawer reads, so the card and the drawer can never disagree.
  const loadFactors = useCallback(async (wkt: string) => {
    try {
      const { data } = await supabase.rpc("risk_score_explained", {
        p_location: wkt, p_radius_km: RISK_RADIUS_KM,
      });
      const list = data && data.factors ? data.factors : [];
      const seen: string[] = [];
      for (const f of list) {
        if (!f || !f.category_id) continue;
        if (seen.indexOf(f.category_id) < 0) seen.push(f.category_id);
        if (seen.length === 3) break;
      }
      setFactors(seen);
    } catch (_e) { setFactors([]); }
  }, []);
  const [fetched, setFetched] = useState(false);
  const [consentVisible, setConsentVisible] = useState(false);
  const loaded = fetched || cache.score != null;

  useFocusEffect(useCallback(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return;
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", uid).eq("is_read", false)
        .then(({ count }) => setUnread(count ?? 0));
      supabase
        .rpc("activity_feed", { p_user: uid, p_limit: 3 })
        .then(({ data: acts }) => { if (acts) setActivity(acts as any); });
      supabase
        .rpc("incidents_all")
        .then(({ data }) => { if (data) setNearby(data as any); });
      const { data: prof } = await supabase
        .from("profiles").select("display_name, current_risk_score, current_risk_band, avatar_url, current_tier, custom_radius_expires_at")
        .eq("id", uid).single();
      if (prof?.display_name) setName(prof.display_name.trim().split(/\s+/)[0]);
      if (prof?.avatar_url) setAvatarUrl(prof.avatar_url);
      else if (u.user?.email) setName(u.user.email.split("@")[0]);
      if (prof?.current_risk_score != null) setScore(Number(prof.current_risk_score));
      if (prof?.current_risk_band) setBand(prof.current_risk_band);
      if (prof?.current_tier) setTier(prof.current_tier);
      setHasCustom(!!prof?.custom_radius_expires_at && new Date(prof.custom_radius_expires_at) > new Date());
      setFetched(true);
      if (prof?.current_risk_score != null && prof?.current_risk_band)
        cache.setRisk(Number(prof.current_risk_score), prof.current_risk_band);
      if (prof) cache.setProfile({
        name: prof.display_name ?? "",
        email: u.user?.email ?? cache.profile?.email ?? "",
        phone: cache.profile?.phone ?? "",
        tier: prof.current_tier ?? "basic",
        avatarUrl: prof.avatar_url ?? null,
      });
      const { count } = await supabase
        .from("network_connections").select("id", { count: "exact", head: true })
        .eq("owner_id", uid);
      setNetworkCount(count ?? 0);
      const { data: inv } = await supabase.rpc("my_incoming_invites");
      setPendingRequests((inv ?? []).length);
      const { data: panics } = await supabase.rpc("my_incoming_panics");
      setActivePanics((panics ?? []).filter((p: any) => p.status === "active").length);
      try {
        const already = await Location.getForegroundPermissionsAsync();
        if (!already.granted) {
          let decided = null;
          try {
            const { data: c } = await supabase.rpc("get_consent", { p_type: "location" });
            decided = c && c.length ? c[0] : null;
          } catch (_e) {}
          if (!decided) { setConsentVisible(true); return; }
        }
        const { status } = already.granted
          ? { status: "granted" }
          : await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const p = await Location.getCurrentPositionAsync({});
          setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
          const wkt = "SRID=4326;POINT(" + p.coords.longitude + " " + p.coords.latitude + ")";
          setCoords(wkt);
          await supabase.rpc("refresh_user_risk_score", { p_user_id: uid, p_location: wkt });
          const { data: refreshed } = await supabase
            .from("profiles").select("current_risk_score, current_risk_band")
            .eq("id", uid).single();
          if (refreshed && refreshed.current_risk_score != null && refreshed.current_risk_band) {
            setScore(Number(refreshed.current_risk_score)); setBand(refreshed.current_risk_band);
            cache.setRisk(Number(refreshed.current_risk_score), refreshed.current_risk_band);
          }
          loadFactors(wkt);
        }
      } catch { /* location optional */ }
    })();
  }, []));

  useFocusEffect(useCallback(() => {
    const REFRESH_MS = 120000;
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        const { data: u } = await supabase.auth.getUser();
        const uid = u.user?.id;
        if (!uid) { running = false; return; }
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== "granted") { running = false; return; }
        const p = await Location.getCurrentPositionAsync({});
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
        const wkt = "SRID=4326;POINT(" + p.coords.longitude + " " + p.coords.latitude + ")";
        setCoords(wkt);
        await supabase.rpc("refresh_user_risk_score", { p_user_id: uid, p_location: wkt });
        const { data: refreshed } = await supabase
          .from("profiles").select("current_risk_score, current_risk_band")
          .eq("id", uid).single();
        if (refreshed && refreshed.current_risk_score != null && refreshed.current_risk_band) {
          setScore(Number(refreshed.current_risk_score)); setBand(refreshed.current_risk_band);
          cache.setRisk(Number(refreshed.current_risk_score), refreshed.current_risk_band);
        }
        loadFactors(wkt);
      } catch { /* skip this tick */ }
      running = false;
    };
    const id = setInterval(tick, REFRESH_MS);
    return () => clearInterval(id);
  }, []));

  const bandKey = (band ?? "low").toLowerCase();
  const heroTint = loaded ? riskTint(score ?? 0) : "#EDEDED";

  const heroLine =
    !loaded ? "Reading the risk around you."
      : bandKey === "high" ? "Your area has elevated community reported risks."
      : bandKey === "medium" ? "There is some reported activity around you."
      : "No significant reported activity around you right now.";

  // Nearby Risks answers one question: what is around me right now. A risk 200 km
  // away is not that, whatever the plan allows, so this list is capped at 10 km
  // for everyone. The cap never widens a plan: a Basic account still stops at its
  // own 5 km. Plan reach continues to govern everywhere else, the map, alerting
  // and the tier notice included.
  const NEARBY_CAP_KM = 10;
  const planKm =
    tier === "premium" ? 500 : tier === "pro" ? 50 : tier === "standard" ? 15 : 5;
  const reachKm = Math.min(planKm, NEARBY_CAP_KM);

  const nearest = pos
    ? nearby
      .filter((i) => i.latitude != null && i.longitude != null)
      .map((i) => ({ ...i, _m: metresBetween(pos.lat, pos.lng, i.latitude, i.longitude) }))
      .filter((i) => i._m <= reachKm * 1000)
      .sort((a, b) => a._m - b._m)
      .slice(0, 2)
    : [];

  return (
    <View style={styles.root}>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.hello} numberOfLines={1}>Hi, {name}</Text>
            </View>
            <Pressable onPress={() => navigation.navigate("Inbox")} style={styles.headBtn} hitSlop={8}>
              <Bell size={19} color={colors.ink} strokeWidth={2} />
              {unread > 0 ? <View style={styles.headPip} /> : null}
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate("TripWatch")}
              style={styles.tripBtn}
              hitSlop={8}
            >
              <Car size={17} color={colors.ink} strokeWidth={2} />
              <Text style={styles.tripText}>Trip Watch</Text>
            </Pressable>
          </View>

          <View style={styles.heroWrap}>
            <LinearGradient
              colors={["#FFFFFF", heroTint]}
              start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
              style={styles.hero}
            >
              <View style={styles.heroHead}>
                <Text style={styles.heroLabel}>Your risk level</Text>
                <Pressable style={styles.livePill} onPress={() => navigation.navigate("Map")}>
                  <Text style={styles.livePillText}>LIVE MAP</Text>
                  <ChevronRight size={14} color={colors.ink} strokeWidth={2.4} />
                </Pressable>
              </View>

              <Pressable
                onPress={() => coords && navigation.navigate("RiskBreakdown", { location: coords, radiusKm: RISK_RADIUS_KM })}
                style={{ alignItems: "center" }}
              >
                <RiskGauge score={score ?? 0} size={228} showLabel={loaded} />
                <Text style={styles.heroLine}>{heroLine}</Text>
                {factors.length > 0 ? (
                  <Text style={styles.heroFactors} numberOfLines={2}>
                    Factors: {factors.map((f) => humanize(f)).join(", ")}
                  </Text>
                ) : null}
              </Pressable>
            </LinearGradient>
          </View>

          <View style={styles.tileRow}>
            <Tile
              title={"Emergency\nAlarm"}
              value={String(activePanics)}
              badge={activePanics}
              onPress={() => navigation.navigate("Panic")}
              ramp={ALARM_GRAD}
            />
            <Tile
              title={"Network\nMembers"}
              value={networkCount + " of 7"}
              badge={pendingRequests}
              onPress={() => navigation.navigate("Network")}
              ramp={NETWORK_GRAD}
            />
          </View>

          <SectionHead title="Nearby Risks" onPress={() => navigation.navigate("Map")} />
          {nearest.length === 0 ? (
            <View style={styles.card}>
              <View style={[styles.rowIcon, { backgroundColor: CHIP_BG }]}>
                <ShieldCheck size={18} color={colors.safe} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Nothing reported nearby</Text>
                <Text style={styles.rowSub}>Risks flagged around you will appear here.</Text>
              </View>
            </View>
          ) : (
            nearest.map((i) => (
              <Pressable
                key={i.id}
                onPress={() => navigation.navigate("IncidentDetail", { incidentId: i.id })}
                style={styles.card}
              >
                <View style={[styles.rowIcon, { backgroundColor: CHIP_BG }]}>
                  {(() => {
                    const RIcon = riskIcon(i.category_id);
                    return (
                      <RIcon
                        size={18}
                        strokeWidth={2}
                        color={i.severity === "critical" || i.severity === "high" ? colors.riskHigh
                          : i.severity === "moderate" ? colors.riskMedium : colors.textMuted}
                      />
                    );
                  })()}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {String(i.category_id ?? "Incident").replace(/_/g, " ")}
                  </Text>
                  <Text style={styles.rowSub}>{distanceLabel(i._m)}</Text>
                </View>
              </Pressable>
            ))
          )}

          <SectionHead title="Activity Tracker" onPress={() => navigation.navigate("Inbox")} />
          {activity.length === 0 ? (
            <View style={styles.card}>
              <View style={[styles.rowIcon, { backgroundColor: CHIP_BG }]}>
                <MapPin size={18} color={colors.textMuted} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>No activity yet</Text>
                <Text style={styles.rowSub}>Check-ins, reports and alerts will appear here.</Text>
              </View>
            </View>
          ) : (
            activity.map((a, i) => {
              const Icon =
                a.kind === "alarm_fired" ? Siren
                  : a.kind === "risk_flagged" ? TriangleAlert
                  : a.kind === "network_added" ? UserPlus
                  : Car;
              const tone = a.kind === "alarm_fired" ? colors.riskHigh : colors.ink;
              const tappable = a.kind === "risk_flagged" && a.ref_id;
              const Row = (
                <>
                  <View style={[styles.rowIcon, { backgroundColor: CHIP_BG }]}>
                    <Icon size={18} color={tone} strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{a.title}</Text>
                    <Text style={styles.rowSub}>{timeAgo(a.happened_at)}</Text>
                  </View>
                </>
              );
              return tappable ? (
                <Pressable key={i} style={styles.card} onPress={() => navigation.navigate("IncidentDetail", { incidentId: a.ref_id })}>
                  {Row}
                </Pressable>
              ) : (
                <View key={i} style={styles.card}>{Row}</View>
              );
            })
          )}

        </ScrollView>
        <LocationConsentCard
          visible={consentVisible}
          onDone={() => { setConsentVisible(false); setFetched(false); }}
          title="Share your location"
          body="FlagRisk uses your location to score the risk around you and to show nearby reports."
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: CANVAS },
  scroll: { paddingHorizontal: spacing.gutter, paddingBottom: screenBottomPad },

  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingTop: spacing.sm, marginBottom: spacing.md },
  hello: { ...type.subheading, color: colors.inkDeep },
  headBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "#FEFEFE",
    alignItems: "center", justifyContent: "center", ...elevation.hairline,
  },
  headPip: { position: "absolute", top: 9, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.riskHigh },
  tripBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    height: 40, borderRadius: 20, backgroundColor: "#FEFEFE",
    paddingHorizontal: 14, ...elevation.hairline,
  },
  tripText: { fontSize: 13, lineHeight: 17, fontWeight: "600", color: colors.ink },

  heroWrap: { borderRadius: radius.xl, overflow: "hidden", marginBottom: spacing.md, ...elevation.card },
  hero: { paddingTop: spacing.md, paddingBottom: spacing.lg, paddingHorizontal: spacing.md },
  heroHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  heroLabel: { fontSize: 16, lineHeight: 20, fontWeight: "600", color: colors.ink },
  livePill: {
    flexDirection: "row", alignItems: "center", gap: 2,
    borderRadius: radius.pill, borderWidth: 1, borderColor: "rgba(20,21,42,0.22)",
    paddingLeft: 12, paddingRight: 6, paddingVertical: 6, backgroundColor: "rgba(255,255,255,0.55)",
  },
  livePillText: { fontSize: 12, lineHeight: 16, fontWeight: "700", color: colors.ink, letterSpacing: 0.4 },
  heroLine: { ...type.caption, color: colors.ink, textAlign: "center", marginTop: 4, maxWidth: 250 },
  heroFactors: {
    ...type.caption, fontWeight: "600", color: colors.ink,
    textAlign: "center", marginTop: 6, maxWidth: 260,
  },

  tileRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.xs },
  // The tile starts white and the canvas is #F5F5FA, so without an edge the top
  // left corner dissolves into the page. A hairline defines it without weight.
  tileWrap: {
    flex: 1, borderRadius: radius.lg, overflow: "hidden",
    borderWidth: 1, borderColor: "rgba(20,21,42,0.10)",
    ...elevation.card,
  },
  tile: { height: 168, padding: spacing.md, justifyContent: "space-between" },
  tileTitle: { ...type.subheading, color: colors.ink, lineHeight: 23 },
  tileFoot: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  tileValue: { fontSize: 22, lineHeight: 28, fontWeight: "500", color: colors.ink },
  tileArrow: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: "#FFFFFF",
    alignItems: "center", justifyContent: "center", ...elevation.hairline,
  },
  tileBadge: {
    position: "absolute", top: 12, right: 44, minWidth: 22, height: 22, borderRadius: 11,
    paddingHorizontal: 6, alignItems: "center", justifyContent: "center", backgroundColor: colors.riskHigh,
  },
  tileBadgeText: { ...type.micro, color: "#FFFFFF", fontWeight: "700" },
  tileWrapPlain: { borderWidth: 0 },
  tileBadgeOnColour: { backgroundColor: "#FFFFFF" },

  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 28, marginTop: spacing.lg, marginBottom: spacing.sm },
  sectionTitle: { fontSize: 16, lineHeight: 20, fontWeight: "700", color: colors.ink },
  sectionChip: { width: 28, height: 28, borderRadius: 14, backgroundColor: CHIP_BG, alignItems: "center", justifyContent: "center" },

  card: {
    flexDirection: "row", alignItems: "center", gap: spacing.ms,
    backgroundColor: colors.bg, borderRadius: radius.md,
    paddingVertical: spacing.md, paddingHorizontal: spacing.md,
    marginBottom: spacing.sm, ...elevation.hairline,
  },
  rowIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  rowTitle: { ...type.label, color: colors.ink, textTransform: "capitalize" },
  rowSub: { ...type.caption, color: colors.textMuted, marginTop: 2 },
});










