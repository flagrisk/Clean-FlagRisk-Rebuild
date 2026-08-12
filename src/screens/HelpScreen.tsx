// ============================================================================
// Help and FAQs - FlagRisk v2.1
// Designed, not rebuilt: no mockup exists.
//   header | search | category group labels | flat rows with chevron
// Reachable before login, so it uses no authenticated calls.
// Search added because a list of articles with no filter is the reason people
// give up and open a support ticket instead.
// ============================================================================
import { useCallback, useMemo, useState } from "react";
import { Pressable, SectionList, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { ArrowLeft, ChevronRight, Search, LifeBuoy } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { colors, radius, spacing, type, screenBottomPad } from "../theme";

type Article = { id: string; category: string; title: string; body: string; sort_order: number };

export function HelpScreen() {
  const navigation = useNavigation<any>();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc("list_help_articles");
    setArticles(data ?? []);
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? articles.filter((a) =>
          a.title.toLowerCase().includes(q) || (a.body ?? "").toLowerCase().includes(q))
      : articles;
    const out: { title: string; data: Article[] }[] = [];
    filtered.forEach((a) => {
      let g = out.find((x) => x.title === a.category);
      if (!g) { g = { title: a.category, data: [] }; out.push(g); }
      g.data.push(a);
    });
    return out;
  }, [articles, query]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtnPlain} hitSlop={8}>
          <ArrowLeft size={20} color={colors.ink} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headTitle}>Help and FAQs</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.searchWrap}>
        <Search size={16} color="#8B8F96" strokeWidth={2} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search help"
          placeholderTextColor="#8B8F96"
          style={styles.searchInput}
        />
      </View>

      {loading ? (
        <Text style={styles.loading}>Loading</Text>
      ) : sections.length === 0 ? (
        <View style={styles.empty}>
          <LifeBuoy size={32} color={colors.textFaint} strokeWidth={1.8} />
          <Text style={styles.emptyTitle}>
            {query ? "Nothing matches that search" : "Help articles are on the way"}
          </Text>
          <Text style={styles.emptySub}>
            {query ? "Try a different word." : "In the meantime, contact support and we will answer directly."}
          </Text>
          <Pressable style={styles.emptyBtn} onPress={() => navigation.navigate("Support")}>
            <Text style={styles.emptyBtnText}>Contact support</Text>
          </Pressable>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(a) => a.id}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, paddingBottom: screenBottomPad }}
          renderSectionHeader={({ section }) => <Text style={styles.groupLabel}>{section.title}</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => navigation.navigate("HelpArticle", { title: item.title, body: item.body })}
            >
              <Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text>
              <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />
            </Pressable>
          )}
          ListFooterComponent={
            <Pressable style={styles.footerCard} onPress={() => navigation.navigate("Support")}>
              <Text style={styles.footerTitle}>Still stuck?</Text>
              <Text style={styles.footerSub}>Send us a message and we will get back to you.</Text>
            </Pressable>
          }
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

  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    height: 42, borderRadius: radius.md, backgroundColor: "#F1F2F5", borderWidth: 1, borderColor: "rgba(20,21,42,0.14)",
    marginHorizontal: spacing.gutter, marginTop: spacing.lg, paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, ...type.label, fontWeight: "400", color: colors.ink, padding: 0 },
  loading: { ...type.caption, color: colors.textMuted, textAlign: "center", marginTop: spacing.xl },

  groupLabel: { fontSize: 12, lineHeight: 24, fontWeight: "600", color: colors.ink, marginTop: spacing.md },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.ms,
    paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  rowTitle: { flex: 1, ...type.label, fontWeight: "500", color: colors.ink, lineHeight: 20 },

  footerCard: { backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.xl },
  footerTitle: { ...type.label, fontWeight: "600", color: colors.ink },
  footerSub: { ...type.caption, color: colors.textMuted, marginTop: 3 },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, gap: 8 },
  emptyTitle: { ...type.subheading, color: colors.ink, textAlign: "center" },
  emptySub: { ...type.caption, color: colors.textMuted, textAlign: "center", lineHeight: 18 },
  emptyBtn: { height: 48, borderRadius: radius.md, backgroundColor: "#F7F7F7", borderWidth: 1, borderColor: "rgba(20,21,42,0.10)", alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, marginTop: spacing.md },
  emptyBtnText: { ...type.label, fontWeight: "600", color: colors.ink },
});
