// Guided tour: walks the user across the core safety screens with explainer
// cards, navigating screen-to-screen. Replayable from Settings. Pure JS.
import { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing } from "../theme";
import { navigationRef } from "../navigation/navRef";
import { supabase } from "../../lib/supabase";

function goTab(tab) {
  if (navigationRef.isReady()) navigationRef.navigate("Main", { screen: tab });
}
function goScreen(name) {
  if (navigationRef.isReady()) navigationRef.navigate(name);
}

const STEPS = [
  {
    nav: () => goTab("Home"),
    title: "Your safety home",
    body: "This is your dashboard. Your risk score shows how safe your area is right now, based on what people nearby are reporting.",
  },
  {
    nav: () => goTab("Map"),
    title: "Flag a risk",
    body: "Tap anywhere on the map to report a risk you witness. Your report warns everyone nearby and helps keep the community safe.",
  },
  {
    nav: () => goScreen("Panic"),
    title: "Emergency alert",
    body: "In an emergency, this sends an instant alert with your location to your safety circle, so the people you trust can reach you fast.",
  },
  {
    nav: () => goScreen("Network"),
    title: "Your safety circle",
    body: "Add people you trust. They can receive your emergency alerts and your check-ins, and you can receive theirs.",
  },
  {
    nav: () => goTab("Profile"),
    title: "Check in",
    body: "Share your location with your safety circle any time, so the people who care about you know you are safe.",
  },
  {
    nav: () => goScreen("TripWatch"),
    title: "Trip Watch",
    body: "Heading somewhere? Trip Watch checks you in automatically at a set interval and lets your circle know when you arrive safely. Available on Pro and higher.",
  },
];

const TourContext = createContext({ startTour: () => {} });
export function useTour() { return useContext(TourContext); }

export function TourProvider({ children }) {
  const [step, setStep] = useState(-1);
  const active = step >= 0;

  // First-launch auto-start: run the tour once, ever. Replayable from Settings after.
  useEffect(() => {
    let cancelled = false;
    let fired = false;

    // Fire the tour once, after the user is signed in and on the dashboard.
    async function maybeStart() {
      if (fired || cancelled) return;
      try {
        const seen = await AsyncStorage.getItem("flagrisk_tour_seen");
        if (seen) return;
        const { data: sess } = await supabase.auth.getSession();
        if (!sess.session || cancelled) return;
        fired = true;
        await AsyncStorage.setItem("flagrisk_tour_seen", "1");
        setTimeout(() => { if (!cancelled) { setStep(0); STEPS[0].nav(); } }, 1800);
      } catch (_e) {}
    }

    // Check now (covers existing users whose session is already restored)...
    maybeStart();
    // ...and react to sign-in (covers new sign-ups / sign-ins after mount).
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) maybeStart();
    });

    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  function startTour() { setStep(0); STEPS[0].nav(); }
  function next() {
    const n = step + 1;
    if (n >= STEPS.length) { setStep(-1); return; }
    setStep(n); STEPS[n].nav();
  }
  function back() {
    const pIdx = step - 1;
    if (pIdx < 0) return;
    setStep(pIdx); STEPS[pIdx].nav();
  }
  function end() { setStep(-1); }

  return (
    <TourContext.Provider value={{ startTour }}>
      {children}
      {active ? <TourCard step={step} onNext={next} onBack={back} onEnd={end} /> : null}
    </TourContext.Provider>
  );
}

function TourCard({ step, onNext, onBack, onEnd }) {
  const { colors, glass, gradients, glow } = useTheme();
  const insets = useSafeAreaInsets();
  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;
  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={[styles.card, { backgroundColor: colors.bgElevated, borderColor: glass.stroke, marginBottom: insets.bottom + spacing.md }]}>
        <View style={styles.progressRow}>
          {STEPS.map((_, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: i === step ? colors.accentOn : glass.stroke }]} />
          ))}
        </View>
        <Text style={[styles.title, { color: colors.text }]}>{s.title}</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>{s.body}</Text>
        <View style={styles.btnRow}>
          <Pressable onPress={onEnd} hitSlop={8}><Text style={[styles.skip, { color: colors.textFaint }]}>Skip</Text></Pressable>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            {step > 0 ? (
              <Pressable onPress={onBack} style={[styles.backBtn, { borderColor: glass.stroke }]}>
                <Text style={[styles.backText, { color: colors.text }]}>Back</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={onNext}>
              <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.nextBtn, { boxShadow: glow.brand }]}>
                <Text style={[styles.nextText, { color: colors.accentText }]}>{isLast ? "Done" : "Next"}</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", paddingHorizontal: spacing.lg },
  card: { width: "100%", borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg },
  progressRow: { flexDirection: "row", gap: 6, marginBottom: spacing.sm },
  dot: { width: 18, height: 4, borderRadius: 2 },
  title: { fontSize: 18, fontWeight: "800", marginBottom: 6 },
  body: { fontSize: 14, lineHeight: 21 },
  btnRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.lg },
  skip: { fontSize: 14, fontWeight: "600" },
  backBtn: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: radius.md, borderWidth: 1 },
  backText: { fontSize: 14, fontWeight: "700" },
  nextBtn: { paddingVertical: 11, paddingHorizontal: 22, borderRadius: radius.md },
  nextText: { fontSize: 14, fontWeight: "800" },
});
