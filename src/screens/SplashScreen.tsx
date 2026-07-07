// Splash - refined: brand gradient, wordmark fades + scales in. No logo, no tagline.
import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { getTheme } from "../theme";

export function SplashScreen({ navigation }: any) {
  const t = getTheme("light");
  const wordOpacity = useRef(new Animated.Value(0)).current;
  const wordScale = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(wordOpacity, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(wordScale, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    const timer = setTimeout(() => navigation.replace("Onboarding"), 1800);
    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <View style={styles.container}>
      <LinearGradient colors={t.gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={styles.center}>
        <Animated.Text style={[styles.word, { opacity: wordOpacity, transform: [{ scale: wordScale }] }]}>FlagRisk</Animated.Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  center: { alignItems: "center" },
  word: { color: "#0a0a0a", fontSize: 46, fontWeight: "900", letterSpacing: 0.5 },
});
