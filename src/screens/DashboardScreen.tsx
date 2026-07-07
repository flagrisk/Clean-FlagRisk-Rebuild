// Dashboard (V2 + theming). Last-known risk preloaded at startup (no flash).
import { useCallback, useState } from "react";
import { LocationConsentCard } from "../components/LocationConsentCard";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import * as Location from "expo-location";
import { supabase } from "../../lib/supabase";
import { useRiskCache } from "../theme/RiskCache";
import { RiskGauge } from "../components/RiskGauge";
import { GlassCard } from "../components/GlassCard";
import { GlowChip } from "../components/GlowChip";
import { ShieldAlert, Siren, UsersRound, MapPin, UserPlus, Bell } from "lucide-react-native";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing } from "../theme";

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}
export function DashboardScreen() {
  const navigation = useNavigation();
  const { colors, gradients, glow, mode } = useTheme();
  const light = mode === "light";
  const cache = useRiskCache();
  const cp = cache.profile;
  const [name, setName] = useState(cp?.name ? cp.name : "there");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(cp?.avatarUrl ?? null);
  const [tier, setTier] = useState(cp?.tier ?? "basic");
  const [score, setScore] = useState<number | null>(cache.score);
  const [band, setBand] = useState<string | null>(cache.band);
  const [coords, setCoords] = useState<string | null>(null);
  const [inbox, setInbox] = useState<{ id: string; kind: string; title: string; is_read: boolean; created_at: string }[]>([]);
  const [activity, setActivity] = useState<{ kind: string; title: string; ref_id: string | null; happened_at: string }[]>([]);
  const [networkCount, setNetworkCount] = useState(0);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [activePanics, setActivePanics] = useState(0);
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
        .select("id, kind, title, is_read, created_at")
        .eq("recipient_id", uid)
        .order("created_at", { ascending: false })
        .limit(1)
        .then(({ data: notes }) => { if (notes) setInbox(notes as any); });
      supabase
        .rpc("activity_feed", { p_user: uid, p_limit: 3 })
        .then(({ data: acts }) => { if (acts) setActivity(acts as any); });
      const { data: prof } = await supabase
        .from("profiles").select("display_name, current_risk_score, current_risk_band, avatar_url, current_tier")
        .eq("id", uid).single();
      if (prof?.display_name) setName(prof.display_name);
      if (prof?.avatar_url) setAvatarUrl(prof.avatar_url);
      if (prof?.current_tier) setTier(prof.current_tier);
      else if (u.user?.email) setName(u.user.email.split("@")[0]);
      if (prof?.current_risk_score != null) setScore(Number(prof.current_risk_score));
      if (prof?.current_risk_band) setBand(prof.current_risk_band);
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
        // Gate the cold OS prompt behind our consent card.
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
          const pos = await Location.getCurrentPositionAsync({});
          setCoords("SRID=4326;POINT(" + pos.coords.longitude + " " + pos.coords.latitude + ")");
          await supabase.rpc("refresh_user_risk_score", {
            p_user_id: uid,
            p_location: "SRID=4326;POINT(" + pos.coords.longitude + " " + pos.coords.latitude + ")",
          });
          const { data: refreshed } = await supabase
            .from("profiles").select("current_risk_score, current_risk_band")
            .eq("id", uid).single();
          if (refreshed && refreshed.current_risk_score != null && refreshed.current_risk_band) {
            setScore(Number(refreshed.current_risk_score)); setBand(refreshed.current_risk_band);
            cache.setRisk(Number(refreshed.current_risk_score), refreshed.current_risk_band);
          }
        }
      } catch { /* location optional */ }
    })();
  }, []));

  // Foreground live refresh: recompute the location-based risk score every 2
  // minutes while the dashboard is focused. Stops on blur/unmount so we do not
  // burn GPS or battery when the screen is not visible.
  useFocusEffect(useCallback(() => {
    const REFRESH_MS = 120000; // 2 minutes
    let running = false;       // guard against overlapping ticks
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        const { data: u } = await supabase.auth.getUser();
        const uid = u.user?.id;
        if (!uid) { running = false; return; }
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== "granted") { running = false; return; }
        const pos = await Location.getCurrentPositionAsync({});
        setCoords("SRID=4326;POINT(" + pos.coords.longitude + " " + pos.coords.latitude + ")");
        await supabase.rpc("refresh_user_risk_score", {
          p_user_id: uid,
          p_location: "SRID=4326;POINT(" + pos.coords.longitude + " " + pos.coords.latitude + ")",
        });
        const { data: refreshed } = await supabase
          .from("profiles").select("current_risk_score, current_risk_band")
          .eq("id", uid).single();
        if (refreshed && refreshed.current_risk_score != null && refreshed.current_risk_band) {
          setScore(Number(refreshed.current_risk_score)); setBand(refreshed.current_risk_band);
          cache.setRisk(Number(refreshed.current_risk_score), refreshed.current_risk_band);
        }
      } catch { /* skip this tick */ }
      running = false;
    };
    const id = setInterval(tick, REFRESH_MS);
    return () => clearInterval(id);
  }, []));

  const bandKey = (band ?? "low").toLowerCase();
  const heroColors = !loaded
    ? (["#9aa0aa", "#7c828c"] as const)
    : bandKey === "high" ? gradients.heroHigh : bandKey === "medium" ? gradients.heroMedium : gradients.heroLow;
  const bandColor = !loaded
    ? "#9aa0aa"
    : bandKey === "high" ? colors.riskHigh : bandKey === "medium" ? colors.riskMedium : colors.riskLow;
  const bandWord = (band ?? "").charAt(0).toUpperCase() + (band ?? "").slice(1);
  const bgGradient = light ? ["#ffffff", "#eceef3"] as const : ["#15171b", "#0a0b0d"] as const;
  const scoreTile =
    bandKey === "high" ? gradients.tileScoreHigh : bandKey === "medium" ? gradients.tileScoreMedium : gradients.tileScoreLow;

  const Tile = ({ grad, children, style, onPress }: any) => {
    if (light) {
      const content = (
        <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.tile, style]}>
          {children}
        </LinearGradient>
      );
      if (onPress) {
        return (
          <Pressable onPress={onPress} style={style} android_ripple={{ color: "rgba(255,255,255,0.18)" }}>
            {content}
          </Pressable>
        );
      }
      return content;
    }
    return <GlassCard style={style} onPress={onPress}>{children}</GlassCard>;
  };

  const tileText = light ? "#ffffff" : colors.text;
  const tileSub = light ? "rgba(255,255,255,0.78)" : colors.textMuted;
  const tileChipColor = (semantic: string) => (light ? "#ffffff" : semantic);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <LinearGradient colors={bgGradient} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Pressable onPress={() => navigation.navigate("Profile" as never)}><LinearGradient colors={gradients.brand} style={styles.avatarRing}>
              <View style={[styles.avatarInner, { backgroundColor: colors.bgElevated, overflow: "hidden" }]}>{avatarUrl ? <Image source={{ uri: avatarUrl }} style={{ width: "100%", height: "100%" }} /> : null}</View>
            </LinearGradient></Pressable>
            <View style={{ flex: 1 }}>
              <Text style={[styles.hello, { color: colors.text }]}>Hello, {name}</Text>
              <Text style={[styles.plan, { color: colors.textMuted }]}>{tier.charAt(0).toUpperCase() + tier.slice(1)} Plan  -  <Text style={{ color: colors.accentOn, fontWeight: "700" }} onPress={() => navigation.navigate("PlanPricing" as never)}>{tier === "premium" ? "Add Coverage" : "Upgrade"}</Text></Text>
            </View>
            <Text style={[styles.signOut, { color: colors.textMuted }]} onPress={() => supabase.auth.signOut({ scope: "local" })}>Sign out</Text>
          </View>

          <LinearGradient colors={heroColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={[styles.hero, { borderColor: light ? "transparent" : colors.border }, light && { boxShadow: "0px 10px 26px rgba(229,72,77,0.30)" } as any]}>
            <View style={styles.heroTop}>
              <Text style={[styles.heroTitle, { color: light ? "#ffffff" : colors.text }]}>
                Risk status: <Text style={{ color: light ? "#ffffff" : bandColor, fontWeight: "800" }}>{loaded ? bandWord : "Checking..."}</Text>
              </Text>
              <Text style={[styles.heroScore, { color: light ? "#ffffff" : colors.text }]}>{loaded && score != null ? Math.round(score) : "--"}</Text>
              <View style={[styles.dot, { backgroundColor: light ? "#ffffff" : bandColor }]} />
            </View>
            <Text style={[styles.heroSub, { color: light ? "rgba(255,255,255,0.82)" : colors.textMuted }]}>Safety you share with the people you trust.</Text>
          </LinearGradient>

          <View style={styles.row}>
            <Tile grad={scoreTile} style={styles.cardLarge} onPress={() => coords && navigation.navigate("RiskBreakdown" as never, { location: coords, radiusKm: 1 } as never)}>
              <View style={styles.cardLabel}>
                <Text style={[styles.cardTitle, { color: tileText }]}>Risk Score</Text>
                <GlowChip color={tileChipColor(colors.accent)} icon={ShieldAlert} />
              </View>
              <View style={{ alignItems: "center", marginTop: spacing.sm }}>
                <RiskGauge score={score ?? 0} size={145} onTile={light} />
              </View>
              <Text style={[styles.tileNote, { color: tileSub }]}>How risky your current location is right now. Tap for details</Text>
            </Tile>

            <View style={{ flex: 1.3, gap: spacing.md }}>
              <Tile grad={gradients.tileAlarm} style={{ flex: 1, position: "relative" }} onPress={() => navigation.navigate("PanicInbox" as never)}>
                <View style={styles.cardLabel}>
                  <Text style={[styles.cardTitle, { color: tileText }]}>Alarm</Text>
                  <GlowChip color={tileChipColor(colors.danger)} icon={Siren} />
                </View>
                <Text style={[styles.bigStat, { color: light ? "#ffffff" : colors.danger }]}>{activePanics}</Text>
                <Text style={[styles.stat, { color: tileSub }]}>{activePanics > 0 ? (activePanics === 1 ? "active alarm" : "active alarms") : "View alarms"}</Text>
                {activePanics > 0 && (
                  <View style={[styles.reqBadge, { backgroundColor: colors.danger }]}>
                    <Text style={styles.reqBadgeText}>{activePanics}</Text>
                  </View>
                )}
              </Tile>

              <Tile grad={gradients.tileNetwork} style={{ flex: 1, position: "relative" }} onPress={() => navigation.navigate("Network" as never)}>
                <View style={styles.cardLabel}>
                  <Text style={[styles.cardTitle, { color: tileText }]}>Network</Text>
                  <GlowChip color={tileChipColor(colors.accentSecondary)} icon={UsersRound} />
                </View>
                <Text style={[styles.bigStat, { color: light ? "#ffffff" : colors.safe }]}>{networkCount}</Text>
                <Text style={[styles.stat, { color: tileSub }]}>{networkCount === 1 ? "member" : "members"}</Text>
                {pendingRequests > 0 && (
                  <View style={[styles.reqBadge, { backgroundColor: colors.danger }]}>
                    <Text style={styles.reqBadgeText}>{pendingRequests}</Text>
                  </View>
                )}
              </Tile>
            </View>
          </View>

          <GlassCard style={{ marginTop: spacing.md }}>
            <Pressable onPress={() => navigation.navigate("Inbox" as never)}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Inbox</Text>
              {inbox.length === 0 ? (
                <Text style={[styles.empty, { color: colors.textMuted }]}>No alerts yet. Flagged risks and network alerts will appear here.</Text>
              ) : (
                inbox.map((n) => {
                  const Icon = n.kind === "panic" ? Siren : n.kind === "network_flag" ? UsersRound : n.kind === "incident_nearby" ? MapPin : n.kind === "network_invite" ? UserPlus : Bell;
                  const tone = n.kind === "panic" ? colors.danger : colors.accentOn;
                  return (
                    <View key={n.id} style={styles.inboxRow}>
                      <Icon size={18} color={tone} strokeWidth={2} />
                      <Text style={[styles.inboxTitle, { color: colors.text }]} numberOfLines={1}>{n.title}</Text>
                      <Text style={[styles.inboxTime, { color: colors.textFaint }]}>{timeAgo(n.created_at)}</Text>
                      {!n.is_read && <View style={[styles.inboxPip, { backgroundColor: tone }]} />}
                    </View>
                  );
                })
              )}
            </Pressable>
          </GlassCard>

          <GlassCard style={{ marginTop: spacing.md }}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Activity Tracker</Text>
            {activity.length === 0 ? (
              <Text style={[styles.empty, { color: colors.textMuted }]}>Your recent activity will show here.</Text>
            ) : (
              activity.map((a, i) => {
                const Icon = a.kind === "alarm_fired" ? Siren : a.kind === "risk_flagged" ? ShieldAlert : a.kind === "network_added" ? UsersRound : MapPin;
                const tone = a.kind === "alarm_fired" ? colors.danger : colors.accentOn;
                const tappable = a.kind === "risk_flagged" && a.ref_id;
                const Row = (
                  <View style={styles.inboxRow}>
                    <Icon size={18} color={tone} strokeWidth={2} />
                    <Text style={[styles.inboxTitle, { color: colors.text }]} numberOfLines={1}>{a.title}</Text>
                    <Text style={[styles.inboxTime, { color: colors.textFaint }]}>{timeAgo(a.happened_at)}</Text>
                  </View>
                );
                return tappable ? (
                  <Pressable key={i} onPress={() => navigation.navigate("IncidentDetail" as never, { incidentId: a.ref_id } as never)}>{Row}</Pressable>
                ) : (
                  <View key={i}>{Row}</View>
                );
              })
            )}
          </GlassCard>
        </ScrollView>
        <LocationConsentCard
          visible={consentVisible}
          onDone={() => { setConsentVisible(false); setFetched(false); }}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: 130 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.lg },
  avatarRing: { width: 52, height: 52, borderRadius: 26, padding: 2, alignItems: "center", justifyContent: "center" },
  avatarInner: { flex: 1, alignSelf: "stretch", borderRadius: 24 },
  hello: { fontSize: 22, fontWeight: "800" },
  plan: { fontSize: 13, marginTop: 2 },
  signOut: { fontSize: 13 },
  hero: { borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.lg, borderWidth: 1 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  heroTitle: { fontSize: 17, fontWeight: "700" },
  heroScore: { fontSize: 26, fontWeight: "800", marginLeft: "auto" },
  dot: { width: 11, height: 11, borderRadius: 6 },
  heroSub: { fontSize: 13, marginTop: 8 },
  row: { flexDirection: "row", gap: spacing.md },
  cardLarge: { flex: 1.2 },
  tile: { borderRadius: radius.xl, padding: 16, overflow: "hidden", boxShadow: "0px 0px 2px 2px rgba(20,25,40,0.32), 0px 8px 22px rgba(40,50,80,0.18)" } as any,
  cardLabel: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontSize: 16, fontWeight: "700", flex: 1, marginRight: spacing.sm },
  tileNote: { fontSize: 11, lineHeight: 15, textAlign: "center", marginTop: -8, fontWeight: "600" },
  inboxRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: spacing.sm },
  inboxTitle: { fontSize: 12, fontWeight: "400", flex: 1 },
  inboxTime: { fontSize: 11 },
  inboxPip: { width: 7, height: 7, borderRadius: 3.5 },
  reqBadge: { position: "absolute", top: 10, right: 10, minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  reqBadgeText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  bigStat: { fontSize: 30, fontWeight: "800", marginTop: spacing.sm },
  stat: { fontSize: 13 },
  empty: { fontSize: 13, marginTop: spacing.sm, lineHeight: 19 },
});








































