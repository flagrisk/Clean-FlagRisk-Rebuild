// ============================================================================
// Onboarding - FlagRisk v2.1
// Three full-bleed slides. The photography and copy are kept; the overlay and
// controls are rebuilt to the 2.1 system.
//   scrim gradient rather than a flat block, so the photo is not cut in half
//   title 34/700 white | body 16/400 at 85 percent
//   dots: lime is not legible over photography, so the active dot is white and
//   the inactive ones are white at low opacity
//   primary: ink pill with a lime label, matching every other primary in 2.1
//
// Added: an explicit route to Sign In. Previously every path out of onboarding
// led to Create Account, which is part of why a returning user could not find
// the sign-in screen.
//
// NOTE: this is the first-run carousel, not the in-app guided tour. The tour
// that replays on every launch lives in src/components/Tour.tsx and is separate.
// ============================================================================
import { useRef, useState } from "react";
import { Dimensions, FlatList, ImageBackground, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors, radius, spacing, type } from "../theme";

const { width, height } = Dimensions.get("window");

const SLIDES = [
  {
    key: "1", title: "Receive alerts",
    body: "Get real-time notice of safety concerns happening around you.",
    image: require("../../assets/onboarding/onboard1-receive.webp"),
  },
  {
    key: "2", title: "Send alerts",
    body: "Flag what you see, so the people near you know about it too.",
    image: require("../../assets/onboarding/onboard2-send.webp"),
  },
  {
    key: "3", title: "Safe network",
    body: "Build a circle of people who stay informed about each other.",
    image: require("../../assets/onboarding/onboard3-network.webp"),
  },
];

const SEEN_KEY = "flagrisk.onboarding.seen";

export function OnboardingScreen({ navigation }: any) {
  const [index, setIndex] = useState(0);
  const ref = useRef<FlatList>(null);
  const last = index === SLIDES.length - 1;

  // Sign In is the landing screen and decides whether to send a first-time user
  // here. Onboarding only records that it has been seen.
  async function leaveTo(route: string) {
    try { await AsyncStorage.setItem(SEEN_KEY, "1"); } catch (_e) {}
    navigation.replace(route);
  }

  const next = () => {
    if (last) leaveTo("CreateAccount");
    else ref.current?.scrollToIndex({ index: index + 1 });
  };

  return (
    <View style={styles.container}>
      <FlatList
        ref={ref}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s.key}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <ImageBackground source={item.image} style={[styles.slide, { width, height }]} resizeMode="cover">
            <LinearGradient
              colors={["rgba(10,10,12,0.78)", "rgba(10,10,12,0.30)", "rgba(10,10,12,0.00)"]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.topScrim}
              pointerEvents="none"
            />
            <LinearGradient
              colors={["rgba(10,10,12,0.00)", "rgba(10,10,12,0.72)"]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.bottomScrim}
              pointerEvents="none"
            />
            <SafeAreaView edges={["top"]} style={styles.textWrap}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.body}>{item.body}</Text>
            </SafeAreaView>
          </ImageBackground>
        )}
      />

      <SafeAreaView edges={["bottom"]} style={styles.footer} pointerEvents="box-none">
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>

        <Pressable style={styles.cta} onPress={next}>
          <Text style={styles.ctaText}>{last ? "Create account" : "Next"}</Text>
        </Pressable>

        <View style={styles.linkRow}>
          {!last ? (
            <Pressable onPress={() => leaveTo("CreateAccount")} hitSlop={8}>
              <Text style={styles.link}>Skip</Text>
            </Pressable>
          ) : <View />}
          <Pressable onPress={() => leaveTo("SignIn")} hitSlop={8}>
            <Text style={styles.link}>I already have an account</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  slide: { justifyContent: "flex-start" },
  topScrim: { position: "absolute", top: 0, left: 0, right: 0, height: 320 },
  bottomScrim: { position: "absolute", bottom: 0, left: 0, right: 0, height: 300 },
  textWrap: { paddingHorizontal: spacing.gutter, paddingTop: spacing.xl },
  title: { ...type.display, color: "#FFFFFF" },
  body: { ...type.body, color: "rgba(255,255,255,0.85)", marginTop: spacing.sm, lineHeight: 22, maxWidth: 300 },

  footer: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    paddingHorizontal: spacing.gutter, paddingBottom: spacing.lg, gap: spacing.md,
  },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: spacing.xs },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.38)" },
  dotActive: { width: 22, backgroundColor: "#FFFFFF" },

  cta: { height: 56, borderRadius: radius.md, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  ctaText: { ...type.bodyStrong, fontWeight: "600", color: colors.accent },

  linkRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  link: { ...type.caption, fontWeight: "600", color: "rgba(255,255,255,0.9)" },
});
