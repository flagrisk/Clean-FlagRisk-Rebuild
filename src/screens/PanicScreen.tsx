// Panic / Alarm (V2 + theming). Hold 3s to fire. Activated state: pulsing radar
// rings + breathing core, PLUS a live list of who in your circle has responded
// (polled from alarm_responses, owner-gated). On open, an existing live alarm is
// rehydrated via my_active_alarm so the LIVE view survives reloads / navigation.
import { useCallback, useEffect, useRef, useState } from "react";
import { showAlert } from "../components/Feedback";
import { ActivityIndicator, Alert, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import * as Location from "expo-location";
import { supabase } from "../../lib/supabase";
import { Avatar } from "../components/Avatar";
import { useTheme } from "../theme/ThemeProvider";
import { LinearGradient } from "expo-linear-gradient";
import { LocationConsentCard } from "../components/LocationConsentCard";
import { radius, spacing } from "../theme";

const HOLD_MS = 3000;
const SIZE = 220;

type Resp = { responder_id: string; responder_name: string; response: string; responded_at: string };

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}
function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + " min ago";
  if (diff < 86400) return Math.floor(diff / 3600) + " h ago";
  return new Date(iso).toLocaleDateString();
}

export function PanicScreen() {
  const { colors, gradients, glow, glass } = useTheme();
  const [activated, setActivated] = useState(false);
  const [alarmId, setAlarmId] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ circle: number; strangers: number } | null>(null);
  const [firing, setFiring] = useState(false);
  const [responses, setResponses] = useState<Resp[]>([]);

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fill = useRef(new Animated.Value(0)).current;
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const dot = useRef(new Animated.Value(1)).current;

  // Rehydrate an already-live alarm when this screen gains focus, so the LIVE
  // view + responder polling resume after a reload or navigating away and back.
  useFocusEffect(useCallback(() => {
    let alive = true;
    (async () => {
      if (activated) return;
      const { data } = await supabase.rpc("my_active_alarm");
      if (alive && data && data[0]) {
        setAlarmId(data[0].alarm_id);
        setActivated(true);
      }
    })();
    return () => { alive = false; };
  }, [activated]));

  useEffect(() => {
    if (!activated) {
      ring1.stopAnimation(); ring2.stopAnimation(); ring3.stopAnimation();
      breathe.stopAnimation(); dot.stopAnimation();
      return;
    }
    const mkRing = (v: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 2400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]));
    const r1 = mkRing(ring1, 0);
    const r2 = mkRing(ring2, 800);
    const r3 = mkRing(ring3, 1600);
    const br = Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    const bl = Animated.loop(Animated.sequence([
      Animated.timing(dot, { toValue: 0.2, duration: 500, useNativeDriver: true }),
      Animated.timing(dot, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]));
    r1.start(); r2.start(); r3.start(); br.start(); bl.start();
    return () => { r1.stop(); r2.stop(); r3.stop(); br.stop(); bl.stop(); };
  }, [activated]);

  // Poll who has responded while the alarm is live.
  useEffect(() => {
    if (!activated || !alarmId) { setResponses([]); return; }
    let alive = true;
    const load = async () => {
      const { data } = await supabase.rpc("alarm_responses", { p_alarm: alarmId });
      if (alive) setResponses(data ?? []);
    };
    load();
    const iv = setInterval(load, 4000);
    return () => { alive = false; clearInterval(iv); };
  }, [activated, alarmId]);

  // Each response tone returns its fill color AND the readable on-color for text,
  // so a pale accent never ends up with white (washed-out) text on it.
  function respMeta(v: string) {
    switch (v) {
      case "getting_help": return { label: "Getting help", color: colors.accentOn, on: "#fff" };
      case "on_way": case "responding": return { label: "On the way", color: colors.accent, on: colors.accentText };
      case "marked_safe": return { label: "Safe", color: colors.safe, on: "#fff" };
      default: return { label: "Noted", color: colors.textMuted, on: "#fff" };
    }
  }

  function onPressIn() {
    if (activated || firing) return;
    Animated.timing(fill, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: false }).start();
    holdTimer.current = setTimeout(fireAlarm, HOLD_MS);
  }
  function onPressOut() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    Animated.timing(fill, { toValue: 0, duration: 200, useNativeDriver: false }).start();
  }

  const [showLocNudge, setShowLocNudge] = useState(false);

  async function fireAlarm() {
    setFiring(true);
    try {
      let coords = { lat: 0, lng: 0 };
      let locGranted = false;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        locGranted = status === "granted";
        if (status === "granted") {
          let pos = await Location.getLastKnownPositionAsync();
          if (!pos) {
            pos = await Promise.race([
              Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
              new Promise((resolve) => setTimeout(() => resolve(null), 4000)),
            ]);
          }
          if (pos && pos.coords) coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        }
      } catch (_e) {}
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch("https://aqgkntulbuqqqjxjafmw.supabase.co/functions/v1/trigger-panic", {
        method: "POST",
        headers: { Authorization: `Bearer ${s.session?.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: coords.lat, longitude: coords.lng }),
      });
      const json = await res.json();
      setFiring(false);
      if (!res.ok || !json.ok) {
        const msg = json.error === "panic_privilege_suspended" ? json.message
          : json.error === "panic_cooldown" ? json.message
          : json.error ?? "Could not activate alarm";
        return showAlert({ title: "Alarm not sent", message: msg, tone: "error" });
      }
      setAlarmId(json.alarm_id);
      setSummary({ circle: json.audience_summary.circle_members, strangers: json.audience_summary.nearby_strangers });
      setActivated(true);
      if (!locGranted) setShowLocNudge(true);
      // Dispatch the panic pushes immediately (do not wait for the next cycle).
      fetch("https://aqgkntulbuqqqjxjafmw.supabase.co/functions/v1/send-push", {
        method: "POST",
        headers: { Authorization: `Bearer ${s.session?.access_token}`, "Content-Type": "application/json" },
      }).catch(() => {});
    } catch (e) { setFiring(false); showAlert({ title: "Network error", message: String(e), tone: "error" }); }
  }

  async function deactivate() {
    if (alarmId) await supabase.rpc("end_sos", { p_alarm_id: alarmId, p_reason: "user_cancel" });
    setActivated(false); setAlarmId(null); setSummary(null); setResponses([]);
    fill.setValue(0);
  }

  const fillWidth = fill.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });
  const breatheScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });

  const Ring = ({ v }: { v: Animated.Value }) => {
    const scale = v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] });
    const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });
    return <Animated.View style={[styles.pulseRing, { transform: [{ scale }], opacity }]} />;
  };

  if (activated) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top", "bottom"]}>
        <Text style={[styles.header, { color: colors.text }]}>Alarm Activated</Text>
        <View style={styles.radarArea}>
          <Ring v={ring1} /><Ring v={ring2} /><Ring v={ring3} />
          <Animated.View style={[styles.activeCircle, { boxShadow: glow.brand, transform: [{ scale: breatheScale }] } as any]}>
            <LinearGradient colors={gradients.tileAlarm} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill as any, { borderRadius: SIZE * 0.425 }]} />
            <View style={styles.coreSheen} />
            <Text style={styles.activeCoreText}>LIVE</Text>
          </Animated.View>
        </View>
        <View style={styles.summaryBox}>
          <View style={styles.summaryRow}>
            <Animated.View style={[styles.liveDot, { opacity: dot }]} />
            <Text style={[styles.summaryText, { color: colors.text }]}>
              {summary
                ? `Alerting ${summary.circle} circle ${summary.circle === 1 ? "member" : "members"}${summary.strangers ? ` and ${summary.strangers} nearby` : ""}`
                : "Your alarm is live"}
            </Text>
          </View>
        </View>

        <View style={styles.responsesWrap}>
          <Text style={[styles.responsesTitle, { color: colors.textMuted }]}>WHO IS RESPONDING</Text>
          {responses.length === 0 ? (
            <View style={styles.waitWrap}>
              <ActivityIndicator color={colors.textMuted} />
              <Text style={[styles.waitText, { color: colors.text }]}>Waiting for your circle</Text>
              <Text style={[styles.waitSub, { color: colors.textMuted }]}>You will see here who has noted your alarm and who is coming.</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: spacing.sm }}>
              {responses.map((r) => {
                const m = respMeta(r.response);
                return (
                  <View key={r.responder_id} style={[styles.respRow, { borderBottomColor: glass.stroke }]}>
                    <Avatar uri={r.responder_avatar} name={r.responder_name} id={r.responder_id} size={40} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.respName, { color: colors.text }]}>{r.responder_name}</Text>
                      <Text style={[styles.respTime, { color: colors.textMuted }]}>{timeAgo(r.responded_at)}</Text>
                    </View>
                    <View style={[styles.respPill, { backgroundColor: m.color }]}>
                      <Text style={[styles.respPillText, { color: m.on }]}>{m.label}</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>

        <Pressable style={[styles.deactivate, { backgroundColor: colors.accent }]} onPress={deactivate}>
          <Text style={[styles.deactivateText, { color: colors.accentText }]}>Deactivate</Text>
        </Pressable>
        <LocationConsentCard
          visible={showLocNudge}
          title="Turn on your location"
          body="Your alarm went out, but your location is off, so people cannot see where you are. Turn it on so responders and your circle can find you."
          onDone={() => setShowLocNudge(false)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top", "bottom"]}>
      <Text style={[styles.header, { color: colors.text }]}>Alarm</Text>
      <View style={styles.center}>
        <Pressable onPressIn={onPressIn} onPressOut={onPressOut} style={[styles.pushButton, { boxShadow: glow.brand } as any]}>
          <LinearGradient colors={gradients.tileAlarm} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill as any} />
          <Animated.View style={[styles.pushFill, { height: fillWidth }]} />
          <Text style={styles.pushText}>{firing ? "..." : "PUSH"}</Text>
        </Pressable>
        <Text style={[styles.activate, { color: colors.text }]}>Activate Alarm</Text>
        <Text style={[styles.hold, { color: colors.textMuted }]}>Hold button down for 3 seconds</Text>
      </View>
      <View style={styles.warnBox}>
        <Text style={[styles.warnText, { color: colors.textMuted }]}>
          This will alert your panic circle and nearby users with your location. Use only in real emergencies.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { fontSize: 22, fontWeight: "800", textAlign: "center", paddingVertical: spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  radarArea: { height: SIZE * 1.35, alignItems: "center", justifyContent: "center" },
  pushButton: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  pushFill: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.25)" },
  pushText: { color: "#fff", fontSize: 34, fontWeight: "900" },
  activate: { fontSize: 28, fontWeight: "800", marginTop: spacing.xl },
  hold: { fontSize: 15, marginTop: spacing.sm },
  warnBox: { alignItems: "center", paddingHorizontal: spacing.xl, paddingBottom: spacing.lg },
  warnText: { fontSize: 13, textAlign: "center", lineHeight: 19 },
  pulseRing: { position: "absolute", width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: "#c2425a" },
  activeCircle: { width: SIZE * 0.85, height: SIZE * 0.85, borderRadius: SIZE * 0.425, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  activeCoreText: { color: "#fff", fontSize: 36, fontWeight: "900", letterSpacing: 2 },
  coreSheen: { position: "absolute", top: -SIZE * 0.2, left: -SIZE * 0.2, width: SIZE * 0.7, height: SIZE * 0.7, borderRadius: SIZE * 0.35, backgroundColor: "rgba(255,255,255,0.18)" },
  summaryBox: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#e5484d" },
  summaryText: { fontSize: 15, textAlign: "center", lineHeight: 21 },
  responsesWrap: { flex: 1, paddingHorizontal: spacing.lg },
  responsesTitle: { fontSize: 12, fontWeight: "800", letterSpacing: 0.5, marginBottom: spacing.sm },
  waitWrap: { alignItems: "center", justifyContent: "center", paddingVertical: spacing.xl, gap: 8 },
  waitText: { fontSize: 16, fontWeight: "700" },
  waitSub: { fontSize: 13, textAlign: "center", lineHeight: 19, paddingHorizontal: spacing.lg },
  respRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  respAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  respAvatarText: { fontWeight: "800", fontSize: 14 },
  respName: { fontSize: 15, fontWeight: "700" },
  respTime: { fontSize: 12, marginTop: 1 },
  respPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  respPillText: { fontSize: 12, fontWeight: "800" },
  deactivate: { height: 60, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginHorizontal: spacing.lg, marginBottom: spacing.lg },
  deactivateText: { fontSize: 17, fontWeight: "800" },
});
