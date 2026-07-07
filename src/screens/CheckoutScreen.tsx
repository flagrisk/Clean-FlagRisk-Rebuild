// Checkout (V2). paystack-init -> open checkout -> confirm (DB first, then verify).
import { useState } from "react";
import { showAlert } from "../components/Feedback";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import { ShieldCheck, CreditCard, Lock } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing } from "../theme";

function naira(n: number) { return "NGN " + n.toLocaleString(); }

export function CheckoutScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { tierId, tierName, price, period, customKm, customUnlimited } = route.params ?? {};
  const { colors, glass, gradients, glow } = useTheme();
  const [paying, setPaying] = useState(false);

  const isCustom = tierId === "custom" || tierId === "custom_unlimited";

  async function confirmPayment(reference: string) {
    const { data: sess } = await supabase.auth.getUser();
    const uid = sess && sess.user ? sess.user.id : null;
    for (let i = 0; i < 8; i++) {
      if (!isCustom && uid) {
        const { data: prof } = await supabase.from("profiles").select("current_tier").eq("id", uid).maybeSingle();
        if (prof && prof.current_tier === tierId) return true;
      }
      try {
        const res = await supabase.functions.invoke("paystack-verify", { body: { reference, country: "NG" } });
        const status = res && res.data ? res.data.status : null;
        if (status === "success") return true;
        if (status === "failed" || status === "abandoned") return false;
      } catch (_e) {}
      await new Promise((r) => setTimeout(r, 3000));
    }
    return false;
  }

  async function pay() {
    if (paying) return;
    setPaying(true);
    try {
      const body = isCustom
        ? { mode: "custom", custom_km: customUnlimited ? null : customKm, custom_unlimited: !!customUnlimited, country: "NG" }
        : { tier: tierId, billing_interval: period, country: "NG" };

      const initRes = await supabase.functions.invoke("paystack-init", { body });
      if (initRes.error || !initRes.data || !initRes.data.authorization_url) {
        let msg = "Could not start checkout. Please try again.";
        try {
          const ctx = initRes.error && initRes.error.context && initRes.error.context.json ? await initRes.error.context.json() : null;
          if (ctx && ctx.error) msg = ctx.error;
        } catch (_e) {}
        setPaying(false);
        return showAlert({ title: "Checkout", message: msg });
      }

      const reference = initRes.data.reference;
      await WebBrowser.openBrowserAsync(initRes.data.authorization_url);

      const ok = await confirmPayment(reference);
      if (!ok) {
        setPaying(false);
        return showAlert({
          title: "Still confirming",
          message: "Your payment is being confirmed and your plan will update shortly. You can check your profile in a moment."
        });
      }

      if (isCustom) {
        const { error: cErr } = await supabase.rpc("apply_custom_coverage", {
          p_km: customUnlimited ? null : customKm,
          p_unlimited: !!customUnlimited,
        });
        if (cErr) {
          setPaying(false);
          return showAlert({ title: "Could not activate coverage", message: cErr.message, tone: "error" });
        }
      }

      setPaying(false);
      navigation.replace("PaymentSuccess", { tierId, tierName, price, period });
    } catch (_e) {
      setPaying(false);
      showAlert({ title: "Checkout", message: "Something went wrong during checkout.", tone: "error" });
    }
  }

  const periodLabel = period === "monthly" ? "Monthly" : "Annual";
  const perLabel = period === "monthly" ? "/mo" : "/yr";

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={[styles.back, { color: colors.accentOn }]}>Back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Checkout</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <View style={[styles.summary, { backgroundColor: glass.surface, borderColor: glass.stroke, boxShadow: glow.soft } as any]}>
          <View style={styles.summaryHead}>
            <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.planChip, { boxShadow: glow.brand } as any]}>
              <ShieldCheck size={18} color={colors.accentText} strokeWidth={2} />
            </LinearGradient>
            <View>
              <Text style={[styles.planName, { color: colors.text }]}>{tierName} plan</Text>
              <Text style={[styles.planPeriod, { color: colors.textMuted }]}>{periodLabel} billing</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <Row label={`${tierName} (${periodLabel})`} value={naira(price) + perLabel} colors={colors} />
          <Row label="VAT" value="Included" colors={colors} />
          <View style={styles.divider} />
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: colors.text }]}>Total today</Text>
            <Text style={[styles.totalValue, { color: colors.text }]}>{naira(price)}</Text>
          </View>
        </View>

        <Text style={[styles.payWith, { color: colors.textMuted }]}>Payment method</Text>
        <View style={[styles.methodRow, { backgroundColor: glass.surface, borderColor: colors.accentOn, boxShadow: glow.soft } as any]}>
          <View style={[styles.methodChip, { backgroundColor: colors.accentOn + "1f", borderColor: colors.accentOn + "44" }]}>
            <CreditCard size={18} color={colors.accentOn} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.methodName, { color: colors.text }]}>Card / Bank transfer</Text>
            <Text style={[styles.methodSub, { color: colors.textMuted }]}>Secured by Paystack</Text>
          </View>
        </View>

        <Pressable onPress={pay} disabled={paying}>
          <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={[styles.payBtn, { boxShadow: glow.brand } as any, paying && { opacity: 0.8 }]}>
            {paying ? <ActivityIndicator color={colors.accentText} /> : (
              <Text style={[styles.payText, { color: colors.accentText }]}>Pay {naira(price)}</Text>
            )}
          </LinearGradient>
        </Pressable>

        {paying ? (
          <Text style={[styles.secureText, { color: colors.textMuted, marginTop: spacing.md }]}>
            Do not close the app. Confirming your payment...
          </Text>
        ) : null}

        <View style={styles.secureRow}>
          <Lock size={13} color={colors.textMuted} strokeWidth={2} />
          <Text style={[styles.secureText, { color: colors.textMuted }]}>Card details never touch FlagRisk. Cancel anytime.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, colors }: any) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { fontSize: 16, fontWeight: "700" },
  headerTitle: { fontSize: 18, fontWeight: "800" },
  summary: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg },
  summaryHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  planChip: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  planName: { fontSize: 18, fontWeight: "800" },
  planPeriod: { fontSize: 13, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(128,128,128,0.3)", marginVertical: spacing.md },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  rowLabel: { fontSize: 14 },
  rowValue: { fontSize: 14, fontWeight: "600" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { fontSize: 16, fontWeight: "800" },
  totalValue: { fontSize: 22, fontWeight: "900" },
  payWith: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", marginTop: spacing.xl, marginBottom: spacing.sm },
  methodRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, padding: spacing.md },
  methodChip: { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  methodName: { fontSize: 15, fontWeight: "700" },
  methodSub: { fontSize: 12, marginTop: 2 },
  payBtn: { height: 56, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginTop: spacing.xl },
  payText: { fontSize: 17, fontWeight: "800" },
  secureRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: spacing.md },
  secureText: { fontSize: 12, textAlign: "center" },
});
