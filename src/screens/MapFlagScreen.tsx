// ============================================================================
// Map and flag - FlagRisk v2.1
//
// STRUCTURAL DECISIONS, each made because the obvious version failed:
//  1. ONE Modal with a mode, not four siblings. Android cannot reliably show a
//     second Modal while the first is visible, which is why the network picker
//     did not open until a tester cancelled back to the map and returned.
//  2. The confirmation reports what the ENGINE decided, not what the reporter
//     selected. A user could pick High and find Low on the incident.
//  3. Marker taps are guarded by a timestamp, not by nativeEvent.action, which
//     Android does not always set. Without it, tapping an incident opened the
//     report sheet instead.
//  4. Every incident is plotted, at any distance. NEAREST_RADIUS_KM applies only
//     to the Low, Mid and High pills, which fly to the closest of that level.
//  5. Reporting is capped at REPORT_RADIUS_M from where you are, enforced again
//     in ingest_report so the client is not the only thing holding the rule.
//
// KNOWN LIMIT, unchanged: one evidence slot. Attaching a video after a photo
// replaces it. The report record carries a single media_url, so fixing this is
// a schema change, not a screen change. The interface says so.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import {
  TriangleAlert, Gauge, Camera, Video as VideoIcon, Layers, MapPin, MapPinOff,
  Users, Check, X, Paperclip, ArrowLeft, LocateFixed, Plus, MessageSquare, Siren,
} from "lucide-react-native";
import { Image } from "react-native";
import { supabase } from "../../lib/supabase";
import { showAlert } from "../components/Feedback";
import { useRiskCache } from "../theme/RiskCache";
import { Dropdown, Option } from "../components/Dropdown";
import { Avatar } from "../components/Avatar";
import { colors, radius, spacing, type, elevation } from "../theme";

type Incident = {
  id: string; category_id: string; latitude: number; longitude: number;
  status: string; severity?: string; display_state?: string;
};
type Pt = { lat: number; lng: number };
type Member = {
  member_id: string; display_name: string | null; avatar_url?: string | null;
  within_reach?: boolean; has_location?: boolean; can_nudge?: boolean;
};
type SheetMode = "none" | "profile" | "members" | "stack" | "incident";

const SEVERITIES: Option[] = [
  { value: "low", label: "Low" }, { value: "moderate", label: "Moderate" },
  { value: "high", label: "High" }, { value: "critical", label: "Critical" },
];
const SEVERITY_COLORS: Record<string, string> = {
  low: colors.riskLow, moderate: colors.riskMedium, high: colors.riskHigh, critical: "#C0392B",
};
const DEFAULT = { lat: 9.0765, lng: 7.3986 };

// Reporting proximity rule: you may only flag a risk you are standing near.
const REPORT_RADIUS_M = 100;

// The map shows every risk, however far. This cap applies to the Low, Mid and
// High pills only: they surface the nearest of that level around you rather than
// flying to one in another state.
const NEAREST_RADIUS_KM = 10;

// Silvery map: desaturated, light, low contrast so incident markers carry the
// only strong colour on the surface.
const SILVER_MAP_STYLE = [
  // Still silvery, but legible. The ground drops to #E8EAEE so the white roads
  // sit ten levels above it rather than three, and every stroke and label is
  // dark enough to read at arm's length in daylight.
  { elementType: "geometry", stylers: [{ color: "#E8EAEE" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#5F666E" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#B4BCC5" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "poi", stylers: [{ visibility: "simplified" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#D5E4D8" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#C7CDD5" }] },
  { featureType: "road.local", elementType: "geometry", stylers: [{ color: "#FAFBFC" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#AEB6C0" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#C4D6E6" }] },
];

const ANCHORS: { key: "low" | "moderate" | "high"; label: string }[] = [
  { key: "low", label: "Low" }, { key: "moderate", label: "Mid" }, { key: "high", label: "High" },
];
const INITIAL_DELTA = { latitudeDelta: 0.0045, longitudeDelta: 0.0045 };

function levelWords(level: string | null | undefined) {
  if (level === "push") return "Your flag is live and people nearby are being alerted.";
  if (level === "in_app") return "Your flag is live and will show in the app for people nearby.";
  return "Your flag is on the map. It will alert people once someone else confirms it.";
}

export function MapFlagScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const mapRef = useRef<MapView>(null);
  const focusedOnce = useRef<string | null>(null);
  const didCenter = useRef(false);
  const insets = useSafeAreaInsets();
  const cache = useRiskCache();

  const [coords, setCoords] = useState(cache.loc ?? DEFAULT);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [locationOff, setLocationOff] = useState(false);
  const [nudging, setNudging] = useState<string | null>(null);
  const [mapType, setMapType] = useState<"standard" | "hybrid">("standard");

  const [picked, setPicked] = useState<Pt | null>(null);
  const [mode, setMode] = useState<SheetMode>("none");
  const [categories, setCategories] = useState<Option[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [severity, setSeverity] = useState<string | null>(null);
  const [evidencePath, setEvidencePath] = useState<string | null>(null);
  const [evidenceKind, setEvidenceKind] = useState<"photo" | "video" | null>(null);
  const [sending, setSending] = useState(false);

  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [stackPick, setStackPick] = useState<Incident[] | null>(null);
  const [openIncident, setOpenIncident] = useState<Incident | null>(null);
  const [incidentMedia, setIncidentMedia] = useState<string | null>(null);
  const markerTapAt = useRef(0);

  const loadIncidents = useCallback(async (_lat: number, _lng: number) => {
    const { data } = await supabase.rpc("incidents_all");
    if (data) setIncidents(data);
  }, []);

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
        Linking.openSettings();
      }
    } catch (_e) {}
  }, [loadIncidents]);

  useEffect(() => {
    if (didCenter.current) return;
    if (coords.lat === DEFAULT.lat && coords.lng === DEFAULT.lng) return;
    didCenter.current = true;
    mapRef.current?.animateToRegion({ latitude: coords.lat, longitude: coords.lng, ...INITIAL_DELTA }, 600);
  }, [coords]);

  useEffect(() => {
    const recheck = AppState.addEventListener("change", (state) => {
      if (state !== "active" || !locationOff) return;
      Location.getForegroundPermissionsAsync().then(({ status }) => {
        if (status === "granted") setLocationOff(false);
      }).catch(() => {});
    });
    return () => { recheck.remove(); };
  }, [locationOff]);

  useFocusEffect(useCallback(() => {
    let active = true;
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          setLocationOff(false);
          const last = await Location.getLastKnownPositionAsync();
          if (last && active) {
            const lc = { lat: last.coords.latitude, lng: last.coords.longitude };
            setCoords(lc); loadIncidents(lc.lat, lc.lng); cache.setLoc(lc.lat, lc.lng);
          }
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
              const acc = p.coords.accuracy;
              if (acc != null && acc > 100) return;
              setCoords({ lat: p.coords.latitude, lng: p.coords.longitude });
            }
          );
        } else { setLocationOff(true); loadIncidents(DEFAULT.lat, DEFAULT.lng); }
      } catch { loadIncidents(DEFAULT.lat, DEFAULT.lng); }
    })();
    supabase.from("risk_categories").select("id, display_name").eq("is_active", true)
      .order("display_name", { ascending: true })
      .then(({ data }) => { if (data) setCategories(data.map((c) => ({ value: c.id, label: c.display_name }))); });
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const id = u.user?.id;
      if (!id) return;
      const { data } = await supabase.rpc("my_network_members", { p_owner: id });
      if (active && data) setMembers((data as any[]).map((m) => ({
        member_id: m.member_id, display_name: m.display_name, avatar_url: m.avatar_url,
      })));
    })();
    return () => { active = false; if (sub) sub.remove(); };
  }, [loadIncidents]));

  // Android fires the map's onPress for marker taps too, and the action field is
  // not always set, which is why tapping an incident used to open the report
  // sheet. A short guard after any marker tap settles it.
  // Arriving from an incident: centre on it and open its sheet, once per id, so
  // returning to the tab later does not keep re-opening the same one.
  useEffect(() => {
    const p = route.params || {};
    if (p.focusLat == null || p.focusLng == null) return;
    if (focusedOnce.current === p.focusId) return;
    focusedOnce.current = p.focusId ?? "point";
    mapRef.current?.animateToRegion(
      { latitude: p.focusLat, longitude: p.focusLng, ...INITIAL_DELTA }, 600);
    if (p.focusId) {
      const hit = incidents.find((i) => i.id === p.focusId);
      if (hit) setTimeout(() => openSheetFor(hit), 650);
    }
  }, [route.params, incidents]);

  function onMapPress(e: any) {
    if (e?.nativeEvent?.action === "marker-press") return;
    if (Date.now() - markerTapAt.current < 400) return;
    if (picked) return;
    const { latitude, longitude } = e.nativeEvent.coordinate;
    startReportAt(latitude, longitude);
  }

  function startReportAt(lat: number, lng: number) {
    const away = metresBetween(coords.lat, coords.lng, lat, lng);
    if (locationOff) {
      showAlert({
        title: "Location needed",
        message: "Switch your location on before flagging a risk. You can only report what is around you.",
        tone: "error",
      });
      return;
    }
    if (away > REPORT_RADIUS_M) {
      showAlert({
        title: "Too far to report",
        message: "You can only flag a risk you are at. That spot is about " + Math.round(away) +
          " metres away, and the limit is " + REPORT_RADIUS_M + " metres.",
        tone: "error",
      });
      return;
    }
    setPicked({ lat, lng });
    setMode("profile");
  }

  function closeSheet() { setMode("none"); setPicked(null); setOpenIncident(null); setIncidentMedia(null); }

  function prettyDistance(m: number) {
    if (m < 950) return Math.round(m / 10) * 10 + " m away";
    return (m / 1000).toFixed(1) + " km away";
  }

  function metresBetween(aLat: number, aLng: number, bLat: number, bLng: number) {
    const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
    const s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  // Same source and same order as the incident screen: video first, then
  // verified, then newest. The two surfaces cannot disagree.
  async function loadIncidentMedia(id: string) {
    setIncidentMedia(null);
    try {
      const { data } = await supabase.rpc("incident_media", { p_incident: id });
      const row = Array.isArray(data) && data[0] ? data[0] : null;
      if (!row || !row.media_url) return;
      const signed = await supabase.storage.from("report-evidence").createSignedUrl(row.media_url, 3600);
      if (signed.data) setIncidentMedia(signed.data.signedUrl);
    } catch (_e) {}
  }

  function openSheetFor(i: Incident) {
    setOpenIncident(i);
    setMode("incident");
    loadIncidentMedia(i.id);
  }

  function onIncidentPress(tapped: Incident) {
    markerTapAt.current = Date.now();
    const STACK_M = 150;
    const cluster = incidents.filter(
      (i) => metresBetween(tapped.latitude, tapped.longitude, i.latitude, i.longitude) <= STACK_M
    );
    if (cluster.length <= 1) {
      openSheetFor(tapped);
    } else {
      setStackPick(cluster);
      setMode("stack");
    }
  }

  // The anchors are navigation, not decoration: each one flies to the closest
  // incident of that level and opens it.
  function goToNearest(level: "low" | "moderate" | "high") {
    const pool = incidents
      .filter((i) => {
        const sev = i.severity === "critical" ? "high" : (i.severity ?? "low");
        if (sev !== level || i.latitude == null || i.longitude == null) return false;
        return metresBetween(coords.lat, coords.lng, i.latitude, i.longitude) <= NEAREST_RADIUS_KM * 1000;
      })
      .map((i) => ({ i, m: metresBetween(coords.lat, coords.lng, i.latitude, i.longitude) }))
      .sort((a, b) => a.m - b.m);
    if (pool.length === 0) {
      showAlert({
        title: "Nothing at that level",
        message: "There is no " + (level === "moderate" ? "medium" : level) +
          " risk reported within " + NEAREST_RADIUS_KM + " km of you right now.",
      });
      return;
    }
    const target = pool[0].i;
    mapRef.current?.animateToRegion({
      latitude: target.latitude, longitude: target.longitude, ...INITIAL_DELTA,
    }, 600);
    setTimeout(() => openSheetFor(target), 650);
  }

  function toggleMember(id: string) {
    setSelectedMembers((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.concat([id])));
  }

  function openMemberPicker() {
    if (members.length === 0) {
      showAlert({ title: "No network yet", message: "Add people to your network first to alert them." });
      return;
    }
    if (picked) {
      supabase.auth.getUser().then(({ data: u }) => {
        const id = u.user?.id;
        if (!id) return;
        supabase.rpc("network_reach_status", { p_owner: id, p_lat: picked.lat, p_lng: picked.lng })
          .then(({ data }) => {
            if (data) setMembers((cur) => cur.map((m) => {
              const r = (data as any[]).find((x) => x.member_id === m.member_id);
              return r ? { ...m, within_reach: r.within_reach, has_location: r.has_location, can_nudge: r.can_nudge } : m;
            }));
          });
      });
    }
    setMode("members");
  }

  // A member with no recent fix is unreachable on any plan. Rather than a dead
  // row, the person trying to reach them can ask them to turn location on.
  async function nudge(m: Member) {
    if (nudging) return;
    setNudging(m.member_id);
    const { data, error } = await supabase.rpc("nudge_network_member", { p_member: m.member_id });
    setNudging(null);
    if (error) {
      return showAlert({ title: "Could not send", message: "Please try again.", tone: "error" });
    }
    const r = data && (data as any).reason;
    if (data && (data as any).ok) {
      return showAlert({
        title: "Nudge sent",
        message: (m.display_name ?? "They") + " has been asked to turn location on.",
      });
    }
    showAlert({
      title: "Not sent",
      message:
        r === "already_nudged" ? "They were nudged in the last day. Try again tomorrow."
        : r === "no_push_token" ? "They cannot be reached until they open FlagRisk again."
        : "They are no longer in your network.",
      tone: "error",
    });
  }

  async function sendAlert() {
    if (!picked) return;
    if (!category) return showAlert({ title: "Pick a risk situation", tone: "error" });
    setSending(true);
    const { data: s } = await supabase.auth.getSession();
    const token = s.session ? s.session.access_token : null;
    try {
      const res = await fetch("https://aqgkntulbuqqqjxjafmw.supabase.co/functions/v1/submit-report", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({
          category_id: category, latitude: picked.lat, longitude: picked.lng,
          reported_severity: severity ?? undefined, evidence_path: evidencePath ?? undefined,
          notify_member_ids: selectedMembers.length > 0 ? selectedMembers : undefined,
        }),
      });
      const json = await res.json();
      setSending(false);
      if (!res.ok || !json.ok) {
        return showAlert({ title: "Could not send", message: json.error ?? "Unknown error", tone: "error" });
      }
      // Report what the engine decided, not what the reporter selected.
      const inc = json.incident;
      const notified = selectedMembers.length > 0
        ? " " + selectedMembers.length + (selectedMembers.length === 1 ? " person you selected has" : " people you selected have") + " been notified."
        : "";
      showAlert({ title: "Flag sent", message: levelWords(inc ? inc.alert_level : null) + notified });
      closeSheet();
      setSelectedMembers([]); setCategory(null); setSeverity(null);
      setEvidencePath(null); setEvidenceKind(null);
      loadIncidents(coords.lat, coords.lng);
      fetch("https://aqgkntulbuqqqjxjafmw.supabase.co/functions/v1/send-push", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      }).catch(() => {});
    } catch (e) {
      setSending(false);
      showAlert({ title: "Network error", message: String(e), tone: "error" });
    }
  }

  const plotted = incidents.filter((i) => i.latitude != null && i.longitude != null);

  const selectedNames = members
    .filter((m) => selectedMembers.includes(m.member_id))
    .map((m) => m.display_name ?? "FlagRisk user");

  const Label = ({ Icon, children, hint }: { Icon: any; children: string; hint?: string }) => (
    <View style={styles.labelRow}>
      <Icon size={16} color={colors.ink} strokeWidth={2} />
      <Text style={styles.label}>{children}</Text>
      {hint ? <Text style={styles.labelHint}>{hint}</Text> : null}
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={StyleSheet.absoluteFill}>
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
          customMapStyle={mapType === "standard" ? SILVER_MAP_STYLE : []}
        >
          {plotted.map((i) => {
            const dot = SEVERITY_COLORS[i.severity ?? ""] ?? colors.riskHigh;
            const confirmed = i.display_state === "confirmed";
            return (
              <Marker
                key={i.id}
                coordinate={{ latitude: i.latitude, longitude: i.longitude }}
                anchor={{ x: 0.5, y: 0.5 }}
                onPress={() => onIncidentPress(i)}
              >
                <View style={styles.incidentHit}>
                  <View style={[
                    styles.incidentDot,
                    { borderColor: dot, backgroundColor: confirmed ? dot : "#FFFFFF" },
                  ]} />
                </View>
              </Marker>
            );
          })}
          {picked ? (
            <Marker coordinate={{ latitude: picked.lat, longitude: picked.lng }} anchor={{ x: 0.5, y: 1 }}>
              <MapPin size={38} color={colors.ink} fill={colors.accent} strokeWidth={1.6} />
            </Marker>
          ) : null}
        </MapView>
      </View>

      <SafeAreaView style={styles.overlay} edges={["top"]} pointerEvents="box-none">
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.headBtnPlain} hitSlop={8}>
            <ArrowLeft size={20} color={colors.ink} strokeWidth={2} />
          </Pressable>
          <Text style={styles.headTitle}>LiveMap</Text>
          <Pressable
            onPress={() => mapRef.current?.animateToRegion(
              { latitude: coords.lat, longitude: coords.lng, ...INITIAL_DELTA }, 500)}
            style={styles.headBtnFilled}
            hitSlop={8}
          >
            <LocateFixed size={18} color={colors.ink} strokeWidth={2} />
          </Pressable>
        </View>

        <View style={styles.anchorRow}>
          {ANCHORS.map((a) => {
            return (
              <Pressable key={a.key} onPress={() => goToNearest(a.key)} style={styles.anchor}>
                <View style={[styles.anchorRing, { borderColor: SEVERITY_COLORS[a.key] }]}>
                  <View style={[styles.anchorDot, { backgroundColor: SEVERITY_COLORS[a.key] }]} />
                </View>
                <Text style={styles.anchorText}>{a.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {locationOff ? (
          <Pressable onPress={enableLocation} style={styles.locBanner}>
            <MapPinOff size={15} color={colors.ink} strokeWidth={2} />
            <Text style={styles.locBannerText}>Location is off. Tap to switch it on and centre the map.</Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => setMapType((t) => (t === "standard" ? "hybrid" : "standard"))}
          style={styles.mapTypeBtn}
        >
          <Layers size={19} color={mapType === "hybrid" ? colors.ink : colors.textMuted} strokeWidth={2} />
        </Pressable>
      </SafeAreaView>

      <Pressable
        style={[styles.reportFab, { bottom: insets.bottom + 108 }]}
        onPress={() => startReportAt(coords.lat, coords.lng)}
        hitSlop={10}
      >
        <Plus size={26} color={colors.accent} strokeWidth={2.6} />
      </Pressable>

      <View style={[styles.hint, { bottom: insets.bottom + 112 }]} pointerEvents="none">
        <Text style={styles.hintText}>
          {plotted.length} risk{plotted.length === 1 ? "" : "s"} nearby this current location.
          Tap a coloured marker to open a risk report. Clicking the + button initiates a report
          where you are. You must be within {REPORT_RADIUS_M} metres of a place to report a risk there.
        </Text>
      </View>

      <Modal
        visible={mode !== "none"}
        transparent
        animationType="slide"
        onRequestClose={() => (mode === "profile" || mode === "incident" ? closeSheet() : setMode(picked ? "profile" : "none"))}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => (mode === "profile" || mode === "incident" ? closeSheet() : setMode(picked ? "profile" : "none"))}
        >
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} onPress={() => {}}>
            <View style={styles.grabber} />

            {mode === "profile" ? (
              <>
                <Text style={styles.sheetTitle}>Alert profiling</Text>
                <Text style={styles.sheetSub}>
                  {picked ? picked.lat.toFixed(5) + ", " + picked.lng.toFixed(5) : ""}
                </Text>

                <ScrollView contentContainerStyle={{ paddingBottom: spacing.md }} showsVerticalScrollIndicator={false}>
                  <Label Icon={TriangleAlert} hint="Seen publicly">Risk situation</Label>
                  <Dropdown placeholder="Select risk" value={category} options={categories} onSelect={setCategory} />

                  <Label Icon={Gauge}>Risk severity</Label>
                  <Dropdown placeholder="Select severity" value={severity} options={SEVERITIES} onSelect={setSeverity} colorMap={SEVERITY_COLORS} />
                  <Text style={styles.note}>
                    Your severity is one input. The published level also depends on how many people
                    confirm it and how close and recent it is.
                  </Text>

                  <Label Icon={Paperclip} hint="one item">Attach evidence</Label>
                  {evidencePath ? (
                    <View style={styles.attached}>
                      {evidenceKind === "video"
                        ? <VideoIcon size={17} color={colors.ink} strokeWidth={2} />
                        : <Camera size={17} color={colors.ink} strokeWidth={2} />}
                      <Text style={styles.attachedText}>
                        {evidenceKind === "video" ? "Video attached" : "Photo attached"}
                      </Text>
                      <Pressable
                        onPress={() => { setEvidencePath(null); setEvidenceKind(null); }}
                        hitSlop={10}
                      >
                        <X size={17} color={colors.riskHigh} strokeWidth={2} />
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.captureRow}>
                      <Pressable
                        style={styles.captureBtn}
                        onPress={() => navigation.navigate("PhotoCapture", {
                          onCaptured: (path: string) => { setEvidencePath(path); setEvidenceKind("photo"); },
                        })}
                      >
                        <Camera size={17} color={colors.ink} strokeWidth={2} />
                        <Text style={styles.captureText}>Photo</Text>
                      </Pressable>
                      <Pressable
                        style={styles.captureBtn}
                        onPress={() => navigation.navigate("VideoCapture", {
                          onCaptured: (path: string) => { setEvidencePath(path); setEvidenceKind("video"); },
                        })}
                      >
                        <VideoIcon size={17} color={colors.ink} strokeWidth={2} />
                        <Text style={styles.captureText}>Video</Text>
                      </Pressable>
                    </View>
                  )}

                  <Label Icon={Users} hint="optional">Alert your network</Label>
                  <Pressable style={styles.pickerRow} onPress={openMemberPicker}>
                    <Text style={[styles.pickerText, selectedMembers.length === 0 && { color: "#8B8F96" }]} numberOfLines={1}>
                      {selectedMembers.length === 0 ? "No one selected" : selectedNames.join(", ")}
                    </Text>
                  </Pressable>
                </ScrollView>

                <View style={styles.actions}>
                  <Pressable style={styles.ghostBtn} onPress={closeSheet}>
                    <Text style={styles.ghostText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.sendBtn, { flex: 1, marginTop: 0 }, sending && { opacity: 0.7 }]}
                    onPress={sendAlert}
                    disabled={sending}
                  >
                    <Text style={styles.sendText}>{sending ? "Sending" : "Send flag"}</Text>
                  </Pressable>
                </View>
              </>
            ) : mode === "members" ? (
              <>
                <Text style={styles.sheetTitle}>Alert your network</Text>
                <Text style={styles.sheetSub}>Tap to choose who should also be alerted.</Text>
                <ScrollView contentContainerStyle={{ paddingBottom: spacing.md }} showsVerticalScrollIndicator={false}>
                  {members.map((m) => {
                    const on = selectedMembers.includes(m.member_id);
                    return (
                      <Pressable key={m.member_id} onPress={() => toggleMember(m.member_id)} style={styles.memberRow}>
                        <Avatar uri={m.avatar_url} name={m.display_name} id={m.member_id} size={40} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.mName} numberOfLines={1}>{m.display_name ?? "FlagRisk user"}</Text>
                          {m.within_reach === false ? (
                            <Text style={styles.outOfRange}>
                              {m.has_location === false
                                ? "This user is inactive"
                                : "Beyond your plan range"}
                            </Text>
                          ) : null}
                        </View>
                        {m.within_reach === false && m.has_location === false && m.can_nudge ? (
                          <Pressable
                            onPress={() => nudge(m)}
                            disabled={nudging === m.member_id}
                            style={[styles.nudgeBtn, nudging === m.member_id && { opacity: 0.5 }]}
                            hitSlop={8}
                          >
                            <Text style={styles.nudgeText}>
                              {nudging === m.member_id ? "Sending" : "Nudge"}
                            </Text>
                          </Pressable>
                        ) : (
                          <View style={[styles.tick, on && styles.tickOn]}>
                            {on ? <Check size={14} color={colors.accent} strokeWidth={3} /> : null}
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <Pressable
                  style={[styles.confirmPick, { marginTop: spacing.md }]}
                  onPress={() => {
                    const chosen = members.filter((m) => selectedMembers.includes(m.member_id));
                    const inactive = chosen.filter((m) => m.within_reach === false && m.has_location === false);
                    const tooFar = chosen.filter((m) => m.within_reach === false && m.has_location !== false);

                    // Two different problems. Offering an upgrade for an
                    // inactive member would be selling a plan that cannot fix it.
                    if (inactive.length > 0) {
                      showAlert({
                        title: inactive.length === 1 ? "This user is inactive" : "Some contacts are inactive",
                        message: inactive.map((m) => m.display_name ?? "A contact").join(", ") +
                          (inactive.length === 1 ? " has" : " have") +
                          " not shared a location recently, so they cannot be alerted. Nudge them to turn location on.",
                        buttons: [{ text: "Got it", onPress: () => setMode("members") }],
                      });
                      return;
                    }
                    if (tooFar.length > 0) {
                      showAlert({
                        title: "Some contacts are out of range",
                        message: tooFar.map((m) => m.display_name ?? "A contact").join(", ") +
                          (tooFar.length === 1 ? " is" : " are") +
                          " beyond your plan's alert radius, so they will not receive this. Upgrade to widen your reach.",
                        buttons: [
                          { text: "Keep anyway", style: "cancel", onPress: () => setMode("profile") },
                          { text: "Upgrade", onPress: () => { closeSheet(); navigation.navigate("PlanPricing"); } },
                        ],
                      });
                      return;
                    }
                    setMode("profile");
                  }}
                >
                  <Text style={styles.confirmPickText}>
                    {selectedMembers.length === 0 ? "Done" : "Alert " + selectedMembers.length + " selected"}
                  </Text>
                </Pressable>
              </>
            ) : mode === "incident" ? (
              <>
                {incidentMedia ? (
                  <Image source={{ uri: incidentMedia }} style={styles.incMedia} resizeMode="cover" />
                ) : (
                  <View style={[styles.incMedia, styles.incMediaEmpty]}>
                    <TriangleAlert size={26} color={colors.textFaint} strokeWidth={1.8} />
                    <Text style={styles.incNoMedia}>No media was supplied</Text>
                  </View>
                )}

                <View style={styles.incHead}>
                  <Text style={styles.incTitle} numberOfLines={1}>
                    {(openIncident?.category_id ?? "incident").replace(/_/g, " ")}
                  </Text>
                  <Text style={styles.incPct}>
                    {openIncident?.display_state === "confirmed" ? "Confirmed" : "Reported"}
                  </Text>
                </View>
                <Text style={styles.incMeta}>
                  {openIncident
                    ? prettyDistance(metresBetween(coords.lat, coords.lng, openIncident.latitude, openIncident.longitude))
                    : ""}
                </Text>

                <View style={styles.incActions}>
                  <Pressable
                    style={styles.incGhost}
                    onPress={() => { setMode("none"); navigation.navigate("Panic"); }}
                  >
                    <Siren size={17} color={colors.riskHigh} strokeWidth={2} />
                    <Text style={[styles.incGhostText, { color: colors.riskHigh }]}>Panic</Text>
                  </Pressable>
                  <Pressable
                    style={styles.incSolid}
                    onPress={() => {
                      const id = openIncident?.id;
                      setMode("none");
                      if (id) navigation.navigate("IncidentDetail", { incidentId: id });
                    }}
                  >
                    <MessageSquare size={17} color={colors.accent} strokeWidth={2} />
                    <Text style={styles.incSolidText}>Details and comments</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.sheetTitle}>{(stackPick?.length ?? 0)} incidents here</Text>
                <Text style={styles.sheetSub}>Several reports are at this spot. Choose one to view.</Text>
                <ScrollView contentContainerStyle={{ paddingBottom: spacing.md }} showsVerticalScrollIndicator={false}>
                  {(stackPick ?? []).map((i) => {
                    const dot = SEVERITY_COLORS[i.severity ?? ""] ?? colors.riskHigh;
                    const label = (i.category_id ?? "incident").replace(/_/g, " ");
                    return (
                      <Pressable
                        key={i.id}
                        style={styles.stackRow}
                        onPress={() => { setStackPick(null); openSheetFor(i); }}
                      >
                        <View style={[styles.stackDot, { backgroundColor: dot }]} />
                        <Text style={styles.stackLabel} numberOfLines={1}>{label}</Text>
                        <Text style={styles.stackState}>{i.display_state === "confirmed" ? "Confirmed" : "Reported"}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  overlay: { position: "absolute", top: 0, left: 0, right: 0 },

  header: {
    height: 36, flexDirection: "row", alignItems: "center",
    marginHorizontal: spacing.gutter, marginTop: spacing.md,
  },
  headBtnPlain: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg,
    alignItems: "center", justifyContent: "center", ...elevation.hairline,
  },
  headBtnFilled: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg,
    alignItems: "center", justifyContent: "center", ...elevation.hairline,
  },
  headTitle: { flex: 1, ...type.heading, color: colors.ink, textAlign: "center" },

  anchorRow: { flexDirection: "row", justifyContent: "center", gap: spacing.sm, marginTop: spacing.md },
  anchor: {
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: colors.bg, borderRadius: 5,
    paddingLeft: 10, paddingRight: 14, paddingVertical: 8, ...elevation.card,
  },
  anchorRing: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  anchorDot: { width: 7, height: 7, borderRadius: 4 },
  anchorText: { ...type.label, fontWeight: "600", color: colors.ink },

  reportFab: {
    position: "absolute", right: spacing.gutter,
    width: 60, height: 60, borderRadius: 30, backgroundColor: colors.ink,
    alignItems: "center", justifyContent: "center", ...elevation.sheet,
  },

  incMedia: { width: "100%", height: 190, borderRadius: radius.md, backgroundColor: "#F0F0F0" },
  incMediaEmpty: { alignItems: "center", justifyContent: "center", gap: 8 },
  incNoMedia: { ...type.caption, color: colors.textMuted },
  incHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md },
  incTitle: { ...type.heading, color: colors.ink, textTransform: "capitalize", flex: 1 },
  incPct: { ...type.label, fontWeight: "600", color: colors.textMuted },
  incMeta: { ...type.caption, color: colors.textMuted, marginTop: 4 },
  incActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  incGhost: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.riskHigh,
  },
  incGhostText: { ...type.label, fontWeight: "600" },
  incSolid: {
    flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    height: 52, borderRadius: radius.md, backgroundColor: "#F7F7F7", borderWidth: 1, borderColor: "rgba(20,21,42,0.10)",
  },
  incSolidText: { ...type.label, fontWeight: "600", color: colors.ink },

  locBanner: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.bg, borderRadius: radius.md,
    marginHorizontal: spacing.gutter, marginTop: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: 12, ...elevation.card,
  },
  locBannerText: { flex: 1, ...type.caption, color: colors.ink, lineHeight: 17 },
  mapTypeBtn: {
    alignSelf: "flex-end", marginRight: spacing.gutter, marginTop: spacing.md,
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bg,
    alignItems: "center", justifyContent: "center", ...elevation.card,
  },

  hint: { position: "absolute", left: spacing.gutter, right: 100 },
  hintText: {
    fontSize: 10, lineHeight: 13.5, color: colors.ink,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 7, overflow: "hidden",
  },

  incidentHit: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  incidentDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2.5 },

  backdrop: { flex: 1, backgroundColor: "rgba(1,1,20,0.30)", justifyContent: "flex-end" },
  sheet: {
    maxHeight: "86%", backgroundColor: "#FFFFFF",
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.gutter, paddingTop: spacing.sm,
  },
  grabber: { alignSelf: "center", width: 44, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: spacing.md },
  sheetTitle: { ...type.heading, color: colors.ink },
  sheetSub: { ...type.caption, color: colors.textMuted, marginTop: 4, marginBottom: spacing.md },

  labelRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.lg, marginBottom: spacing.sm },
  label: { ...type.label, fontWeight: "500", color: colors.ink },
  labelHint: { ...type.caption, color: colors.textFaint },
  note: { ...type.caption, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 17 },

  captureRow: { flexDirection: "row", gap: spacing.md },
  captureBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    height: 52, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated,
  },
  captureText: { ...type.label, fontWeight: "500", color: colors.ink },
  attached: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    height: 52, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.ink,
    backgroundColor: colors.bg, paddingHorizontal: spacing.md,
  },
  attachedText: { flex: 1, ...type.label, fontWeight: "600", color: colors.ink },

  pickerRow: {
    height: 52, borderRadius: radius.sm, backgroundColor: colors.bgElevated,
    justifyContent: "center", paddingHorizontal: spacing.md,
  },
  pickerText: { ...type.label, fontWeight: "500", color: colors.ink },

  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  // Cancel is an exit, so it is silver like every other exit. Outline colour is
  // reserved for meaning: red for danger, amber for raising a flag, green for
  // confirming safety.
  ghostBtn: {
    flex: 1, height: 52, borderRadius: radius.md,
    backgroundColor: "#F7F7F7", borderWidth: 1, borderColor: "rgba(20,21,42,0.10)",
    alignItems: "center", justifyContent: "center",
  },
  ghostText: { ...type.label, fontWeight: "600", color: colors.ink },
  // Send flag is amber: it raises a warning about a real place, and amber is the
  // attention colour in this system. Outline only, like every coloured button.
  // No flex here either. This style is used inside a row and alone in a column,
  // and flex: 1 in a column makes it fight the scrolling list and collapse, so
  // the row usage adds flex explicitly.
  sendBtn: {
    alignSelf: "stretch", height: 52, borderRadius: radius.md,
    backgroundColor: "transparent", borderWidth: 1, borderColor: colors.riskMedium,
    alignItems: "center", justifyContent: "center",
  },
  sendText: { ...type.bodyStrong, fontWeight: "600", color: "#B26A12" },
  confirmPickText: { ...type.bodyStrong, fontWeight: "600", color: colors.ink },
  confirmPick: {
    alignSelf: "stretch", height: 52, borderRadius: radius.md,
    backgroundColor: "#F7F7F7", borderWidth: 1, borderColor: "rgba(20,21,42,0.10)",
    alignItems: "center", justifyContent: "center",
  },

  memberRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.ms, borderBottomWidth: 1, borderBottomColor: colors.border },
  mName: { ...type.label, color: colors.ink },
  nudgeBtn: {
    borderRadius: radius.sm, borderWidth: 1, borderColor: "rgba(20,21,42,0.28)",
    backgroundColor: colors.bg, paddingHorizontal: 12, paddingVertical: 7,
  },
  nudgeText: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: colors.ink },
  outOfRange: { ...type.caption, color: colors.riskHigh, marginTop: 2 },
  tick: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  tickOn: { backgroundColor: colors.ink, borderColor: colors.ink },

  stackRow: { flexDirection: "row", alignItems: "center", gap: spacing.ms, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  stackDot: { width: 10, height: 10, borderRadius: 5 },
  stackLabel: { flex: 1, ...type.label, fontWeight: "500", color: colors.ink, textTransform: "capitalize" },
  stackState: { ...type.caption, color: colors.textMuted },
});


