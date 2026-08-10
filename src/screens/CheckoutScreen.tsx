// ============================================================================
// Checkout - FlagRisk v2.1
// Designed, not rebuilt: no mockup exists for commerce.
//   header | order summary card #FAFAFA | payment method | trust line
//   ink pay button with a lime label, pinned at the foot
// Logic unchanged: paystack-init, external browser, then confirmPayment which
// polls the profile tier first and paystack-verify second, then apply_custom_
// coverage for custom purchases.
// ============================================================================
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import * as WebBrowser from "expo-web-browser";
import { ArrowLeft, ShieldCheck, CreditCard, Lock } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { showAlert } from "../components/Feedback";
import { colors, radius, spacing, type } from "../theme";

function naira(n: number) { return "NGN " + n.toLocaleString(); }

export function CheckoutScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { tierId, tierName, price, period, customKm, customUnlimited } = route.params ?? {};
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
        let msg = "Checkout could not be started. Please try again.";
        try {
          const ctx = initRes.error && initRes.error.context && initRes.error.context.json
            ? await initRes.error.context.json() : null;
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
          message: "Your payment is being confirmed and your plan will update shortly. Check your profile in a moment.",
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
  const perLabel = period === "monthly" ? " per month" : " per year";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtnPlain} hitSlop={8}>
          <ArrowLeft size={20} color={colors.ink} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headTitle}>Checkout</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.summary}>
          <View style={styles.summaryHead}>
            <View style={styles.planChip}>
              <ShieldCheck size={18} color={colors.ink} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.planName}>{tierName}</Text>
              <Text style={styles.planPeriod}>{periodLabel} billing</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.line}>
            <Text style={styles.lineLabel}>{tierName} ({periodLabel})</Text>
            <Text style={styles.lineValue}>{naira(price)}{perLabel}</Text>
          </View>
          <View style={styles.line}>
            <Text style={styles.lineLabel}>VAT</Text>
            <Text style={styles.lineValue}>Included</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.line}>
            <Text style={styles.totalLabel}>Total today</Text>
            <Text style={styles.totalValue}>{naira(price)}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Payment method</Text>
        <View style={styles.methodRow}>
          <View style={styles.methodChip}>
            <CreditCard size={18} color={colors.ink} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.methodName}>Card or bank transfer</Text>
            <Text style={styles.methodSub}>Secured by Paystack</Text>
          </View>
        </View>

        <View style={styles.trustRow}>
          <Lock size={14} color={colors.textMuted} strokeWidth={2} />
          <Text style={styles.trustText}>
            Payment is handled by Paystack. FlagRisk never sees your card details.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={[styles.payBtn, paying && { opacity: 0.8 }]} onPress={pay} disabled={paying}>
          {paying
            ? <ActivityIndicator color={colors.accent} />
            : <Text style={styles.payText}>Pay {naira(price)}</Text>}
        </Pressable>
        <Text style={styles.footNote}>You can cancel at any time from Settings.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { height: 36, flexDirection: "row", alignItems: "center", marginHorizontal: spacing.gutter, marginTop: spacing.md },
  headBtnPlain: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headTitle: { flex: 1, ...type.heading, color: colors.ink, textAlign: "center" },

  scroll: { paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, paddingBottom: spacing.lg },

  summary: { backgroundColor: "#FAFAFA", borderRadius: radius.md, padding: spacing.md },
  summaryHead: { flexDirection: "row", alignItems: "center", gap: spacing.ms },
  planChip: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  planName: { ...type.subheading, color: colors.ink },
  planPeriod: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  line: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
  lineLabel: { ...type.caption, color: colors.textMuted, flex: 1 },
  lineValue: { ...type.caption, fontWeight: "600", color: colors.ink },
  totalLabel: { ...type.label, fontWeight: "600", color: colors.ink },
  totalValue: { ...type.subheading, color: colors.ink },

  sectionLabel: { fontSize: 12, lineHeight: 24, fontWeight: "600", color: "#333333", marginTop: spacing.lg },
  methodRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.ms,
    backgroundColor: colors.bg, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.ink, padding: spacing.md,
  },
  methodChip: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#F0F0F0", alignItems: "center", justifyContent: "center" },
  methodName: { ...type.label, fontWeight: "600", color: colors.ink },
  methodSub: { ...type.caption, color: colors.textMuted, marginTop: 2 },

  trustRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: spacing.md },
  trustText: { flex: 1, ...type.caption, color: colors.textMuted, lineHeight: 17 },

  footer: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.md, gap: spacing.sm },
  payBtn: { height: 56, borderRadius: radius.md, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  payText: { ...type.bodyStrong, fontWeight: "600", color: colors.accent },
  footNote: { ...type.caption, color: colors.textMuted, textAlign: "center" },
});
