// Payment History (V2). Reads real payments joined to their subscription tier/interval.
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Receipt } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing } from "../theme";

function naira(n: number, ccy: string) { return (ccy || "NGN") + " " + Number(n || 0).toLocaleString(); }
function cap(s: string) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }
function fmtDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}
function statusLabel(s: string) {
  if (s === "succeeded") return "Paid";
  if (s === "refunded") return "Refunded";
  if (s === "failed") return "Failed";
  if (s === "pending") return "Pending";
  return cap(s || "");
}

export function PaymentHistoryScreen() {
  const navigation = useNavigation<any>();
  const { colors, glass, gradients, glow } = useTheme();
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
    let subMap: any = {};
    if (refs.length) {
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("provider_ref, tier, billing_interval")
        .in("provider_ref", refs);
      (subs || []).forEach((s: any) => { subMap[s.provider_ref] = s; });
    }
    const merged = rows.map((r: any) => {
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
    });
    setItems(merged);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={[styles.back, { color: colors.accentOn }]}>Back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Payment History</Text>
        <View style={{ width: 50 }} />
      </View>

      {loading ? (
        <View style={styles.empty}><ActivityIndicator color={colors.accentOn} /></View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={[styles.emptyChip, { boxShadow: glow.brand } as any]}>
            <Receipt size={30} color={colors.accentText} strokeWidth={2} />
          </LinearGradient>
          <Text style={[styles.emptyText, { color: colors.text }]}>No payments yet.</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>Your receipts will appear here after you upgrade.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          {items.map((t) => (
            <View key={t.id} style={[styles.row, { backgroundColor: glass.surface, borderColor: glass.stroke, boxShadow: glow.soft } as any]}>
              <View style={[styles.rowChip, { backgroundColor: colors.accentOn + "1f", borderColor: colors.accentOn + "44" }]}>
                <Receipt size={18} color={colors.accentOn} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.plan, { color: colors.text }]}>{t.period ? t.plan + " - " + t.period : t.plan}</Text>
                <Text style={[styles.date, { color: colors.textMuted }]}>{t.date}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.amount, { color: colors.text }]}>{naira(t.amount, t.currency)}</Text>
                <View style={[styles.badge, { backgroundColor: colors.safe + "22", borderColor: colors.safe }]}>
                  <Text style={[styles.badgeText, { color: colors.safe }]}>{statusLabel(t.status)}</Text>
                </View>
              </View>
            </View>
          ))}
          <Text style={[styles.foot, { color: colors.textMuted }]}>Showing recent transactions.</Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { fontSize: 16, fontWeight: "700" },
  headerTitle: { fontSize: 18, fontWeight: "800" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyChip: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  emptyText: { fontSize: 16, fontWeight: "700" },
  emptySub: { fontSize: 14, marginTop: 4, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md },
  rowChip: { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  plan: { fontSize: 15, fontWeight: "700" },
  date: { fontSize: 13, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: "800" },
  badge: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  foot: { fontSize: 12, textAlign: "center", marginTop: spacing.md },
});
