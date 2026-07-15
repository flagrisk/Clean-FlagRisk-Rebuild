// Map + Flag (V2 + theming). Native Google Maps. Tap-and-reveal flagging + elective network alert.
import { useCallback, useEffect, useRef, useState } from "react";
import { showAlert } from "../components/Feedback";
import { Alert, AppState, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { supabase } from "../../lib/supabase";
import { useRiskCache } from "../theme/RiskCache";
import { Dropdown, Option } from "../components/Dropdown";
import { useTheme } from "../theme/ThemeProvider";
import { Avatar } from "../components/Avatar";
import { TriangleAlert, Gauge, Video, Layers, MapPin, MapPinOff, Users, Check } from "lucide-react-native";
import { radius, spacing } from "../theme";

type Incident = {
  id: string; category_id: string; latitude: number; longitude: number;
  status: string; severity?: string; display_state?: string;
};
type Pt = { lat: number; lng: number };
type Member = { member_id: string; display_name: string | null; avatar_url?: string | null; within_reach?: boolean; has_location?: boolean };

const SEVERITIES: Option[] = [
  { value: "low", label: "Low" }, { value: "moderate", label: "Moderate" },
  { value: "high", label: "High" }, { value: "critical", label: "Critical" },
];
const SEVERITY_COLORS: Record<string, string> = { low: "#34e0a1", moderate: "#ffb020", high: "#ff8a3d", critical: "#ff5a5f" };
const DEFAULT = { lat: 9.0765, lng: 7.3986 };
const INITIAL_DELTA = { latitudeDelta: 0.0045, longitudeDelta: 0.0045 };

const AVATAR_COLORS = ["#e0457b", "#3ec46a", "#5b6cf0", "#e0a045", "#9c45e0"];
function avatarColor(id: string) { let h = 0; for (const c of id) h = (h + c.charCodeAt(0)) % AVATAR_COLORS.length; return AVATAR_COLORS[h]; }
function initials(name: string | null) { if (!name) return "?"; return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase(); }

const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#212121" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#757575" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#181818" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#2c2c2c" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8a8a8a" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#373737" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3c3c3c" }] },
  { featureType: "road.local", elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { featureType: "transit", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#000000" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3d3d3d" }] },
];

export function MapFlagScreen() {
  const navigation = useNavigation<any>();
  const mapRef = useRef<MapView>(null);
  const didCenter = useRef(false);
  const insets = useSafeAreaInsets();
  const { colors, glass, gradients, glow, mode } = useTheme();
  const cache = useRiskCache();
  const [coords, setCoords] = useState(cache.loc ?? DEFAULT);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [locationOff, setLocationOff] = useState(false);
  const [mapType, setMapType] = useState<"standard" | "hybrid">("standard");

  const [picked, setPicked] = useState<Pt | null>(null);
  const [categories, setCategories] = useState<Option[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [severity, setSeverity] = useState<string | null>(null);
  const [evidencePath, setEvidencePath] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  // When several incidents sit on (nearly) the same coordinate, the top marker's
  // onPress wins and the ones beneath are untappable. This holds the stack so the
  // user can pick which one to open.
  const [stackPick, setStackPick] = useState<Incident[] | null>(null);

  const enableLocation = useCallback(async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status === "granted") {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocationOff(false);
        setCoords(c);
        loadIncidents(c.lat, c.lng);
        cache.setLoc(c.lat, c.lng);
        supabase.rpc("log_location", { p_lat: c.lat, p_lng: c.lng }).then(() => {});
        mapRef.current?.animateToRegion({ latitude: c.lat, longitude: c.lng, ...INITIAL_DELTA }, 600);
      } else if (!perm.canAskAgain) {
        // Permanently denied: the OS will not prompt again, so send them to settings.
        Linking.openSettings();
      }
    } catch (_e) {}
  }, []);

  const loadIncidents = useCallback(async (lat: number, lng: number) => {
    const { data } = await supabase.rpc("incidents_all");
    if (data) setIncidents(data);
  }, []);

  useEffect(() => {
    if (didCenter.current) return;
    if (coords.lat === DEFAULT.lat && coords.lng === DEFAULT.lng) return;
    didCenter.current = true;
    mapRef.current?.animateToRegion({ latitude: coords.lat, longitude: coords.lng, ...INITIAL_DELTA }, 600);
  }, [coords]);

  // When returning to the app (e.g. from Settings after tapping the banner),
  // clear the banner if location is now granted. Lightweight: only acts while the
  // banner is showing, and only flips the flag (no re-center) to avoid re-render churn.
  useEffect(() => {
    const mapPermRecheck = AppState.addEventListener("change", (state) => {
      if (state !== "active" || !locationOff) return;
      Location.getForegroundPermissionsAsync().then(({ status }) => {
        if (status === "granted") setLocationOff(false);
      }).catch(() => {});
    });
    return () => { mapPermRecheck.remove(); };
  }, [locationOff]);

  useFocusEffect(useCallback(() => {
    let active = true;
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          setLocationOff(false);
          // FAST PATH: use last-known position immediately so markers load in ~1s.
          const last = await Location.getLastKnownPositionAsync();
          if (last && active) {
            const lc = { lat: last.coords.latitude, lng: last.coords.longitude };
            setCoords(lc); loadIncidents(lc.lat, lc.lng); cache.setLoc(lc.lat, lc.lng);
          }
          // Refine with a precise fix in the background (does not block markers).
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (!active) return;
          const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setCoords(c);
          if (!last) loadIncidents(c.lat, c.lng);
          cache.setLoc(c.lat, c.lng);
          supabase.rpc("log_location", { p_lat: c.lat, p_lng: c.lng }).then(() => {});
          sub = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, distanceInterval: 15 },
            (p) => {
              if (!active) return;
              // coords feeds only map-centering and incident queries; the visible
              // position dot is the OS-native showsUserLocation (OS-smoothed). So we
              // just keep coords loosely current, discarding only clearly bad fixes.
              const acc = p.coords.accuracy;
              if (acc != null && acc > 100) return;
              setCoords({ lat: p.coords.latitude, lng: p.coords.longitude });
            }
          );
        } else { setLocationOff(true); loadIncidents(DEFAULT.lat, DEFAULT.lng); }
      } catch { loadIncidents(DEFAULT.lat, DEFAULT.lng); }
    })();
    supabase.from("risk_categories").select("id, display_name").eq("is_active", true)
      .order("base_severity", { ascending: false })
      .then(({ data }) => { if (data) setCategories(data.map((c) => ({ value: c.id, label: c.display_name }))); });
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const id = u.user?.id;
      if (!id) return;
      const { data } = await supabase.rpc("my_network_members", { p_owner: id });
      if (active && data) setMembers(data.map((m: any) => ({ member_id: m.member_id, display_name: m.display_name, avatar_url: m.avatar_url })));
    })();
    return () => { active = false; if (sub) sub.remove(); };
  }, [loadIncidents]));

  // Tap-and-reveal: one tap sets the point AND opens the reporting sheet.
  function onMapPress(e: any) {
    // Ignore taps that landed on a marker — those open the incident, not a report.
    if (e?.nativeEvent?.action === "marker-press") return;
    if (picked) return;
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setPicked({ lat: latitude, lng: longitude });
  }

  function closeSheet() { setPicked(null); }

  // Metres between two lat/lng points (haversine).
  function metresBetween(aLat: number, aLng: number, bLat: number, bLng: number) {
    const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
    const s = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  // Tapping an incident marker. If others are stacked within ~150 m of it, the ones
  // beneath are otherwise untappable, so open a chooser. If it stands alone, open it.
  function onIncidentPress(tapped: Incident) {
    const STACK_M = 150;
    const cluster = incidents.filter(
      (i) => metresBetween(tapped.latitude, tapped.longitude, i.latitude, i.longitude) <= STACK_M
    );
    if (cluster.length <= 1) {
      navigation.navigate("IncidentDetail", { incidentId: tapped.id });
    } else {
      setStackPick(cluster);
    }
  }
  function resetAll() { setPicked(null); setSelectedMembers([]); }
  function toggleMember(id: string) {
    setSelectedMembers((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }

  async function sendAlert() {
    if (!picked) return;
    if (!category) return showAlert({ title: "Pick a risk situation", tone: "error" });
    setSending(true);
    const { data: s } = await supabase.auth.getSession();
    try {
      const res = await fetch("https://aqgkntulbuqqqjxjafmw.supabase.co/functions/v1/submit-report", {
        method: "POST",
        headers: { Authorization: `Bearer ${s.session?.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          category_id: category, latitude: picked.lat, longitude: picked.lng,
          reported_severity: severity ?? undefined, evidence_path: evidencePath ?? undefined,
          notify_member_ids: selectedMembers.length > 0 ? selectedMembers : undefined,
        }),
      });
      const json = await res.json();
      setSending(false);
      if (!res.ok || !json.ok) return showAlert({ title: "Could not send", message: json.error ?? "Unknown error", tone: "error" });
      const inc = json.incident;
      showAlert({ title: "Alert sent", message: selectedMembers.length > 0 ? ("Your flag is live. " + selectedMembers.length + (selectedMembers.length === 1 ? " person you selected has" : " people you selected have") + " been notified.") : "Your flag is now live and being monitored in your area.", severity: (severity || "low") });
      resetAll(); setCategory(null); setSeverity(null); setEvidencePath(null);
      loadIncidents(coords.lat, coords.lng);
      fetch("https://aqgkntulbuqqqjxjafmw.supabase.co/functions/v1/send-push", {
        method: "POST",
        headers: { Authorization: `Bearer ${s.session?.access_token}`, "Content-Type": "application/json" },
      }).catch(() => {});
    } catch (e) { setSending(false); showAlert({ title: "Network error", message: String(e), tone: "error" }); }
  }

  const sheetBg = mode === "light" ? "#ffffff" : "#121419";
  const selectedNames = members.filter((m) => selectedMembers.includes(m.member_id)).map((m) => m.display_name ?? "FlagRisk user");

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top"]}>
      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFill}
          initialRegion={{ latitude: coords.lat, longitude: coords.lng, ...INITIAL_DELTA }}
          onPress={onMapPress}
          showsUserLocation
          followsUserLocation={false}
          showsMyLocationButton={false}
          toolbarEnabled={false}
          mapType={mapType}
          customMapStyle={mapType === "standard" && mode === "dark" ? DARK_MAP_STYLE : []}
        >
          {incidents.map((i) => {
            const dotColor = SEVERITY_COLORS[i.severity ?? ""] ?? "#ff5a5f";
            const confirmed = i.display_state === "confirmed";
            return (
              <Marker key={i.id} coordinate={{ latitude: i.latitude, longitude: i.longitude }} anchor={{ x: 0.5, y: 0.5 }}
                onPress={() => onIncidentPress(i)}>
                <View style={styles.incidentHit}>
                  <View style={[styles.incidentDot, { borderColor: dotColor }, confirmed ? { backgroundColor: dotColor } : { backgroundColor: "transparent" }]} />
                </View>
              </Marker>
            );
          })}
          {picked && (
            <Marker coordinate={{ latitude: picked.lat, longitude: picked.lng }} anchor={{ x: 0.5, y: 1 }}>
              <MapPin size={40} color="#2f6bff" fill="#2f6bff" strokeWidth={1.5} />
            </Marker>
          )}
        </MapView>
        {locationOff && (
          <Pressable onPress={enableLocation} style={[styles.locBanner, { backgroundColor: glass.surface, borderColor: glass.stroke }]}>
            <MapPinOff size={16} color={colors.accentOn} strokeWidth={2} />
            <Text style={[styles.locBannerText, { color: colors.text }]}>Location is off. Tap to enable and center the map on you.</Text>
          </Pressable>
        )}

        <Pressable onPress={() => setMapType((t) => (t === "standard" ? "hybrid" : "standard"))}
          style={[styles.mapTypeBtn, { backgroundColor: glass.surface, borderColor: glass.stroke }]}>
          <Layers size={20} color={mapType === "hybrid" ? colors.accentOn : colors.textMuted} strokeWidth={2} />
        </Pressable>
      </View>

      <View style={[styles.hint, { backgroundColor: glass.surface, borderTopColor: glass.stroke }]}>
        <Text style={[styles.hintText, { color: colors.textMuted }]}>
          {incidents.length === 0 ? "No risks flagged nearby." : `${incidents.length} risk${incidents.length > 1 ? "s" : ""} nearby.`}  Tap the map to flag a risk.
        </Text>
      </View>

      <Modal visible={!!picked} transparent animationType="slide" onRequestClose={closeSheet}>
        <Pressable style={styles.sheetBackdrop} onPress={closeSheet}>
          <Pressable style={[styles.sheet, { backgroundColor: sheetBg, borderColor: glass.stroke, paddingBottom: insets.bottom + spacing.lg }]} onPress={() => {}}>
            <View style={[styles.grabber, { backgroundColor: mode === "light" ? "rgba(0,0,0,0.20)" : "rgba(255,255,255,0.25)" }]} />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Alert Profiling</Text>
            <Text style={[styles.sheetLoc, { color: colors.textMuted }]}>{picked?.lat.toFixed(6)}, {picked?.lng.toFixed(6)}</Text>
            <ScrollView contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.md }}>
              <View style={styles.labelRow}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><TriangleAlert size={17} color={colors.accentOn} strokeWidth={2} /><Text style={[styles.label, { color: colors.text }]}>Risk Situation</Text></View>
                <Text style={[styles.hintSm, { color: colors.textFaint }]}>Seen publicly</Text>
              </View>
              <Dropdown placeholder="Select risk" value={category} options={categories} onSelect={setCategory} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Gauge size={17} color={colors.accentOn} strokeWidth={2} /><Text style={[styles.label, { color: colors.text }]}>Risk Severity</Text></View>
              <Dropdown placeholder="Select severity" value={severity} options={SEVERITIES} onSelect={setSeverity} colorMap={SEVERITY_COLORS} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Video size={17} color={colors.accentOn} strokeWidth={2} /><Text style={[styles.label, { color: colors.text }]}>Attach Live Capture</Text></View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable style={[styles.captureBtn, { borderColor: glass.stroke, backgroundColor: glass.surface }]} onPress={() =>
                  navigation.navigate("PhotoCapture", { onCaptured: (path) => setEvidencePath(path) })}>
                  <Text style={[styles.videoText, { color: evidencePath ? colors.accentOn : colors.textMuted }]}>Photo</Text>
                </Pressable>
                <Pressable style={[styles.captureBtn, { borderColor: glass.stroke, backgroundColor: glass.surface }]} onPress={() =>
                  navigation.navigate("VideoCapture", { onCaptured: (path) => setEvidencePath(path) })}>
                  <Text style={[styles.videoText, { color: evidencePath ? colors.accentOn : colors.textMuted }]}>Video</Text>
                </Pressable>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Users size={17} color={colors.accentOn} strokeWidth={2} /><Text style={[styles.label, { color: colors.text }]}>Alert Your Network</Text><Text style={[styles.hintSm, { color: colors.textFaint }]}> optional</Text></View>
              <Pressable style={[styles.videoRow, { borderColor: glass.stroke, backgroundColor: glass.surface }]} onPress={() => {
                if (members.length === 0) { showAlert({ title: "No network yet", message: "Add people to your network first to alert them." }); return; }
                if (picked) {
                  supabase.auth.getUser().then(({ data: u }) => {
                    const id = u.user?.id; if (!id) return;
                    supabase.rpc("network_reach_status", { p_owner: id, p_lat: picked.lat, p_lng: picked.lng })
                      .then(({ data }) => {
                        if (data) setMembers((cur) => cur.map((m) => {
                          const r = data.find((x: any) => x.member_id === m.member_id);
                          return r ? { ...m, within_reach: r.within_reach, has_location: r.has_location } : m;
                        }));
                      });
                  });
                }
                setMemberPickerOpen(true);
              }}>
                <Text style={[styles.videoText, { color: selectedMembers.length > 0 ? colors.accentOn : colors.textMuted }]}>
                  {selectedMembers.length === 0 ? "No one selected" : selectedNames.join(", ")}
                </Text>
              </Pressable>
            </ScrollView>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <Pressable style={[styles.cancelBtn, { borderColor: glass.strokeStrong, backgroundColor: glass.surface }]} onPress={closeSheet}>
                <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.sendWrap, sending && { opacity: 0.7 }]} onPress={sendAlert} disabled={sending}>
                <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.sendBtn, { boxShadow: glow.brand } as any]}>
                  <Text style={[styles.sendText, { color: colors.accentText }]}>{sending ? "Sending..." : "Send Alert"}</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={memberPickerOpen} transparent animationType="slide" onRequestClose={() => setMemberPickerOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setMemberPickerOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: sheetBg, borderColor: glass.stroke, paddingBottom: insets.bottom + spacing.xl + spacing.lg }]} onPress={() => {}}>
            <View style={[styles.grabber, { backgroundColor: mode === "light" ? "rgba(0,0,0,0.20)" : "rgba(255,255,255,0.25)" }]} />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Alert Your Network</Text>
            <Text style={[styles.sheetLoc, { color: colors.textMuted }]}>Tap to select who should also be alerted.</Text>
            <ScrollView contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}>
              {members.map((m) => {
                const on = selectedMembers.includes(m.member_id);
                const ac = avatarColor(m.member_id);
                return (
                  <Pressable key={m.member_id} onPress={() => toggleMember(m.member_id)}
                    style={[styles.memberRow, { borderColor: on ? colors.accentOn : glass.stroke, backgroundColor: glass.surface }]}>
                    <Avatar uri={m.avatar_url} name={m.display_name} id={m.member_id} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.mName, { color: colors.text }]}>{m.display_name ?? "FlagRisk user"}</Text>
                      {m.within_reach === false && <Text style={[styles.outOfRange, { color: colors.danger }]}>Beyond your tier range</Text>}
                    </View>
                    <View style={[styles.checkBox, { borderColor: on ? colors.accentOn : glass.strokeStrong, backgroundColor: on ? colors.accentOn : "transparent" }]}>
                      {on && <Check size={14} color={colors.accentText} strokeWidth={3} />}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable style={styles.sendWrap} onPress={() => {
              const blocked = members.filter((m) => selectedMembers.includes(m.member_id) && m.within_reach === false);
              if (blocked.length > 0) {
                showAlert({
                  title: "Some contacts are out of range",
                  message: blocked.map((m) => m.display_name ?? "A contact").join(", ") + (blocked.length === 1 ? " is" : " are") + " beyond your tier's alert radius, so they will not receive this. Upgrade to widen your reach.",
                  buttons: [
                    { text: "Keep anyway", style: "cancel", onPress: () => setMemberPickerOpen(false) },
                    { text: "Upgrade", onPress: () => { setMemberPickerOpen(false); navigation.navigate("PlanPricing"); } },
                  ],
                });
                return;
              }
              setMemberPickerOpen(false);
            }}>
              <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.sendBtn, { boxShadow: glow.brand } as any]}>
                <Text style={[styles.sendText, { color: colors.accentText }]}>{selectedMembers.length === 0 ? "Done" : `Alert ${selectedMembers.length} selected`}</Text>
              </LinearGradient>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!stackPick} transparent animationType="slide" onRequestClose={() => setStackPick(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setStackPick(null)}>
          <Pressable style={[styles.sheet, { backgroundColor: sheetBg, borderColor: glass.stroke, paddingBottom: insets.bottom + spacing.xl + spacing.lg }]} onPress={() => {}}>
            <View style={[styles.grabber, { backgroundColor: mode === "light" ? "rgba(0,0,0,0.20)" : "rgba(255,255,255,0.25)" }]} />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>{(stackPick?.length ?? 0)} incidents here</Text>
            <Text style={[styles.sheetLoc, { color: colors.textMuted }]}>Several reports are at this spot. Choose one to view.</Text>
            <ScrollView contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}>
              {(stackPick ?? []).map((i) => {
                const dc = SEVERITY_COLORS[i.severity ?? ""] ?? "#ff5a5f";
                const label = (i.category_id ?? "incident").replace(/_/g, " ");
                return (
                  <Pressable key={i.id}
                    onPress={() => { setStackPick(null); navigation.navigate("IncidentDetail", { incidentId: i.id }); }}
                    style={[styles.memberRow, { borderColor: glass.stroke, backgroundColor: glass.surface }]}>
                    <View style={[styles.incidentDot, { borderColor: dc, backgroundColor: i.display_state === "confirmed" ? dc : "transparent" }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.mName, { color: colors.text, textTransform: "capitalize" }]}>{label}</Text>
                      <Text style={[styles.outOfRange, { color: colors.textMuted, textTransform: "capitalize" }]}>
                        {(i.severity ?? "unknown")}{i.display_state ? " - " + i.display_state.replace(/_/g, " ") : ""}
                      </Text>
                    </View>
                    <TriangleAlert size={18} color={dc} strokeWidth={2} />
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  mapWrap: { flex: 1, overflow: "hidden" },
  mapTypeBtn: { position: "absolute", top: spacing.md, right: spacing.md, width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  locBanner: { position: "absolute", top: spacing.md, left: spacing.md, right: 64, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12 },
  locBannerText: { flex: 1, fontSize: 12.5, fontWeight: "600" },
  incidentHit: { width: 56, height: 56, alignItems: "center", justifyContent: "center" },
  incidentDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 3 },
  hint: { borderTopWidth: 1, padding: spacing.md },
  hintText: { fontSize: 13, textAlign: "center" },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md, maxHeight: "85%" },
  grabber: { width: 44, height: 5, borderRadius: 3, alignSelf: "center", marginBottom: spacing.md },
  sheetTitle: { fontSize: 20, fontWeight: "800", textAlign: "center" },
  sheetLoc: { fontSize: 13, textAlign: "center", marginTop: 4, marginBottom: spacing.md },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { fontSize: 16, fontWeight: "700" },
  hintSm: { fontSize: 12 },
  captureBtn: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  videoRow: { minHeight: 52, borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  videoText: { fontSize: 14, textAlign: "center" },
  cancelBtn: { flex: 1, height: 56, borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  cancelText: { fontSize: 16, fontWeight: "700" },
  sendWrap: { flex: 2, borderRadius: radius.md },
  sendBtn: { height: 56, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  sendText: { fontSize: 16, fontWeight: "800" },
  memberRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  mAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  mAvatarText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  mName: { fontSize: 16, fontWeight: "600" },
  outOfRange: { fontSize: 12, marginTop: 2, fontWeight: "600" },
  checkBox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});











