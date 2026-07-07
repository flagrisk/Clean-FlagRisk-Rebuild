// Trip Watch: automatic background check-ins during a journey (Pro and higher).
// Free users keep the existing manual check-in; this is the scheduled version.
// This screen drives the trip lifecycle (start / view active / stop). The actual
// background scheduling and arrival detection are wired separately.
import { useCallback, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { ChevronLeft, Check, MapPin, Clock, Users, ShieldCheck, Square } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing } from "../theme";
import { showAlert } from "../components/Feedback";
import { Avatar } from "../components/Avatar";
import * as Location from "expo-location";
import { TRIP_TASK } from "../tasks/tripTask";

type Member = { member_id: string; display_name: string | null };
type Trip = {
  id: string;
  status: string;
  interval_minutes: number;
  recipient_ids: string[];
  started_at: string;
  last_check_in_at: string | null;
  planned_end_at: string | null;
};

const AVATAR_COLORS = ["#e0457b", "#3ec46a", "#5b6cf0", "#e0a045", "#9c45e0"];
function avatarColor(id: string) { let h = 0; for (const c of id) h = (h + c.charCodeAt(0)) % AVATAR_COLORS.length; return AVATAR_COLORS[h]; }
function initials(name: string | null) { if (!name) return "?"; return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase(); }

const INTERVALS = [10, 15, 30, 60];
const DURATIONS = [
  { label: "None", hours: null },
  { label: "1h", hours: 1 },
  { label: "2h", hours: 2 },
  { label: "4h", hours: 4 },
  { label: "8h", hours: 8 },
];
const INITIAL_DELTA = { latitudeDelta: 0.02, longitudeDelta: 0.02 };
const DEFAULT_REGION = { latitude: 9.0765, longitude: 7.3986 };

export function TripWatchScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors, glass, gradients, glow, mode } = useTheme();

  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [active, setActive] = useState(null);

  const [members, setMembers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [interval, setIntervalMin] = useState(15);
  const [intervalCustomOn, setIntervalCustomOn] = useState(false);
  const [customInterval, setCustomInterval] = useState("");
  const [durationHours, setDurationHours] = useState(null);
  const [customOn, setCustomOn] = useState(false);
  const [customHours, setCustomHours] = useState("");
  const [customMins, setCustomMins] = useState("");
  const [dest, setDest] = useState(null);
  const [starting, setStarting] = useState(false);
  const mapRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    const id = u.user?.id;
    if (!id) { setLoading(false); return; }
    const { data: prof } = await supabase.from("profiles").select("current_tier").eq("id", id).single();
    const pro = prof?.current_tier === "pro" || prof?.current_tier === "premium";
    setIsPro(pro);
    const { data: trips } = await supabase
      .from("trips")
      .select("id, status, interval_minutes, recipient_ids, started_at, last_check_in_at, planned_end_at")
      .eq("user_id", id)
      .eq("status", "active")
      .limit(1);
    setActive(trips && trips.length > 0 ? trips[0] : null);
    const { data: mem } = await supabase.rpc("my_network_members", { p_owner: id });
    if (mem) setMembers(mem.map((m) => ({ member_id: m.member_id, display_name: m.display_name, avatar_url: m.avatar_url })));
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function toggle(id) {
    setSelected((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }

  function computeEndAt() {
    let hrs = durationHours;
    if (customOn) {
      const h = parseInt(customHours || "0", 10);
      const m = parseInt(customMins || "0", 10);
      const total = h + m / 60;
      if (total <= 0) return null;
      hrs = total;
    }
    if (hrs == null || hrs <= 0) return null;
    return new Date(Date.now() + hrs * 3600 * 1000).toISOString();
  }


  async function startTripTracking(intervalMin) {
    // Foreground permission first, then background ("always").
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== "granted") return false;
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== "granted") return false;
    const already = await Location.hasStartedLocationUpdatesAsync(TRIP_TASK).catch(() => false);
    if (already) await Location.stopLocationUpdatesAsync(TRIP_TASK).catch(() => {});
    await Location.startLocationUpdatesAsync(TRIP_TASK, {
      accuracy: Location.Accuracy.Balanced,
      // Ask the OS to wake us around a third of the interval so an actual
      // check-in lands near the chosen cadence (timing is best-effort).
      timeInterval: Math.max(60000, Math.round((intervalMin * 60 * 1000) / 3)),
      distanceInterval: 0,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: "Trip Watch is active",
        notificationBody: "Sharing check-ins with your chosen people until you arrive.",
      },
    });
    return true;
  }

  async function stopTripTracking() {
    const started = await Location.hasStartedLocationUpdatesAsync(TRIP_TASK).catch(() => false);
    if (started) await Location.stopLocationUpdatesAsync(TRIP_TASK).catch(() => {});
  }

  async function startTrip() {
    if (starting) return;
    let useInterval = interval;
    if (intervalCustomOn) {
      const ci = parseInt(customInterval || "0", 10);
      if (isNaN(ci) || ci < 5 || ci > 180) {
        showAlert({ title: "Check the interval", message: "Enter a check-in interval between 5 and 180 minutes." });
        return;
      }
      useInterval = ci;
    }
    setStarting(true);
    try {
      const endAt = computeEndAt();
      const { data, error } = await supabase.rpc("start_trip", {
        p_interval_minutes: useInterval,
        p_recipient_ids: selected,
        p_planned_end_at: endAt,
        p_destination_lat: dest ? dest.lat : null,
        p_destination_lng: dest ? dest.lng : null,
        p_arrival_radius_m: dest ? 150 : null,
      });
      setStarting(false);
      if (error) {
        if (error.message && error.message.includes("Trip Watch requires Pro")) {
          showAlert({ title: "Pro feature", message: "Trip Watch is available on Pro and higher. Upgrade to schedule automatic check-ins.", buttons: [{ text: "Not now", style: "cancel" }, { text: "See plans", onPress: () => navigation.navigate("PlanPricing") }] });
          return;
        }
        showAlert({ title: "Could not start", message: error.message ?? "Please try again.", tone: "error" });
        return;
      }
      const tracking = await startTripTracking(useInterval);
      if (!tracking) {
        showAlert({ title: "Background location needed", message: "Trip Watch needs location access set to Allow all the time to check you in automatically. You can still check in manually from the map.", tone: "error" });
      } else {
        showAlert({ title: "Trip started", message: selected.length > 0 ? (selected.length + (selected.length === 1 ? " person has" : " people have") + " been told your trip has begun.") : "Your trip is running." });
      }
      load();
    } catch (e) {
      setStarting(false);
      showAlert({ title: "Network error", message: String(e), tone: "error" });
    }
  }

  async function stopTrip() {
    if (!active) return;
    showAlert({
      title: "Stop this trip?",
      message: "Automatic check-ins will end and your selected people will be told your trip has ended.",
      buttons: [
        { text: "Keep going", style: "cancel" },
        { text: "Stop trip", onPress: async () => {
          const { error } = await supabase.rpc("end_trip", { p_trip_id: active.id, p_reason: "stopped" });
          if (error) { showAlert({ title: "Could not stop", message: error.message ?? "Please try again.", tone: "error" }); return; }
          await stopTripTracking();
          load();
        } },
      ],
    });
  }

  const Header = (
    <View style={styles.header}>
      <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={{ flexDirection: "row", alignItems: "center" }}>
        <ChevronLeft size={22} color={colors.text} strokeWidth={2} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Trip Watch</Text>
      </Pressable>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top"]}>
        {Header}
        <Text style={[styles.muted, { color: colors.textMuted, padding: spacing.lg }]}>Loading...</Text>
      </SafeAreaView>
    );
  }

  if (!isPro && !active) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top"]}>
        {Header}
        <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
          <View style={[styles.card, { backgroundColor: glass.surface, borderColor: glass.stroke }]}>
            <ShieldCheck size={28} color={colors.accentOn} strokeWidth={2} />
            <Text style={[styles.cardTitle, { color: colors.text, marginTop: spacing.sm }]}>Automatic check-ins on your journey</Text>
            <Text style={[styles.cardBody, { color: colors.textMuted }]}>
              Trip Watch shares your location with the people you choose, on a schedule you set, until you arrive or stop it. It runs in the background so you do not have to remember. Available on Pro and higher.
            </Text>
            <Pressable style={{ marginTop: spacing.md }} onPress={() => navigation.navigate("PlanPricing")}>
              <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.primaryBtn, { boxShadow: glow.brand }]}>
                <Text style={[styles.primaryText, { color: colors.accentText }]}>See plans</Text>
              </LinearGradient>
            </Pressable>
          </View>
          <Text style={[styles.muted, { color: colors.textFaint, marginTop: spacing.md, textAlign: "center" }]}>
            You can still check in manually any time from the map.
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (active) {
    const started = new Date(active.started_at);
    const last = active.last_check_in_at ? new Date(active.last_check_in_at) : null;
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top"]}>
        {Header}
        <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
          <View style={[styles.card, { backgroundColor: glass.surface, borderColor: colors.accentOn }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={[styles.pulse, { backgroundColor: colors.accentOn }]} />
              <Text style={[styles.cardTitle, { color: colors.text }]}>Trip in progress</Text>
            </View>
            <View style={styles.rowLine}>
              <Clock size={16} color={colors.textMuted} strokeWidth={2} />
              <Text style={[styles.rowText, { color: colors.textMuted }]}>Checking in every {active.interval_minutes} minutes</Text>
            </View>
            <View style={styles.rowLine}>
              <Users size={16} color={colors.textMuted} strokeWidth={2} />
              <Text style={[styles.rowText, { color: colors.textMuted }]}>{active.recipient_ids.length} {active.recipient_ids.length === 1 ? "person" : "people"} notified</Text>
            </View>
            <Text style={[styles.muted, { color: colors.textFaint, marginTop: spacing.xs }]}>Started {started.toLocaleTimeString()}</Text>
            <Text style={[styles.muted, { color: colors.textFaint }]}>Last check-in {last ? last.toLocaleTimeString() : "pending"}</Text>
            {active.planned_end_at ? (
              <Text style={[styles.muted, { color: colors.textFaint }]}>Ends automatically {new Date(active.planned_end_at).toLocaleTimeString()}</Text>
            ) : null}
          </View>
          <Pressable style={{ marginTop: spacing.lg }} onPress={stopTrip}>
            <View style={[styles.stopBtn, { borderColor: colors.danger, backgroundColor: colors.danger + "12" }]}>
              <Square size={18} color={colors.danger} strokeWidth={2.5} />
              <Text style={[styles.stopText, { color: colors.danger }]}>Stop trip</Text>
            </View>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top"]}>
      {Header}
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl + insets.bottom }}>
        <Text style={[styles.section, { color: colors.text }]}>Check in every</Text>
        <View style={styles.chipRow}>
          {INTERVALS.map((n) => {
            const on = !intervalCustomOn && interval === n;
            return (
              <Pressable key={n} onPress={() => { setIntervalCustomOn(false); setIntervalMin(n); }} style={[styles.chip, { borderColor: on ? colors.accentOn : glass.stroke, backgroundColor: on ? colors.accentOn : glass.surface }]}>
                <Text style={[styles.chipText, { color: on ? "#ffffff" : colors.text }]}>{n} min</Text>
              </Pressable>
            );
          })}
          <Pressable onPress={() => setIntervalCustomOn(true)} style={[styles.chip, { borderColor: intervalCustomOn ? colors.accentOn : glass.stroke, backgroundColor: intervalCustomOn ? colors.accentOn : glass.surface }]}>
            <Text style={[styles.chipText, { color: intervalCustomOn ? "#ffffff" : colors.text }]}>Custom</Text>
          </Pressable>
        </View>
        {intervalCustomOn ? (
          <View style={styles.customRow}>
            <TextInput value={customInterval} onChangeText={setCustomInterval} keyboardType="number-pad" placeholder="minutes" placeholderTextColor={colors.textFaint} style={[styles.customInput, { color: colors.text, borderColor: glass.stroke, backgroundColor: glass.surface, width: 90 }]} />
            <Text style={[styles.muted, { color: colors.textMuted }]}>minutes (5 to 180)</Text>
          </View>
        ) : null}

        <Text style={[styles.section, { color: colors.text }]}>Who to notify</Text>
        {members.length === 0 ? (
          <Text style={[styles.muted, { color: colors.textMuted }]}>Add people to your network first to notify them.</Text>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {members.map((m) => {
              const on = selected.includes(m.member_id);
              const ac = avatarColor(m.member_id);
              return (
                <Pressable key={m.member_id} onPress={() => toggle(m.member_id)} style={[styles.memberRow, { borderColor: on ? colors.accentOn : glass.stroke, backgroundColor: glass.surface }]}>
                  <Avatar uri={m.avatar_url} name={m.display_name} id={m.member_id} size={36} />
                  <Text style={[styles.mName, { color: colors.text, flex: 1 }]}>{m.display_name ?? "FlagRisk user"}</Text>
                  <View style={[styles.checkBox, { borderColor: on ? colors.accentOn : glass.strokeStrong, backgroundColor: on ? colors.accentOn : "transparent" }]}>
                    {on && <Check size={14} color={colors.accentText} strokeWidth={3} />}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        <Text style={[styles.section, { color: colors.text }]}>Stop after</Text>
        <View style={styles.chipRow}>
          {DURATIONS.map((d) => {
            const on = !customOn && durationHours === d.hours;
            return (
              <Pressable key={d.label} onPress={() => { setCustomOn(false); setDurationHours(d.hours); }} style={[styles.chip, { borderColor: on ? colors.accentOn : glass.stroke, backgroundColor: on ? colors.accentOn : glass.surface }]}>
                <Text style={[styles.chipText, { color: on ? "#ffffff" : colors.text }]}>{d.label}</Text>
              </Pressable>
            );
          })}
          <Pressable onPress={() => { setCustomOn(true); setDurationHours(null); }} style={[styles.chip, { borderColor: customOn ? colors.accentOn : glass.stroke, backgroundColor: customOn ? colors.accentOn : glass.surface }]}>
            <Text style={[styles.chipText, { color: customOn ? "#ffffff" : colors.text }]}>Custom</Text>
          </Pressable>
        </View>
        {customOn ? (
          <View style={styles.customRow}>
            <TextInput value={customHours} onChangeText={setCustomHours} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.textFaint} style={[styles.customInput, { color: colors.text, borderColor: glass.stroke, backgroundColor: glass.surface }]} />
            <Text style={[styles.muted, { color: colors.textMuted }]}>hours</Text>
            <TextInput value={customMins} onChangeText={setCustomMins} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.textFaint} style={[styles.customInput, { color: colors.text, borderColor: glass.stroke, backgroundColor: glass.surface }]} />
            <Text style={[styles.muted, { color: colors.textMuted }]}>minutes</Text>
          </View>
        ) : null}

        <Text style={[styles.section, { color: colors.text }]}>Destination (optional)</Text>
        <Text style={[styles.muted, { color: colors.textMuted, marginBottom: spacing.sm }]}>Tap the map to set where you are going. Your trip ends automatically when you arrive.</Text>
        <View style={styles.mapBox}>
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={StyleSheet.absoluteFill}
            initialRegion={{ ...DEFAULT_REGION, ...INITIAL_DELTA }}
            onPress={(e) => setDest({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })}
          >
            {dest ? <Marker coordinate={{ latitude: dest.lat, longitude: dest.lng }} anchor={{ x: 0.5, y: 1 }}><MapPin size={34} color={colors.accentOn} fill={colors.accentOn} strokeWidth={1.5} /></Marker> : null}
          </MapView>
          {dest ? (
            <Pressable style={[styles.clearDest, { backgroundColor: glass.surface, borderColor: glass.stroke }]} onPress={() => setDest(null)}>
              <Text style={[styles.clearDestText, { color: colors.text }]}>Clear</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={[styles.note, { color: colors.textFaint }]}>
          Check-ins run in the background. Shorter intervals and background location use more battery, and timing is approximate.
        </Text>

        <Pressable style={{ marginTop: spacing.md }} onPress={startTrip} disabled={starting}>
          <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.primaryBtn, { boxShadow: glow.brand, opacity: starting ? 0.6 : 1 }]}>
            <Text style={[styles.primaryText, { color: colors.accentText }]}>{starting ? "Starting..." : "Start trip"}</Text>
          </LinearGradient>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  headerTitle: { fontSize: 20, fontWeight: "800", marginLeft: 4 },
  muted: { fontSize: 13 },
  section: { fontSize: 15, fontWeight: "800", marginTop: spacing.lg, marginBottom: spacing.sm },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: radius.md, borderWidth: 1 },
  chipText: { fontSize: 14, fontWeight: "700" },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radius.md, borderWidth: 1 },
  mAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  mAvatarText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  mName: { fontSize: 15, fontWeight: "600" },
  checkBox: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  customRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.sm },
  customInput: { width: 60, borderWidth: 1, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 12, fontSize: 15, textAlign: "center" },
  mapBox: { height: 200, borderRadius: radius.lg, overflow: "hidden" },
  clearDest: { position: "absolute", top: 10, right: 10, paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1 },
  clearDestText: { fontSize: 13, fontWeight: "700" },
  note: { fontSize: 12.5, lineHeight: 18, marginTop: spacing.lg },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg },
  cardTitle: { fontSize: 17, fontWeight: "800" },
  cardBody: { fontSize: 14, lineHeight: 21, marginTop: spacing.sm },
  primaryBtn: { paddingVertical: 15, borderRadius: radius.lg, alignItems: "center" },
  primaryText: { fontSize: 16, fontWeight: "800" },
  rowLine: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.sm },
  rowText: { fontSize: 14, fontWeight: "600" },
  pulse: { width: 10, height: 10, borderRadius: 5 },
  stopBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15, borderRadius: radius.lg, borderWidth: 1.5 },
  stopText: { fontSize: 16, fontWeight: "800" },
});
