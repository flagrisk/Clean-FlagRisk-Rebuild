// ============================================================================
// Payment Success - FlagRisk v2.1
// Designed, not rebuilt: no mockup exists for commerce.
// Ink confirmation disc with a lime tick, the plan named, the amount, and the
// two exits. No gradients, no glow.
// ============================================================================
import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Check } from "lucide-react-native";
import { colors, radius, spacing, type } from "../theme";

function naira(n: number) { return "NGN " + n.toLocaleString(); }

export function PaymentSuccessScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { tierName, price, period } = route.params ?? {};

  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(scale, { toValue: 1, duration: 450, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 380, useNativeDriver: true }),
    ]).start();
  }, []);

  const periodLabel = period === "monthly" ? "month" : "year";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.center}>
        <Animated.View style={[styles.badge, { transform: [{ scale }], opacity }]}>
          <Check size={48} color={colors.accent} strokeWidth={3} />
        </Animated.View>
        <Text style={styles.title}>You are on {tierName}</Text>
        <Text style={styles.sub}>
          Payment of {naira(price)} received. Your plan renews every {periodLabel}.
        </Text>
        <View style={styles.receipt}>
          <Text style={styles.receiptText}>A receipt is in your payment history.</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable style={styles.primaryBtn} onPress={() => navigation.navigate("Main", { screen: "Home" })}>
          <Text style={styles.primaryText}>Back to home</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate("PaymentHistory")} hitSlop={8}>
          <Text style={styles.link}>View payment history</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl },
  badge: {
    width: 104, height: 104, borderRadius: 52, backgroundColor: colors.ink,
    alignItems: "center", justifyContent: "center",
  },
  title: { ...type.title, color: colors.ink, marginTop: spacing.xl, textAlign: "center" },
  sub: { ...type.label, fontWeight: "400", color: colors.textMuted, textAlign: "center", marginTop: spacing.sm, lineHeight: 20 },
  receipt: { backgroundColor: "#F0F0F0", borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, marginTop: spacing.lg },
  receiptText: { ...type.caption, fontWeight: "600", color: colors.ink },

  footer: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.md, gap: spacing.md },
  primaryBtn: { height: 56, borderRadius: radius.md, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  primaryText: { ...type.bodyStrong, fontWeight: "600", color: colors.accent },
  link: { ...type.caption, fontWeight: "600", color: colors.ink, textAlign: "center" },
});
