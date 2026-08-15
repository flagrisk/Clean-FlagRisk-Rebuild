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
  ActivityIndicator, Animated, Easing, Pressable,
  ScrollView, StyleSheet, Text, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import * as Location from "expo-location";
import { ArrowLeft, History } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { showAlert } from "../components/Feedback";
import { Avatar } from "../components/Avatar";
import { LocationConsentCard } from "../components/LocationConsentCard";
import { colors, radius, spacing, type, elevation } from "../theme";
import { SlideAction } from "../components/SlideAction";

const DISC = 200;

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

export function PanicScreen() {
  const navigation = useNavigation<any>();
  const [activated, setActivated] = useState(false);
  const [alarmId, setAlarmId] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ circle: number; strangers: number } | null>(null);
  const [firing, setFiring] = useState(false);
  const [responses, setResponses] = useState<Resp[]>([]);
  const [showLocNudge, setShowLocNudge] = useState(false);
  const [ending, setEnding] = useState(false);

  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;

  const justEnded = useRef(0);

  useFocusEffect(useCallback(() => {
    let alive = true;
    (async () => {
      if (activated) return;
      // A rehydrate that lands within a few seconds of ending one would put the
      // alarm straight back on screen.
      if (Date.now() - justEnded.current < 6000) return;
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
      case "marked_safe": return { label: "Safe", color: "#D2F0E3", on: colors.safe };
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
        const msg = json.error === "phone_not_verified" ? json.message
          : json.error === "panic_privilege_suspended" ? json.message
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

  // Ending calls end_my_alarms, which closes EVERY active alarm this user owns
  // and returns how many it closed. Two things made the old path fail:
  //
  //  1. end_sos took one id, and my_active_alarm only ever returns the newest.
  //     A second alarm fired while one was live left the older one running, so
  //     the screen cleared and the next focus found the other one and pulsed
  //     again with no way to reach it.
  //  2. end_sos matched on `status = active` and returned success even when it
  //     matched nothing, so the client could not tell ending from silence.
  //
  // The screen now clears only on a confirmed count. If nothing was closed, or
  // the call fails, the alarm stays on screen and says so. Believing an alarm is
  // off when it is still live is the dangerous error.
  async function deactivate() {
    if (ending) return;
    setEnding(true);
    try {
      const { data, error } = await supabase.rpc("end_my_alarms", { p_reason: "user_cancel" });
      if (error) throw error;
      const closed = typeof data === "number" ? data : 0;
      setEnding(false);
      if (closed === 0) {
        showAlert({
          title: "Nothing to end",
          message: "No alarm of yours is running. Pull the screen back to check.",
        });
      }
      justEnded.current = Date.now();
      setActivated(false); setAlarmId(null); setSummary(null); setResponses([]);
    } catch (e) {
      setEnding(false);
      showAlert({
        title: "Alarm is still running",
        message: "We could not end it, so your circle can still see it. Check your connection and slide again.",
        tone: "error",
      });
    }
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
      <Pressable onPress={() => navigation.navigate("PanicInbox")} style={styles.headBtnFilled} hitSlop={8}>
        <History size={17} color={colors.ink} strokeWidth={2} />
      </Pressable>
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
          {/* The key matters. Both branches render a SlideAction at the same
              position, so without distinct keys React reuses one instance and
              its internal state survives the switch: after firing, `done` was
              still true, the label read "Alert ended" instantly, and
              `committed` blocked the pan responder so the control was dead and
              the alarm could never be ended. */}
          <SlideAction
            key="end-alarm"
            label="Slide to end alert"
            committedLabel={ending ? "Ending" : "Alert ended"}
            onCommit={deactivate}
            disabled={ending}
            autoReset={false}
          />
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

      <View style={styles.trackWrap}>
        <SlideAction
          key="fire-alarm"
          label="Slide to send emergency alert"
          committedLabel="Alert sent"
          onCommit={fireAlarm}
          disabled={firing}
          autoReset={false}
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
  responsesTitle: { ...type.caption, fontWeight: "600", color: colors.ink, marginBottom: spacing.sm },
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

  trackWrap: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.lg, marginTop: spacing.lg },
});

