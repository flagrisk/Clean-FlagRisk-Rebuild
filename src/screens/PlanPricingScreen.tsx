// Plan & Pricing (V2). UI-only; tiers + prices in TIERS config. Toggle sits
// below Basic and governs paid tiers only. Choose -> Checkout.
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Check, Plus, Minus, Globe } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing } from "../theme";

type Period = "monthly" | "annual";

const TIERS = [
  { id: "basic", name: "Basic", monthly: 0, annual: 0, radius: "5 km", retention: "7 days", ads: "Light ads", verification: "Standard", paid: false, grad: ["#888","#888"] as const },
  { id: "standard", name: "Standard", monthly: 700, annual: 7000, radius: "15 km", retention: "30 days", ads: "Ad-free", verification: "Standard", paid: true, grad: ["#5e9e1a","#8fd13f"] as const },
  { id: "pro", name: "Pro", monthly: 1300, annual: 13000, radius: "50 km", retention: "90 days", ads: "Ad-free", verification: "Standard", paid: true, grad: ["#2f7d12","#5fae28"] as const },
  { id: "premium", name: "Premium", monthly: 2500, annual: 25000, radius: "500 km", retention: "180 days", ads: "Ad-free", verification: "Priority", paid: true, grad: ["#14532d","#2f7d3f"] as const },
];

function naira(n: number) { return "NGN " + n.toLocaleString(); }

export function PlanPricingScreen() {
  const navigation = useNavigation<any>();
  const { colors, glass, gradients, glow } = useTheme();
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

  const Feature = ({ label, value, onTile }: { label: string; value: string; onTile: boolean }) => (
    <View style={styles.featureRow}>
      <Check size={15} color={onTile ? "#fff" : colors.accentOn} strokeWidth={2.5} />
      <Text style={[styles.featureText, { color: onTile ? "rgba(255,255,255,0.95)" : colors.textMuted }]}>
        <Text style={{ fontWeight: "700", color: onTile ? "#fff" : colors.text }}>{value}</Text> {label}
      </Text>
    </View>
  );

  const renderTier = (t: typeof TIERS[number]) => {
    const price = period === "monthly" ? t.monthly : t.annual;
    const isCurrent = current === t.id;
    const tile = t.paid;
    const Wrapper: any = tile ? LinearGradient : View;
    const wrapperProps = tile
      ? { colors: t.grad, start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, style: [styles.card, { boxShadow: glow.brand } as any] }
      : { style: [styles.card, { backgroundColor: glass.surface, borderColor: glass.stroke, borderWidth: 1 }] };
    return (
      <Wrapper key={t.id} {...wrapperProps}>
        <View style={styles.cardTop}>
          <Text style={[styles.tierName, { color: tile ? "#fff" : colors.text }]}>{t.name}</Text>
          {isCurrent && (
            <View style={[styles.currentBadge, { backgroundColor: tile ? "rgba(255,255,255,0.22)" : colors.accentOn + "22" }]}>
              <Text style={[styles.currentText, { color: tile ? "#fff" : colors.accentOn }]}>Current</Text>
            </View>
          )}
        </View>
        <View style={styles.priceRow}>
          <Text style={[styles.price, { color: tile ? "#fff" : colors.text }]}>{price === 0 ? "Free" : naira(price)}</Text>
          {price !== 0 && <Text style={[styles.per, { color: tile ? "rgba(255,255,255,0.85)" : colors.textMuted }]}>/{period === "monthly" ? "mo" : "yr"}</Text>}
        </View>
        <View style={styles.features}>
          <Feature label="alert radius" value={t.radius} onTile={tile} />
          <Feature label="history" value={t.retention} onTile={tile} />
          <Feature label="" value={t.ads} onTile={tile} />
          <Feature label="verification" value={t.verification} onTile={tile} />
        </View>
        {!isCurrent && canBuy(t) && (
          <Pressable onPress={() => navigation.navigate("Checkout", { tierId: t.id, tierName: t.name, price, period })}>
            {tile ? (
              <View style={styles.chooseOnTile}><Text style={[styles.chooseText, { color: "#1a4012" }]}>Choose {t.name}</Text></View>
            ) : (
              <View style={[styles.chooseGhost, { borderColor: glass.strokeStrong }]}><Text style={[styles.chooseText, { color: colors.text }]}>Stay on Basic</Text></View>
            )}
          </Pressable>
        )}
      </Wrapper>
    );
  };

  const basic = TIERS.find((t) => !t.paid)!;
  const paid = TIERS.filter((t) => t.paid);
  const RANK: any = { basic: 0, standard: 1, pro: 2, premium: 3 };
  const canBuy = (t: any) => (RANK[t.id] ?? 99) > (RANK[current] ?? 0);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={[styles.back, { color: colors.accentOn }]}>Back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Plans</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }}>
        <Text style={[styles.lead, { color: colors.text }]}>Choose your coverage</Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>A wider alert radius and longer history. Cancel anytime.</Text>

        {renderTier(basic)}

        <View style={[styles.toggle, { backgroundColor: glass.surface, borderColor: glass.stroke }]}>
          {(["monthly", "annual"] as Period[]).map((p) => {
            const active = period === p;
            return (
              <Pressable key={p} style={{ flex: 1 }} onPress={() => setPeriod(p)}>
                {active ? (
                  <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.toggleBtn}>
                    <Text style={{ color: colors.accentText, fontWeight: "800", fontSize: 14 }}>{p === "monthly" ? "Monthly" : "Annual"}</Text>
                  </LinearGradient>
                ) : (
                  <View style={styles.toggleBtn}><Text style={{ color: colors.textMuted, fontWeight: "700", fontSize: 14 }}>{p === "monthly" ? "Monthly" : "Annual"}</Text></View>
                )}
              </Pressable>
            );
          })}
        </View>
        {period === "annual" && <Text style={[styles.saveHint, { color: colors.accentOn }]}>2 months free on annual plans</Text>}

        {paid.map(renderTier)}

        <View style={[styles.customCard, { backgroundColor: glass.surface, borderColor: glass.stroke }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Globe size={18} color={colors.accentOn} strokeWidth={2.2} />
            <Text style={[styles.customTitle, { color: colors.text }]}>Custom coverage</Text>
          </View>
          <Text style={[styles.customSub, { color: colors.textMuted }]}>Reach your own people beyond 500 km. A recurring monthly add-on, available on any plan.</Text>

          {!customUnlimited ? (
            <>
              <View style={styles.stepperRow}>
                <Pressable style={[styles.stepBtn, { borderColor: glass.strokeStrong }]} onPress={() => stepKm(-100)}>
                  <Minus size={20} color={colors.text} strokeWidth={2.5} />
                </Pressable>
                <View style={{ alignItems: "center", flex: 1 }}>
                  <Text style={[styles.kmValue, { color: colors.text }]}>{customKm.toLocaleString()} km</Text>
                  <Text style={[styles.kmHint, { color: colors.textMuted }]}>adjust in 100 km steps</Text>
                </View>
                <Pressable style={[styles.stepBtn, { borderColor: glass.strokeStrong }]} onPress={() => stepKm(100)}>
                  <Plus size={20} color={colors.text} strokeWidth={2.5} />
                </Pressable>
              </View>
              <View style={styles.quoteRow}>
                <Text style={[styles.quoteLabel, { color: colors.textMuted }]}>Monthly</Text>
                <Text style={[styles.quoteValue, { color: colors.accentOn }]}>{customQuote != null ? naira(customQuote) : "..."}</Text>
              </View>
            </>
          ) : (
            <View style={styles.quoteRow}>
              <Text style={[styles.quoteLabel, { color: colors.text }]}>Global / Unlimited</Text>
              <Text style={[styles.quoteValue, { color: colors.accentOn }]}>{customQuote != null ? naira(customQuote) + "/mo" : "..."}</Text>
            </View>
          )}

          <Pressable style={[styles.unlimitedToggle, { borderColor: customUnlimited ? colors.accentOn : glass.strokeStrong }]}
            onPress={() => setCustomUnlimited((v) => !v)}>
            <Globe size={16} color={customUnlimited ? colors.accentOn : colors.textMuted} strokeWidth={2.2} />
            <Text style={[styles.unlimitedText, { color: customUnlimited ? colors.accentOn : colors.textMuted }]}>
              {customUnlimited ? "Unlimited selected, tap for custom km" : "Or go Global / Unlimited"}
            </Text>
          </Pressable>

          <Pressable onPress={() => navigation.navigate("Checkout", {
            tierId: customUnlimited ? "custom_unlimited" : "custom",
            tierName: customUnlimited ? "Global Coverage" : `Custom ${customKm.toLocaleString()} km`,
            price: customQuote ?? 0, period: "monthly",
            customKm: customUnlimited ? null : customKm, customUnlimited,
          })}>
            <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.customBuy, { boxShadow: glow.brand } as any]}>
              <Text style={[styles.customBuyText, { color: colors.accentText }]}>Get this coverage</Text>
            </LinearGradient>
          </Pressable>
        </View>

        <Text style={[styles.foot, { color: colors.textMuted }]}>Network of 7 and video capture are included on every plan. Panic 300 m stranger radius is fixed.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { fontSize: 16, fontWeight: "700" },
  headerTitle: { fontSize: 18, fontWeight: "800" },
  lead: { fontSize: 24, fontWeight: "800" },
  sub: { fontSize: 14, marginTop: 4, marginBottom: spacing.lg },
  toggle: { flexDirection: "row", borderRadius: radius.md, borderWidth: 1, padding: 4, gap: 4, marginTop: spacing.lg },
  toggleBtn: { height: 42, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  saveHint: { fontSize: 13, fontWeight: "700", textAlign: "center", marginTop: spacing.sm },
  card: { borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.md, overflow: "hidden" },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tierName: { fontSize: 20, fontWeight: "800" },
  currentBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
  currentText: { fontSize: 12, fontWeight: "800" },
  priceRow: { flexDirection: "row", alignItems: "flex-end", marginTop: 6, gap: 4 },
  price: { fontSize: 30, fontWeight: "900" },
  per: { fontSize: 15, fontWeight: "600", marginBottom: 5 },
  features: { marginTop: spacing.md, gap: 8 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  featureText: { fontSize: 14 },
  chooseOnTile: { backgroundColor: "#ffffff", height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginTop: spacing.md },
  chooseGhost: { height: 48, borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center", marginTop: spacing.md },
  chooseText: { fontSize: 15, fontWeight: "800" },
  customCard: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, marginTop: spacing.lg },
  customTitle: { fontSize: 18, fontWeight: "800" },
  customSub: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  stepperRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.lg, gap: spacing.md },
  stepBtn: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  kmValue: { fontSize: 26, fontWeight: "900" },
  kmHint: { fontSize: 12, marginTop: 2 },
  quoteRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.lg },
  quoteLabel: { fontSize: 15, fontWeight: "600" },
  quoteValue: { fontSize: 22, fontWeight: "900" },
  unlimitedToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderRadius: radius.md, height: 46, marginTop: spacing.lg },
  unlimitedText: { fontSize: 14, fontWeight: "700" },
  customBuy: { height: 52, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginTop: spacing.md },
  customBuyText: { fontSize: 16, fontWeight: "800" },
  foot: { fontSize: 12, lineHeight: 18, marginTop: spacing.xl, textAlign: "center" },
});




