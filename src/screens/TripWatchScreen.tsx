// ============================================================================
// Trip Watch - FlagRisk v2.1
// Rebuilt against Figma "Trip Watch" (12.0 flow, nodes 75:2591 / 2665 / 2758 /
// 2831 / 2932).
//   setup: map + "Trip Details" sheet -> "Review Summary" -> Start
//   active: map + status card + Emergency / Check-In pair + End Session
//   end:    confirmation sheet
//
// DESIGN ONLY. Every behaviour and input is unchanged: interval, duration,
// recipients, destination pin, background task, escalation, manual check-in.
//
// Two things drawn in the mockup are NOT built, because they do not exist:
//  - Departure Time. Ruled out explicitly.
//  - Purpose. start_trip takes no such parameter.
// And the active state is worded as interval check-ins, not "Sharing Live
// Location", because the app checks in on a cadence, it does not stream.
// ============================================================================
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import {
  ArrowLeft, MapPin, Clock, Users, Check, Siren, X, ChevronRight,
} from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { showAlert } from "../components/Feedback";
import { Avatar } from "../components/Avatar";
import { TRIP_TASK } from "../tasks/tripTask";
import { SlideAction } from "../components/SlideAction";
import { colors, radius, spacing, type, elevation } from "../theme";

// The primary fill. Ink through graphite on the same 135 degree axis as the
// Dashboard tiles. A stylesheet cannot hold a gradient, so it is laid behind
// the button content instead.
const PRIMARY_GRAD = ["#101216", "#1B1E24", "#33373F"] as const;
const PRIMARY_STOPS = [0, 0.45, 1] as const;


type Member = { member_id: string; display_name: string | null; avatar_url?: string | null };
type Trip = {
  id: string; status: string; interval_minutes: number; recipient_ids: string[];
  started_at: string; last_check_in_at: string | null; planned_end_at: string | null;
};
type Dest = { lat: number; lng: number };

const INTERVALS = [10, 15, 30, 60];
const DURATIONS: { label: string; hours: number | null }[] = [
  { label: "Open", hours: null },
  { label: "1h", hours: 1 },
  { label: "2h", hours: 2 },
  { label: "4h", hours: 4 },
  { label: "8h", hours: 8 },
];
const DELTA = { latitudeDelta: 0.02, longitudeDelta: 0.02 };
const DEFAULT_REGION = { latitude: 9.0765, longitude: 7.3986 };

export function TripWatchScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [active, setActive] = useState<Trip | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [interval, setIntervalMin] = useState(15);
  const [customIntervalOn, setCustomIntervalOn] = useState(false);
  const [customInterval, setCustomInterval] = useState("");
  const [durationHours, setDurationHours] = useState<number | null>(null);
  const [dest, setDest] = useState<Dest | null>(null);
  const [step, setStep] = useState<"details" | "review">("details");
  const [starting, setStarting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [ending, setEnding] = useState(false);
  const mapRef = useRef<MapView | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    const id = u.user?.id;
    if (!id) { setLoading(false); return; }
    const { data: prof } = await supabase.from("profiles").select("current_tier").eq("id", id).single();
    setIsPro(prof?.current_tier === "pro" || prof?.current_tier === "premium");
    const { data: trips } = await supabase
      .from("trips")
      .select("id, status, interval_minutes, recipient_ids, started_at, last_check_in_at, planned_end_at")
      .eq("user_id", id)
      .in("status", ["active", "overdue", "escalated"])
      .order("started_at", { ascending: false })
      .limit(1);
    setActive(trips && trips.length > 0 ? (trips[0] as Trip) : null);
    const { data: mem } = await supabase.rpc("my_network_members", { p_owner: id });
    if (mem) setMembers((mem as any[]).map((m) => ({
      member_id: m.member_id, display_name: m.display_name, avatar_url: m.avatar_url,
    })));
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function toggle(id: string) {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.concat([id])));
  }

  function computeEndAt() {
    if (durationHours == null || durationHours <= 0) return null;
    return new Date(Date.now() + durationHours * 3600 * 1000).toISOString();
  }

  async function startTripTracking(intervalMin: number) {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== "granted") return false;
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== "granted") return false;
    const already = await Location.hasStartedLocationUpdatesAsync(TRIP_TASK).catch(() => false);
    if (already) await Location.stopLocationUpdatesAsync(TRIP_TASK).catch(() => {});
    await Location.startLocationUpdatesAsync(TRIP_TASK, {
      accuracy: Location.Accuracy.Balanced,
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

    // A trip nobody is watching cannot alert anyone when you go quiet, which is
    // the whole point of the feature. Refuse rather than start a silent one.
    if (selected.length === 0) {
      showAlert({
        title: "Choose who is watching",
        message: members.length === 0
          ? "Add someone to your network first. Trip Watch tells the people you choose when you stop checking in, so it needs at least one person."
          : "Pick at least one person. Trip Watch tells them when you stop checking in, and without anyone chosen it cannot alert a soul.",
        tone: "error",
      });
      return;
    }

    let useInterval = interval;
    if (customIntervalOn) {
      const ci = parseInt(customInterval || "0", 10);
      if (isNaN(ci) || ci < 5 || ci > 180) {
        showAlert({ title: "Check the interval", message: "Enter a check-in interval between 5 and 180 minutes." });
        return;
      }
      useInterval = ci;
    }
    setStarting(true);
    try {
      const { error } = await supabase.rpc("start_trip", {
        p_interval_minutes: useInterval,
        p_recipient_ids: selected,
        p_planned_end_at: computeEndAt(),
        p_destination_lat: dest ? dest.lat : null,
        p_destination_lng: dest ? dest.lng : null,
        p_arrival_radius_m: dest ? 150 : null,
      });
      setStarting(false);
      if (error) {
        // The phone gate refuses before the tier check does, so this comes
        // first. Without it the person sees the raw code phone_not_verified.
        if (error.message && error.message.indexOf("phone_not_verified") >= 0) {
          showAlert({
            title: "Verify your number first",
            message: "Trip Watch tells the people you choose if you go quiet, so we need to know who you are. Verify your phone number to use it.",
            buttons: [
              { text: "Not now", style: "cancel" },
              { text: "Verify now", onPress: () => navigation.navigate("PhoneVerify", { mode: "attach" }) },
            ],
          });
          return;
        }
        if (error.message && error.message.indexOf("trip_watch_not_included") >= 0) {
          showAlert({
            title: "Not on your plan",
            message: "Trip Watch is only included in Pro and higher plans, or with custom coverage. It checks you in while you travel and tells the people you choose if you go quiet.",
            buttons: [
              { text: "Free version", style: "cancel", onPress: () => navigation.navigate("Main", { screen: "Profile", params: { focus: "checkin" } }) },
              { text: "Upgrade plan", onPress: () => navigation.navigate("PlanPricing") },
            ],
          });
          return;
        }
        showAlert({ title: "Could not start", message: error.message ?? "Please try again.", tone: "error" });
        return;
      }
      const tracking = await startTripTracking(useInterval);
      if (!tracking) {
        showAlert({
          title: "Background location needed",
          message: "Trip Watch needs location access set to Allow all the time to check you in automatically. You can still check in manually.",
          tone: "error",
        });
      } else {
        showAlert({
          title: "Trip started",
          message: selected.length > 0
            ? selected.length + (selected.length === 1 ? " person has" : " people have") + " been told your trip has begun."
            : "Your trip is running.",
        });
      }
      setStep("details");
      load();
    } catch (e) {
      setStarting(false);
      showAlert({ title: "Network error", message: String(e), tone: "error" });
    }
  }

  async function confirmSafe() {
    if (!active || checking) return;
    setChecking(true);
    try {
      let lat: number | null = null; let lng: number | null = null;
      const fg = await Location.getForegroundPermissionsAsync();
      if (fg.status === "granted") {
        const last = await Location.getLastKnownPositionAsync().catch(() => null);
        if (last) { lat = last.coords.latitude; lng = last.coords.longitude; }
        if (lat == null || lng == null) {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
          if (pos) { lat = pos.coords.latitude; lng = pos.coords.longitude; }
        }
      }
      if (lat == null || lng == null) {
        setChecking(false);
        showAlert({ title: "Location needed", message: "Your location could not be read. Please try again where location is available.", tone: "error" });
        return;
      }
      const wasEscalated = active.status === "escalated";
      const { error } = await supabase.rpc("send_trip_check_in", {
        p_trip_id: active.id, p_lat: lat, p_lng: lng, p_recorded_at: new Date().toISOString(),
      });
      setChecking(false);
      if (error) { showAlert({ title: "Could not check in", message: error.message, tone: "error" }); return; }
      showAlert({
        title: "Checked in",
        message: wasEscalated
          ? "The people watching this trip have been told you are safe."
          : "You are safe. No one will be alerted.",
        tone: "success",
      });
      load();
    } catch (e) {
      setChecking(false);
      showAlert({ title: "Could not check in", message: String(e), tone: "error" });
    }
  }

  function stopTrip() {
    if (!active) return;
    showAlert({
      title: "End Trip Watch?",
      message: "Automatic check-ins will stop and your contacts will no longer receive updates.",
      buttons: [
        { text: "Keep going", style: "cancel" },
        {
          text: "End watch",
          onPress: async () => {
            setEnding(true);
            const { error } = await supabase.rpc("end_trip", { p_trip_id: active.id, p_reason: "stopped" });
            setEnding(false);
            if (error) { showAlert({ title: "Could not stop", message: error.message ?? "Please try again.", tone: "error" }); return; }
            await stopTripTracking();
            load();
          },
        },
      ],
    });
  }

  const Header = ({ title, onBack }: { title: string; onBack: () => void }) => (
    <View style={styles.header}>
      <Pressable onPress={onBack} style={styles.headBtnPlain} hitSlop={8}>
        <ArrowLeft size={20} color={colors.ink} strokeWidth={2} />
      </Pressable>
      <Text style={styles.headTitle}>{title}</Text>
      <View style={{ width: 36 }} />
    </View>
  );

  const Map = ({ marker }: { marker: Dest | null }) => (
    <View style={styles.mapWrap}>
      <MapView
        ref={(r) => { mapRef.current = r; }}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...DEFAULT_REGION, ...DELTA }}
        showsUserLocation
        onPress={(e) => !active && setDest({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })}
      >
        {marker ? (
          <Marker coordinate={{ latitude: marker.lat, longitude: marker.lng }} anchor={{ x: 0.5, y: 1 }}>
            <MapPin size={34} color={colors.riskHigh} fill={colors.riskHigh} strokeWidth={1.5} />
          </Marker>
        ) : null}
      </MapView>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Header title="Trip Watch" onBack={() => navigation.goBack()} />
        <ActivityIndicator color={colors.ink} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------- ACTIVE --
  if (active) {
    const overdue = active.status === "overdue" || active.status === "escalated";
    const escalated = active.status === "escalated";
    const last = active.last_check_in_at ? new Date(active.last_check_in_at) : new Date(active.started_at);
    const watcherIds = active.recipient_ids ?? [];
    const watchers = members.filter((m) => watcherIds.indexOf(m.member_id) >= 0);
    const watcherNames = watchers.map((m) => m.display_name ?? "a contact");
    const watcherLine =
      watcherIds.length === 0
        ? "No one is watching this trip"
        : watcherNames.length > 0
        ? watcherNames.join(", ")
        : watcherIds.length + (watcherIds.length === 1 ? " person" : " people") + " watching";
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Header title="Trip Watch" onBack={() => navigation.goBack()} />
        <Map marker={dest} />

        <View style={styles.sheet}>
          <View style={styles.sheetGrab} />
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>Trip Watch</Text>
            <Pressable onPress={stopTrip} hitSlop={8} disabled={ending}>
              <Text style={styles.endLink}>End session</Text>
            </Pressable>
          </View>

          {overdue ? (
            <View style={styles.warnCard}>
              <Text style={styles.warnTitle}>
                {escalated
                  ? (watcherIds.length === 0
                      ? "No one could be alerted"
                      : watcherNames.length > 0
                        ? watcherNames.join(", ") + (watcherNames.length === 1 ? " has been alerted" : " have been alerted")
                        : "The people you chose have been alerted")
                  : "We have not heard from you"}
              </Text>
              <Text style={styles.warnBody}>
                {escalated
                  ? (watcherIds.length === 0
                      ? "This trip was started without anyone to watch it, so no alert could be sent. End it and start again with someone chosen."
                      : "Check in to tell them you are safe.")
                  : (watcherIds.length === 0
                      ? "No one is watching this trip, so no one will be told."
                      : "Check in now, or " + watcherLine + " will be told shortly.")}
              </Text>
            </View>
          ) : null}

          <View style={styles.statusRow}>
            <View style={styles.statusIcon}><Clock size={17} color={colors.ink} strokeWidth={2} /></View>
            <Text style={styles.statusText}>Checking in every {active.interval_minutes} minutes</Text>
          </View>
          <View style={styles.statusRow}>
            <View style={styles.statusIcon}><Users size={17} color={colors.ink} strokeWidth={2} /></View>
            <Text style={styles.statusText} numberOfLines={2}>{watcherLine}</Text>
          </View>
          <Text style={styles.statusMuted}>Last check-in {last.toLocaleTimeString()}</Text>

          {overdue ? (
            <View style={{ marginTop: spacing.lg }}>
              <SlideAction
                label="Slide to check in"
                committedLabel="Checked in"
                onCommit={confirmSafe}
                disabled={checking}
               
              />
            </View>
          ) : (
            <Text style={styles.autoNote}>
              Trip Watch is checking you in on its own. There is nothing to do unless it stops
              hearing from you, and then it will ask.
            </Text>
          )}

          <Pressable
            style={[styles.pairBtn, { borderColor: colors.riskHigh, marginTop: spacing.md }]}
            onPress={() => navigation.navigate("Panic")}
          >
            <Siren size={17} color={colors.riskHigh} strokeWidth={2} />
            <Text style={[styles.pairText, { color: colors.riskHigh }]}>Emergency</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ----------------------------------------------------------------- SETUP --
  const chosen = members.filter((m) => selected.indexOf(m.member_id) >= 0);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Header
        title="Trip Watch"
        onBack={() => (step === "review" ? setStep("details") : navigation.goBack())}
      />
      <Map marker={dest} />

      <View style={styles.sheet}>
        <View style={styles.sheetGrab} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}>
          {step === "details" ? (
            <>
              <Text style={styles.sheetTitle}>Trip details</Text>
              <Text style={styles.sheetSub}>Share trip details so your contacts can follow and be alerted.</Text>

              <Text style={styles.label}>Destination</Text>
              <View style={styles.fieldRow}>
                <View style={styles.fieldIcon}><MapPin size={17} color={colors.riskHigh} strokeWidth={2} /></View>
                <Text style={styles.fieldText} numberOfLines={1}>
                  {dest ? dest.lat.toFixed(5) + ", " + dest.lng.toFixed(5) : "Tap the map to set a destination"}
                </Text>
                {dest ? (
                  <Pressable onPress={() => setDest(null)} hitSlop={8}>
                    <X size={17} color={colors.textMuted} strokeWidth={2} />
                  </Pressable>
                ) : null}
              </View>
              <Text style={styles.hint}>Optional. With a destination set, arrival ends the trip automatically.</Text>

              <Text style={styles.label}>Check in every</Text>
              <View style={styles.chipRow}>
                {INTERVALS.map((m) => {
                  const on = !customIntervalOn && interval === m;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => { setCustomIntervalOn(false); setIntervalMin(m); }}
                      style={[styles.chip, on && styles.chipOn]}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{m} min</Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() => setCustomIntervalOn(true)}
                  style={[styles.chip, customIntervalOn && styles.chipOn]}
                >
                  <Text style={[styles.chipText, customIntervalOn && styles.chipTextOn]}>Custom</Text>
                </Pressable>
              </View>
              {customIntervalOn ? (
                <TextInput
                  style={styles.input}
                  value={customInterval}
                  onChangeText={setCustomInterval}
                  keyboardType="number-pad"
                  placeholder="Minutes, between 5 and 180"
                  placeholderTextColor="#8B8F96"
                />
              ) : null}

              <Text style={styles.label}>Stop after</Text>
              <View style={styles.chipRow}>
                {DURATIONS.map((d) => {
                  const on = durationHours === d.hours;
                  return (
                    <Pressable key={d.label} onPress={() => setDurationHours(d.hours)} style={[styles.chip, on && styles.chipOn]}>
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{d.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable style={styles.primaryBtn} onPress={() => setStep("review")}>
                <LinearGradient colors={PRIMARY_GRAD} locations={PRIMARY_STOPS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
                <Text style={styles.primaryText}>Next</Text>
                <ChevronRight size={18} color={colors.accent} strokeWidth={2.4} />
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.sheetTitle}>Review summary</Text>
              <Text style={styles.sheetSub}>Review your trip summary.</Text>

              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <MapPin size={17} color={colors.riskHigh} strokeWidth={2} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.summaryLabel}>Destination</Text>
                    <Text style={styles.summaryValue}>
                      {dest ? dest.lat.toFixed(5) + ", " + dest.lng.toFixed(5) : "Not set"}
                    </Text>
                  </View>
                </View>
                <View style={styles.summaryRow}>
                  <Clock size={17} color={colors.ink} strokeWidth={2} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.summaryLabel}>Check in every</Text>
                    <Text style={styles.summaryValue}>
                      {customIntervalOn ? (customInterval || "-") : interval} minutes
                    </Text>
                  </View>
                </View>
                <View style={[styles.summaryRow, { borderBottomWidth: 0 }]}>
                  <Clock size={17} color={colors.ink} strokeWidth={2} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.summaryLabel}>Stop after</Text>
                    <Text style={styles.summaryValue}>
                      {durationHours == null ? "Open ended" : durationHours + " hours"}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.shareHead}>
                <Text style={styles.label}>Sharing with ({chosen.length})</Text>
                <Pressable onPress={() => navigation.navigate("Network")} hitSlop={8}>
                  <Text style={styles.addLink}>Add contact</Text>
                </Pressable>
              </View>

              {members.length === 0 ? (
                <Text style={styles.hint}>You have no one in your network yet. Add someone first.</Text>
              ) : (
                members.map((m) => {
                  const on = selected.indexOf(m.member_id) >= 0;
                  return (
                    <Pressable key={m.member_id} onPress={() => toggle(m.member_id)} style={styles.memberRow}>
                      <Avatar uri={m.avatar_url} name={m.display_name} id={m.member_id} size={40} />
                      <Text style={styles.memberName} numberOfLines={1}>{m.display_name ?? "FlagRisk user"}</Text>
                      <View style={[styles.tick, on && styles.tickOn]}>
                        {on ? <Check size={14} color={colors.accent} strokeWidth={3} /> : null}
                      </View>
                    </Pressable>
                  );
                })
              )}

              {!isPro ? (
                <Text style={styles.hint}>
                  Trip Watch is available on Pro and higher. Starting a trip will offer you the plans.
                </Text>
              ) : null}

              {selected.length === 0 ? (
                <Text style={styles.pickHint}>
                  Pick at least one person above. Trip Watch has no one to tell until you do.
                </Text>
              ) : null}
              <Pressable
                style={[styles.primaryBtn, (starting || selected.length === 0) && { opacity: 0.45 }]}
                onPress={startTrip}
                disabled={starting || selected.length === 0}
              >
                <LinearGradient colors={PRIMARY_GRAD} locations={PRIMARY_STOPS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
                <Text style={styles.primaryText}>
                  {starting
                    ? "Starting"
                    : selected.length === 0
                      ? "Start Trip Watch"
                      : "Start, telling " + selected.length + (selected.length === 1 ? " person" : " people")}
                </Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  header: { height: 36, flexDirection: "row", alignItems: "center", marginHorizontal: spacing.gutter, marginTop: spacing.md },
  headBtnPlain: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headTitle: { flex: 1, ...type.heading, color: colors.ink, textAlign: "center" },

  mapWrap: { height: 260, marginTop: spacing.md, overflow: "hidden" },

  sheet: {
    flex: 1, backgroundColor: "#FFFFFF",
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    marginTop: -radius.lg, paddingHorizontal: spacing.gutter, paddingTop: spacing.sm,
    ...elevation.sheet,
  },
  sheetGrab: { alignSelf: "center", width: 44, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: spacing.md },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheetTitle: { ...type.heading, color: colors.ink },
  sheetSub: { ...type.caption, color: colors.textMuted, marginTop: 4 },
  endLink: { ...type.label, fontWeight: "600", color: colors.riskHigh },

  label: { ...type.label, fontWeight: "500", color: colors.ink, marginTop: spacing.lg, marginBottom: spacing.sm },
  hint: { ...type.caption, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 17 },

  fieldRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.ms,
    backgroundColor: "#F1F2F5", borderWidth: 1, borderColor: "rgba(20,21,42,0.14)", borderRadius: radius.md, paddingHorizontal: spacing.md, height: 56,
  },
  fieldIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  fieldText: { flex: 1, ...type.label, fontWeight: "500", color: colors.ink },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { height: 38, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 13, lineHeight: 17, fontWeight: "500", color: colors.ink },
  chipTextOn: { color: colors.accent, fontWeight: "600" },

  input: {
    height: 48, borderRadius: radius.sm, backgroundColor: "#F1F2F5", borderWidth: 1, borderColor: "rgba(20,21,42,0.14)",
    paddingHorizontal: spacing.md, ...type.body, color: colors.ink, marginTop: spacing.sm,
  },

  summaryCard: { backgroundColor: colors.bgElevated, borderRadius: radius.md, paddingHorizontal: spacing.md, marginTop: spacing.md },
  summaryRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.ms,
    paddingVertical: spacing.ms, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  summaryLabel: { ...type.caption, color: colors.textMuted },
  summaryValue: { ...type.label, color: colors.ink, marginTop: 2 },

  shareHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  addLink: { ...type.caption, fontWeight: "600", color: colors.ink },
  memberRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.ms, borderBottomWidth: 1, borderBottomColor: colors.border },
  memberName: { flex: 1, ...type.label, color: colors.ink },
  tick: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  tickOn: { backgroundColor: colors.ink, borderColor: colors.ink },

  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.ms, marginTop: spacing.md },
  statusIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#F0F0F0", alignItems: "center", justifyContent: "center" },
  statusText: { ...type.label, fontWeight: "500", color: colors.ink },
  statusMuted: { ...type.caption, color: colors.textMuted, marginTop: spacing.sm },
  autoNote: { ...type.caption, color: colors.textMuted, lineHeight: 18, marginTop: spacing.lg },
  pickHint: { ...type.caption, color: colors.riskHigh, lineHeight: 17, marginTop: spacing.md },

  warnCard: { backgroundColor: "#FDE7CF", borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  warnTitle: { ...type.label, fontWeight: "600", color: "#B26A12" },
  warnBody: { ...type.caption, color: "#B26A12", marginTop: 3, lineHeight: 17 },

  // Standalone in a column now, so no flex: it would grow to fill the leftover
  // height instead of the width.
  pairBtn: {
    alignSelf: "stretch", flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, height: 52, borderRadius: radius.md, borderWidth: 1, backgroundColor: "transparent",
  },
  pairText: { ...type.label, fontWeight: "600" },

  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    height: 52, borderRadius: radius.md, backgroundColor: "transparent", overflow: "hidden", marginTop: spacing.xl,
  },
  primaryText: { ...type.bodyStrong, fontWeight: "600", color: colors.accent},
});





