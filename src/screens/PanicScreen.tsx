// ============================================================================
// Alarm - FlagRisk v2.1
// Rebuilt against Figma "Alarms" (6.0 Alarm flow, nodes 71:450 / 491 / 532 / 573).
//   header 36pt round back | "Emergency SOS" 14/500 centred
//   200pt lime disc | body copy 12/400 centred
//   slide control 327x48 r64 on #333333, knob 32pt r800
//
// BEHAVIOUR CHANGE: the 3-second press-and-hold is replaced by slide-to-send,
// as drawn. Three testers independently reported the old path was too slow and
// too deep. Slide is a deliberate gesture, so it keeps the accident protection
// the hold provided while removing the wait.
//
// The lime disc is the one place lime sits on a light surface. It is the
// identity moment of the product and the text on it is ink, so it is legible.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Animated, Easing, PanResponder, Pressable,
  ScrollView, StyleSheet, Text, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import * as Location from "expo-location";
import { ArrowLeft, History, ChevronRight, Check } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { showAlert } from "../components/Feedback";
import { Avatar } from "../components/Avatar";
import { LocationConsentCard } from "../components/LocationConsentCard";
import { colors, radius, spacing, type, elevation } from "../theme";

const DISC = 200;
const TRACK_H = 48;
const KNOB = 32;
const TRACK_PAD = 8;
const FIRE_AT = 0.85;   // fraction of travel that commits

type Resp = {
  responder_id: string; responder_name: string; responder_avatar?: string | null;
  response: string; responded_at: string;
};

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + " min ago";
  if (diff < 86400) return Math.floor(diff / 3600) + " h ago";
  return new Date(iso).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Slide control. Drag the knob past FIRE_AT to commit; release early to reset.
// ---------------------------------------------------------------------------
function SlideAction({
  label, committedLabel, onCommit, disabled,
}: { label: string; committedLabel: string; onCommit: () => void; disabled?: boolean }) {
  const [done, setDone] = useState(false);
  const [sliding, setSliding] = useState(false);
  const x = useRef(new Animated.Value(0)).current;
  const committed = useRef(false);
  // The PanResponder is built once, so it must read travel from a ref. Reading
  // it from state closed over 0 on first render, every release divided by zero,
  // and the control never committed.
  const travelRef = useRef(0);
  const doneRef = useRef(false);
  const disabledRef = useRef(!!disabled);
  disabledRef.current = !!disabled;

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => setSliding(true),
      onPanResponderMove: (_e, g) => {
        if (disabledRef.current || committed.current) return;
        const t = travelRef.current;
        x.setValue(Math.max(0, Math.min(t, g.dx)));
      },
      onPanResponderRelease: (_e, g) => {
        setSliding(false);
        if (disabledRef.current || committed.current) return;
        const t = travelRef.current;
        const v = Math.max(0, Math.min(t, g.dx));
        if (t > 0 && v / t >= FIRE_AT) {
          committed.current = true;
          doneRef.current = true;
          setDone(true);
          Animated.timing(x, { toValue: t, duration: 120, useNativeDriver: false }).start(() => onCommit());
        } else {
          Animated.spring(x, { toValue: 0, useNativeDriver: false, bounciness: 6 }).start();
        }
      },
      onPanResponderTerminate: () => {
        setSliding(false);
        Animated.spring(x, { toValue: 0, useNativeDriver: false, bounciness: 6 }).start();
      },
    })
  ).current;

  return (
    <View
      style={[styles.track, disabled && { opacity: 0.5 }]}
      onLayout={(e) => {
        travelRef.current = Math.max(0, e.nativeEvent.layout.width - KNOB - TRACK_PAD * 2);
      }}
    >
      <Text style={styles.trackLabel} numberOfLines={1}>
        {done ? committedLabel : sliding ? "Keep sliding" : label}
      </Text>
      <Animated.View
        style={[styles.knob, { transform: [{ translateX: x }] }]}
        {...responder.panHandlers}
      >
        {done
          ? <Check size={18} color={colors.ink} strokeWidth={3} />
          : <ChevronRight size={18} color={colors.ink} strokeWidth={3} />}
      </Animated.View>
    </View>
  );
}

export function PanicScreen() {
  const navigation = useNavigation<any>();
  const [activated, setActivated] = useState(false);
  const [alarmId, setAlarmId] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ circle: number; strangers: number } | null>(null);
  const [firing, setFiring] = useState(false);
  const [responses, setResponses] = useState<Resp[]>([]);
  const [showLocNudge, setShowLocNudge] = useState(false);

  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;

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
      ring1.stopAnimation(); ring2.stopAnimation(); ring3.stopAnimation(); breathe.stopAnimation();
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
    r1.start(); r2.start(); r3.start(); br.start();
    return () => { r1.stop(); r2.stop(); r3.stop(); br.stop(); };
  }, [activated]);

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

  function respMeta(v: string) {
    switch (v) {
      case "getting_help": return { label: "Getting help", color: "#D6E7FB", on: "#2F80ED" };
      case "on_way": case "responding": return { label: "On the way", color: "#FDE7CF", on: "#B26A12" };
      case "marked_safe": return { label: "Safe", color: "#D2F0E3", on: "#1C9D6B" };
      default: return { label: "Noted", color: "#EBEBEB", on: colors.textMuted };
    }
  }

  async function fireAlarm() {
    setFiring(true);
    try {
      let coords = { lat: 0, lng: 0 };
      let locGranted = false;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        locGranted = status === "granted";
        if (status === "granted") {
          let pos: any = await Location.getLastKnownPositionAsync();
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
      const token = s.session ? s.session.access_token : null;
      const res = await fetch("https://aqgkntulbuqqqjxjafmw.supabase.co/functions/v1/trigger-panic", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
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
      fetch("https://aqgkntulbuqqqjxjafmw.supabase.co/functions/v1/send-push", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      }).catch(() => {});
    } catch (e) {
      setFiring(false);
      showAlert({ title: "Network error", message: String(e), tone: "error" });
    }
  }

  async function deactivate() {
    if (alarmId) await supabase.rpc("end_sos", { p_alarm_id: alarmId, p_reason: "user_cancel" });
    setActivated(false); setAlarmId(null); setSummary(null); setResponses([]);
  }

  const breatheScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  const Ring = ({ v }: { v: Animated.Value }) => {
    const scale = v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.1] });
    const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });
    return <Animated.View style={[styles.pulseRing, { transform: [{ scale }], opacity }]} />;
  };

  const Header = () => (
    <View style={styles.header}>
      <Pressable onPress={() => navigation.goBack()} style={styles.headBtnPlain} hitSlop={8}>
        <ArrowLeft size={20} color={colors.ink} strokeWidth={2} />
      </Pressable>
      <Text style={styles.headTitle}>Alarm</Text>
      <View style={{ width: 36 }} />
    </View>
  );

  if (activated) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <Header />
        <Text style={styles.state}>Alarm activated</Text>

        <View style={styles.discArea}>
          <Ring v={ring1} /><Ring v={ring2} /><Ring v={ring3} />
          <Animated.View style={[styles.disc, { transform: [{ scale: breatheScale }] }]}>
            <Text style={styles.discText}>SOS</Text>
          </Animated.View>
        </View>

        <Text style={styles.body}>
          {summary
            ? "Alerting " + summary.circle + (summary.circle === 1 ? " circle member" : " circle members") +
              (summary.strangers ? " and " + summary.strangers + " nearby" : "") + ". Your location is being shared."
            : "Your contacts have been notified and your location is being shared."}
        </Text>

        <View style={styles.responsesWrap}>
          <Text style={styles.responsesTitle}>Who is responding</Text>
          {responses.length === 0 ? (
            <View style={styles.waitWrap}>
              <ActivityIndicator color={colors.textMuted} />
              <Text style={styles.waitText}>Waiting for your circle</Text>
              <Text style={styles.waitSub}>You will see here who has noted your alarm and who is coming.</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: spacing.sm }} showsVerticalScrollIndicator={false}>
              {responses.map((r) => {
                const m = respMeta(r.response);
                return (
                  <View key={r.responder_id} style={styles.respRow}>
                    <Avatar uri={r.responder_avatar} name={r.responder_name} id={r.responder_id} size={40} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.respName}>{r.responder_name}</Text>
                      <Text style={styles.respTime}>{timeAgo(r.responded_at)}</Text>
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

        <View style={styles.trackWrap}>
          <SlideAction label="Slide to end alert" committedLabel="Alert ended" onCommit={deactivate} />
        </View>

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
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <Header />
      <Text style={styles.state}>Emergency SOS</Text>

      <View style={styles.discArea}>
        <View style={styles.disc}>
          <Text style={styles.discText}>{firing ? "..." : "SOS"}</Text>
        </View>
      </View>

      <Text style={styles.body}>
        Trigger an emergency alert to notify your trusted circle and share your live location.
      </Text>

      <View style={{ flex: 1 }} />

      <Pressable
        onPress={() => navigation.navigate("PanicInbox")}
        style={styles.historyBtn}
        hitSlop={10}
      >
        <History size={19} color={colors.ink} strokeWidth={2} />
      </Pressable>

      <View style={styles.trackWrap}>
        <SlideAction
          label="Slide to send emergency alert"
          committedLabel="Alert sent"
          onCommit={fireAlarm}
          disabled={firing}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  header: { height: 36, flexDirection: "row", alignItems: "center", marginHorizontal: spacing.gutter, marginTop: spacing.md },
  headBtnPlain: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headBtnFilled: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#F0F0F0", alignItems: "center", justifyContent: "center" },
  headTitle: { flex: 1, ...type.heading, color: colors.ink, textAlign: "center" },

  state: { ...type.label, color: colors.ink, textAlign: "center", marginTop: spacing.xl },

  discArea: { height: DISC + 40, alignItems: "center", justifyContent: "center", marginTop: spacing.xl },
  disc: {
    width: DISC, height: DISC, borderRadius: DISC / 2, backgroundColor: colors.accent,
    alignItems: "center", justifyContent: "center", ...elevation.card,
  },
  discText: { fontSize: 36, lineHeight: 44, fontWeight: "700", color: colors.ink, letterSpacing: 1 },
  pulseRing: {
    position: "absolute", width: DISC, height: DISC, borderRadius: DISC / 2,
    backgroundColor: colors.accent,
  },

  body: {
    ...type.caption, color: colors.ink, textAlign: "center",
    marginTop: spacing.xl, marginHorizontal: spacing.xxl, lineHeight: 18,
  },

  responsesWrap: { flex: 1, marginTop: spacing.xl, paddingHorizontal: spacing.gutter },
  responsesTitle: { ...type.caption, fontWeight: "600", color: "#333333", marginBottom: spacing.sm },
  waitWrap: { alignItems: "center", paddingVertical: spacing.xl, gap: 8 },
  waitText: { ...type.label, color: colors.ink },
  waitSub: { ...type.caption, color: colors.textMuted, textAlign: "center", maxWidth: 240 },
  respRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.ms,
    paddingVertical: spacing.ms, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  respName: { ...type.label, color: colors.ink },
  respTime: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  respPill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  respPillText: { fontSize: 10, lineHeight: 14, fontWeight: "600" },

  historyBtn: {
    alignSelf: "flex-end", marginRight: spacing.gutter, marginBottom: spacing.md,
    width: 48, height: 48, borderRadius: 24, backgroundColor: "#F0F0F0",
    alignItems: "center", justifyContent: "center",
  },
  trackWrap: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.lg, marginTop: spacing.lg },
  track: {
    height: TRACK_H, borderRadius: 64, backgroundColor: "#333333",
    justifyContent: "center", paddingHorizontal: TRACK_PAD,
  },
  trackLabel: {
    position: "absolute", left: 0, right: 0, textAlign: "center",
    ...type.label, fontWeight: "600", color: "#FFFFFF",
  },
  knob: {
    width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: colors.accent,
    alignItems: "center", justifyContent: "center",
  },
});
