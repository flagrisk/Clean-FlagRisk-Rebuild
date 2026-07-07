// Payment Success (V2, UI-only). Confirmation after mock checkout.
import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Check } from "lucide-react-native";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing } from "../theme";

function naira(n: number) { return "NGN " + n.toLocaleString(); }

export function PaymentSuccessScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { tierName, price, period } = route.params ?? {};
  const { colors, gradients, glow } = useTheme();

  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(scale, { toValue: 1, duration: 500, easing: Easing.out(Easing.back(2)), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  const periodLabel = period === "monthly" ? "month" : "year";

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top", "bottom"]}>
      <View style={styles.center}>
        <Animated.View style={{ transform: [{ scale }], opacity }}>
          <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={[styles.badge, { boxShadow: glow.brand } as any]}>
            <Check size={56} color={colors.accentText} strokeWidth={3} />
          </LinearGradient>
        </Animated.View>
        <Text style={[styles.title, { color: colors.text }]}>You are on {tierName}</Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>
          Payment of {naira(price)} received. Your plan renews every {periodLabel}.
        </Text>
        <View style={[styles.receipt, { borderColor: colors.accentOn + "44", backgroundColor: colors.accentOn + "12" }]}>
          <Text style={[styles.receiptText, { color: colors.accentOn }]}>A receipt is in your Payment history.</Text>
        </View>
      </View>

      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <Pressable onPress={() => navigation.navigate("Main", { screen: "Home" })}>
          <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={[styles.primaryBtn, { boxShadow: glow.brand } as any]}>
            <Text style={[styles.primaryText, { color: colors.accentText }]}>Back to home</Text>
          </LinearGradient>
        </Pressable>
        <Pressable style={styles.ghostBtn} onPress={() => navigation.replace("PaymentHistory")}>
          <Text style={[styles.ghostText, { color: colors.text }]}>View payment history</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  badge: { width: 110, height: 110, borderRadius: 55, alignItems: "center", justifyContent: "center", marginBottom: spacing.xl },
  title: { fontSize: 26, fontWeight: "900", textAlign: "center" },
  sub: { fontSize: 15, textAlign: "center", marginTop: spacing.sm, lineHeight: 22 },
  receipt: { marginTop: spacing.lg, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10 },
  receiptText: { fontSize: 13, fontWeight: "600" },
  primaryBtn: { height: 56, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  primaryText: { fontSize: 16, fontWeight: "800" },
  ghostBtn: { height: 50, alignItems: "center", justifyContent: "center" },
  ghostText: { fontSize: 15, fontWeight: "700" },
});
