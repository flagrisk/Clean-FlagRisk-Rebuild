// ============================================================================
// Plans and pricing - FlagRisk v2.1
// Designed, not rebuilt: no mockup exists for commerce.
//   header | lead | period segmented control | tier cards | custom coverage
// Paid tiers are white cards with a hairline border. Premium is the one ink
// card, because it is the tier testers reached for and ink is how 2.1 signals
// primacy. Lime appears only as a label on ink.
// Logic unchanged: quote_coverage, the km stepper, the unlimited toggle, the
// rank gate that stops you buying a tier below your own.
// ============================================================================
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { ArrowLeft, Check, Plus, Minus, Globe } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { colors, radius, spacing, type, elevation } from "../theme";

type Period = "monthly" | "annual";

const TIERS = [
  { id: "basic", name: "Basic", monthly: 0, annual: 0, radius: "5 km", retention: "7 days", ads: "Light ads", verification: "Standard", paid: false, hero: false },
  { id: "standard", name: "Standard", monthly: 700, annual: 7000, radius: "15 km", retention: "30 days", ads: "Ad free", verification: "Standard", paid: true, hero: false },
  { id: "pro", name: "Pro", monthly: 1300, annual: 13000, radius: "50 km", retention: "90 days", ads: "Ad free", verification: "Standard", paid: true, hero: false },
  { id: "premium", name: "Premium", monthly: 2500, annual: 25000, radius: "500 km", retention: "180 days", ads: "Ad free", verification: "Priority", paid: true, hero: true },
];

const RANK: Record<string, number> = { basic: 0, standard: 1, pro: 2, premium: 3 };

function naira(n: number) { return "NGN " + n.toLocaleString(); }

export function PlanPricingScreen() {
  const navigation = useNavigation<any>();
  const [period, setPeriod] = useState<Period>("monthly");
  const [current, setCurrent] = useState("basic");
  const [customKm, setCustomKm] = useState(600);
  const [customUnlimited, setCustomUnlimited] = useState(false);
  const [customQuote, setCustomQuote] = useState<number | null>(null);

  const refreshQuote = useCallback(async (km: number, unlimited: boolean) => {
    const { data } = await supabase.rpc("quote_coverage", { p_km: unlimited ? null : km, p_unlimited: unlimited });
    if (data && data[0]) setCustomQuote(Number(data[0].monthly_ngn));
  }, []);

  useFocusEffect(useCallback(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user?.id) return;
      const { data } = await supabase.from("profiles").select("current_tier").eq("id", u.user.id).single();
      if (data?.current_tier) setCurrent(data.current_tier);
    })();
  }, []));

  useFocusEffect(useCallback(() => { refreshQuote(customKm, customUnlimited); }, [customKm, customUnlimited, refreshQuote]));

  function stepKm(delta: number) {
    setCustomUnlimited(false);
    setCustomKm((k) => Math.max(600, Math.min(5000, k + delta)));
  }

  const canBuy = (id: string) => (RANK[id] ?? 99) > (RANK[current] ?? 0);

  const Feature = ({ value, label, hero }: { value: string; label: string; hero: boolean }) => (
    <View style={styles.featureRow}>
      <Check size={15} color={hero ? colors.accent : colors.ink} strokeWidth={2.6} />
      <Text style={[styles.featureText, hero && { color: "rgba(255,255,255,0.85)" }]}>
        <Text style={[styles.featureValue, hero && { color: "#FFFFFF" }]}>{value}</Text>
        {label ? " " + label : ""}
      </Text>
    </View>
  );

  const Tier = ({ t }: { t: typeof TIERS[number] }) => {
    const price = period === "monthly" ? t.monthly : t.annual;
    const isCurrent = current === t.id;
    const hero = t.hero;
    return (
      <View style={[styles.card, hero && styles.cardHero, isCurrent && !hero && styles.cardCurrent]}>
        <View style={styles.cardTop}>
          <Text style={[styles.tierName, hero && { color: "#FFFFFF" }]}>{t.name}</Text>
          {isCurrent ? (
            <View style={[styles.badge, hero && { backgroundColor: "rgba(255,255,255,0.18)" }]}>
              <Text style={[styles.badgeText, hero && { color: "#FFFFFF" }]}>Current</Text>
            </View>
          ) : hero ? (
            <View style={styles.badgeLime}>
              <Text style={styles.badgeLimeText}>Widest reach</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.priceRow}>
          <Text style={[styles.price, hero && { color: "#FFFFFF" }]}>{price === 0 ? "Free" : naira(price)}</Text>
          {price !== 0 ? (
            <Text style={[styles.per, hero && { color: "rgba(255,255,255,0.7)" }]}>
              per {period === "monthly" ? "month" : "year"}
            </Text>
          ) : null}
        </View>

        <View style={styles.features}>
          <Feature value={t.radius} label="alert radius" hero={hero} />
          <Feature value={t.retention} label="history" hero={hero} />
          <Feature value={t.ads} label="" hero={hero} />
          <Feature value={t.verification} label="verification" hero={hero} />
        </View>

        {isCurrent ? (
          <View style={[styles.ctaGhost, hero && { borderColor: "rgba(255,255,255,0.3)" }]}>
            <Text style={[styles.ctaGhostText, hero && { color: "#FFFFFF" }]}>Your current plan</Text>
          </View>
        ) : canBuy(t.id) ? (
          <Pressable
            style={[styles.cta, hero && styles.ctaOnHero]}
            onPress={() => navigation.navigate("Checkout", { tierId: t.id, tierName: t.name, price, period })}
          >
            <Text style={[styles.ctaText, hero && { color: colors.ink }]}>Choose {t.name}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  const basic = TIERS.filter((t) => !t.paid);
  const paid = TIERS.filter((t) => t.paid);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtnPlain} hitSlop={8}>
          <ArrowLeft size={20} color={colors.ink} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headTitle}>Plans</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.lead}>Choose your coverage</Text>
        <Text style={styles.sub}>A wider alert radius and longer history. Cancel at any time.</Text>

        {basic.map((t) => <Tier key={t.id} t={t} />)}

        <View style={styles.segment}>
          {(["monthly", "annual"] as Period[]).map((p) => {
            const on = period === p;
            return (
              <Pressable key={p} style={[styles.segmentBtn, on && styles.segmentBtnOn]} onPress={() => setPeriod(p)}>
                <Text style={[styles.segmentText, on && styles.segmentTextOn]}>
                  {p === "monthly" ? "Monthly" : "Annual"}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {period === "annual" ? <Text style={styles.saveHint}>Two months free on annual plans</Text> : null}

        {paid.map((t) => <Tier key={t.id} t={t} />)}

        <View style={styles.customCard}>
          <View style={styles.customHead}>
            <Globe size={18} color={colors.ink} strokeWidth={2.2} />
            <Text style={styles.customTitle}>Custom coverage</Text>
          </View>
          <Text style={styles.customSub}>
            Reach your own people beyond 500 km. A recurring monthly add-on, available on any plan.
          </Text>

          {!customUnlimited ? (
            <>
              <View style={styles.stepperRow}>
                <Pressable style={styles.stepBtn} onPress={() => stepKm(-100)}>
                  <Minus size={19} color={colors.ink} strokeWidth={2.5} />
                </Pressable>
                <View style={{ alignItems: "center", flex: 1 }}>
                  <Text style={styles.kmValue}>{customKm.toLocaleString()} km</Text>
                  <Text style={styles.kmHint}>Adjust in 100 km steps</Text>
                </View>
                <Pressable style={styles.stepBtn} onPress={() => stepKm(100)}>
                  <Plus size={19} color={colors.ink} strokeWidth={2.5} />
                </Pressable>
              </View>
              <View style={styles.quoteRow}>
                <Text style={styles.quoteLabel}>Monthly</Text>
                <Text style={styles.quoteValue}>{customQuote != null ? naira(customQuote) : "..."}</Text>
              </View>
            </>
          ) : (
            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Global, unlimited</Text>
              <Text style={styles.quoteValue}>{customQuote != null ? naira(customQuote) + " per month" : "..."}</Text>
            </View>
          )}

          <Pressable
            style={[styles.unlimitedToggle, customUnlimited && styles.unlimitedToggleOn]}
            onPress={() => setCustomUnlimited((v) => !v)}
          >
            <Globe size={16} color={customUnlimited ? colors.accent : colors.ink} strokeWidth={2.2} />
            <Text style={[styles.unlimitedText, customUnlimited && { color: colors.accent }]}>
              {customUnlimited ? "Unlimited selected. Tap for custom distance." : "Or go global and unlimited"}
            </Text>
          </Pressable>

          <Pressable
            style={styles.customBuy}
            onPress={() => navigation.navigate("Checkout", {
              tierId: customUnlimited ? "custom_unlimited" : "custom",
              tierName: customUnlimited ? "Global coverage" : "Custom " + customKm.toLocaleString() + " km",
              price: customQuote ?? 0,
              period: "monthly",
              customKm: customUnlimited ? null : customKm,
              customUnlimited,
            })}
          >
            <Text style={styles.customBuyText}>Get this coverage</Text>
          </Pressable>
        </View>

        <Text style={styles.foot}>
          A network of up to 7 people and video capture are included on every plan. The panic alert
          radius for nearby strangers is fixed and does not change with your plan.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { height: 36, flexDirection: "row", alignItems: "center", marginHorizontal: spacing.gutter, marginTop: spacing.md },
  headBtnPlain: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headTitle: { flex: 1, ...type.heading, color: colors.ink, textAlign: "center" },

  scroll: { paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  lead: { ...type.title, color: colors.ink },
  sub: { ...type.label, fontWeight: "400", color: colors.textMuted, marginTop: 4, marginBottom: spacing.lg },

  segment: {
    flexDirection: "row", backgroundColor: "#F0F0F0", borderRadius: radius.sm,
    marginTop: spacing.lg, padding: 4, gap: 4,
  },
  segmentBtn: { flex: 1, height: 36, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  segmentBtnOn: { backgroundColor: "#333333" },
  segmentText: { fontSize: 13, lineHeight: 17, fontWeight: "500", color: "#91958E" },
  segmentTextOn: { color: "#FFFFFF", fontWeight: "600" },
  saveHint: { ...type.caption, fontWeight: "600", color: colors.ink, textAlign: "center", marginTop: spacing.sm },

  card: {
    backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginTop: spacing.md,
  },
  cardHero: { backgroundColor: colors.ink, borderColor: colors.ink, ...elevation.card },
  cardCurrent: { borderColor: colors.borderStrong },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tierName: { ...type.subheading, color: colors.ink },
  badge: { backgroundColor: "#F0F0F0", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 11, lineHeight: 15, fontWeight: "600", color: colors.ink },
  badgeLime: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  badgeLimeText: { fontSize: 11, lineHeight: 15, fontWeight: "700", color: colors.ink },

  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: spacing.sm },
  price: { ...type.title, color: colors.ink },
  per: { ...type.caption, color: colors.textMuted },

  features: { marginTop: spacing.md, gap: 8 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  featureText: { ...type.caption, color: colors.textMuted, flex: 1 },
  featureValue: { fontWeight: "700", color: colors.ink },

  cta: { height: 48, borderRadius: radius.sm, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center", marginTop: spacing.md },
  ctaOnHero: { backgroundColor: colors.accent },
  ctaText: { ...type.label, fontWeight: "600", color: colors.accent },
  ctaGhost: {
    height: 48, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center", marginTop: spacing.md,
  },
  ctaGhostText: { ...type.label, fontWeight: "600", color: colors.textMuted },

  customCard: { backgroundColor: "#FAFAFA", borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg },
  customHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  customTitle: { ...type.subheading, color: colors.ink },
  customSub: { ...type.caption, color: colors.textMuted, marginTop: 6, lineHeight: 17 },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md },
  stepBtn: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center", backgroundColor: colors.bg,
  },
  kmValue: { ...type.subheading, color: colors.ink },
  kmHint: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  quoteRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border,
  },
  quoteLabel: { ...type.label, fontWeight: "500", color: colors.ink },
  quoteValue: { ...type.subheading, color: colors.ink },
  unlimitedToggle: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    height: 44, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, marginTop: spacing.md,
  },
  unlimitedToggleOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  unlimitedText: { ...type.caption, fontWeight: "600", color: colors.ink },
  customBuy: { height: 48, borderRadius: radius.sm, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center", marginTop: spacing.md },
  customBuyText: { ...type.label, fontWeight: "600", color: colors.accent },
  foot: { ...type.caption, color: colors.textMuted, lineHeight: 17, marginTop: spacing.lg },
});
