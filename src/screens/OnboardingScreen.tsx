// Onboarding — three full-bleed slides from the Figma: Receive Alerts, Send
// Alerts, Safe Network. Each shows its illustration full-screen with the title
// and body overlaid at the top, dots + Skip/Next (Create Account on the last)
// at the bottom. Swipe or tap Next; last slide -> CreateAccount. Skip jumps ahead.
import { useRef, useState } from "react";
import { Dimensions, FlatList, ImageBackground, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../components/Button";
import { colors, spacing } from "../theme";

const { width, height } = Dimensions.get("window");

const SLIDES = [
  {
    key: "1", title: "Receive Alerts",
    body: "Receive real-time notification about on-going safety concerns.",
    image: require("../../assets/onboarding/onboard1-receive.webp"),
  },
  {
    key: "2", title: "Send Alerts",
    body: "Send real-time intel about on-going safety concerns.",
    image: require("../../assets/onboarding/onboard2-send.webp"),
  },
  {
    key: "3", title: "Safe Network",
    body: "Build a network of friends always informed about each other.",
    image: require("../../assets/onboarding/onboard3-network.webp"),
  },
];

export function OnboardingScreen({ navigation }: any) {
  const [index, setIndex] = useState(0);
  const ref = useRef<FlatList>(null);
  const last = index === SLIDES.length - 1;

  const next = () => {
    if (last) navigation.replace("CreateAccount");
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
            {/* dark overlay at top so title/body stay readable over the photo */}
            <View style={styles.topScrim} />
            <SafeAreaView edges={["top"]} style={styles.textWrap}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.body}>{item.body}</Text>
            </SafeAreaView>
          </ImageBackground>
        )}
      />

      {/* bottom controls overlaid on the image */}
      <SafeAreaView edges={["bottom"]} style={styles.footer} pointerEvents="box-none">
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
        {!last && (
          <Pressable onPress={() => navigation.replace("CreateAccount")}>
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        )}
        <Button label={last ? "Create Account" : "Next"} onPress={next} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  slide: { justifyContent: "flex-start" },
  topScrim: {
    position: "absolute", top: 0, left: 0, right: 0, height: 260,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  textWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  title: { color: "#fff", fontSize: 34, fontWeight: "800" },
  body: { color: "rgba(255,255,255,0.85)", fontSize: 16, marginTop: spacing.sm, lineHeight: 22 },
  footer: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md,
  },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.4)" },
  dotActive: { backgroundColor: colors.accent },
  skip: { color: colors.accent, fontWeight: "700", textAlign: "center", fontSize: 16, marginBottom: spacing.sm },
});
