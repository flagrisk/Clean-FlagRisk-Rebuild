// ============================================================================
// Splash - FlagRisk v2.1
// Designed, not rebuilt: no mockup exists.
// Ink ground with the wordmark in lime. This is the one place lime belongs by
// the rule we set, since the ground is ink. The old version put the wordmark on
// a lime gradient in near-black, which inverts the brand relationship.
//
// FIX: the previous version navigated on a fixed 1800ms timer with no guard, so
// a slow cold start could leave a tester staring at the wordmark. The timer now
// clears on unmount and navigation is guarded against firing twice.
// ============================================================================
import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { colors, type } from "../theme";

export function SplashScreen({ navigation }: any) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;
  const moved = useRef(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();

    const go = () => {
      if (moved.current) return;
      moved.current = true;
      navigation.replace("Onboarding");
    };
    const timer = setTimeout(go, 1600);
    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <View style={styles.container}>
      <Animated.Text style={[styles.word, { opacity, transform: [{ scale }] }]}>
        FlagRisk
      </Animated.Text>
      <Animated.View style={[styles.rule, { opacity }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.ink },
  word: { fontSize: 44, lineHeight: 54, fontWeight: "700", color: colors.accent, letterSpacing: 0.5 },
  rule: { width: 56, height: 3, borderRadius: 2, backgroundColor: colors.accent, marginTop: 14, opacity: 0.6 },
});
