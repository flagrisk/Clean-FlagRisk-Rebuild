// ============================================================================
// Payment history - FlagRisk v2.1
// Designed, not rebuilt: no mockup exists for commerce.
//   header | rows: 40pt receipt tile, plan and period, date, amount + status pill
// Data logic unchanged: payments joined to subscriptions on provider_ref.
// ============================================================================
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { ArrowLeft, Receipt } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { colors, radius, spacing, type, screenBottomPad } from "../theme";

function money(n: number, ccy: string) { return (ccy || "NGN") + " " + Number(n || 0).toLocaleString(); }
function cap(s: string) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }
function fmtDate(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}
function statusMeta(s: string) {
  if (s === "succeeded") return { label: "Paid", fg: "#1C9D6B", bg: "#D2F0E3" };
  if (s === "refunded") return { label: "Refunded", fg: "#B26A12", bg: "#FDE7CF" };
  if (s === "failed") return { label: "Failed", fg: colors.riskHigh, bg: "#FBD1CF" };
  if (s === "pending") return { label: "Pending", fg: colors.textMuted, bg: "#EBEBEB" };
  return { label: cap(s || ""), fg: colors.textMuted, bg: "#EBEBEB" };
}

export function PaymentHistoryScreen() {
  const navigation = useNavigation<any>();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    const uid = u && u.user ? u.user.id : null;
    if (!uid) { setItems([]); setLoading(false); return; }
    const { data: pays } = await supabase
      .from("payments")
      .select("id, amount, currency, status, paid_at, created_at, provider_ref")
      .eq("user_id", uid)
      .order("paid_at", { ascending: false });
    const rows = pays || [];
    const refs = rows.map((r: any) => r.provider_ref).filter(Boolean);
    const subMap: any = {};
    if (refs.length) {
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("provider_ref, tier, billing_interval")
        .in("provider_ref", refs);
      (subs || []).forEach((s: any) => { subMap[s.provider_ref] = s; });
    }
    setItems(rows.map((r: any) => {
      const s = subMap[r.provider_ref] || {};
      return {
        id: r.id,
        amount: Number(r.amount),
        currency: r.currency,
        status: r.status,
        date: fmtDate(r.paid_at || r.created_at),
        plan: s.tier ? cap(s.tier) : "Coverage",
        period: s.billing_interval ? cap(s.billing_interval) : "",
      };
    }));
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtnPlain} hitSlop={8}>
          <ArrowLeft size={20} color={colors.ink} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headTitle}>Payment history</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.ink} style={{ marginTop: 40 }} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Receipt size={34} color={colors.textFaint} strokeWidth={1.8} />
          <Text style={styles.emptyTitle}>No payments yet</Text>
          <Text style={styles.emptySub}>Receipts for your plan and any coverage add-ons will appear here.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(r) => r.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, paddingBottom: screenBottomPad }}
          renderItem={({ item }) => {
            const st = statusMeta(item.status);
            return (
              <View style={styles.row}>
                <View style={styles.tile}>
                  <Receipt size={18} color={colors.ink} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.plan} numberOfLines={1}>
                    {item.plan}{item.period ? ", " + item.period : ""}
                  </Text>
                  <Text style={styles.date}>{item.date}</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 5 }}>
                  <Text style={styles.amount}>{money(item.amount, item.currency)}</Text>
                  <View style={[styles.pill, { backgroundColor: st.bg }]}>
                    <Text style={[styles.pillText, { color: st.fg }]}>{st.label}</Text>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { height: 36, flexDirection: "row", alignItems: "center", marginHorizontal: spacing.gutter, marginTop: spacing.md },
  headBtnPlain: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headTitle: { flex: 1, ...type.heading, color: colors.ink, textAlign: "center" },

  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.ms,
    paddingVertical: spacing.ms, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  tile: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: "#F0F0F0", alignItems: "center", justifyContent: "center" },
  plan: { ...type.label, fontWeight: "600", color: colors.ink },
  date: { ...type.caption, color: colors.textMuted, marginTop: 3 },
  amount: { ...type.label, fontWeight: "600", color: colors.ink },
  pill: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontSize: 10, lineHeight: 14, fontWeight: "600" },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, gap: 8 },
  emptyTitle: { ...type.subheading, color: colors.ink },
  emptySub: { ...type.caption, color: colors.textMuted, textAlign: "center", lineHeight: 18 },
});
