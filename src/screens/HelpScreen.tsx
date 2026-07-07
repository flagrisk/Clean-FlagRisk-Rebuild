// Help & FAQ. Public: reachable before login (list_help_articles is granted to anon).
// Lists published articles grouped by category; tap to read.
import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { ChevronRight, LifeBuoy } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing } from "../theme";

type Article = { id: string; category: string; title: string; body: string; sort_order: number };

export function HelpScreen() {
  const navigation = useNavigation<any>();
  const { colors, glass, glow } = useTheme();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc("list_help_articles");
    setArticles(data ?? []);
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Group into [{ category, items[] }] preserving order.
  const groups: { category: string; items: Article[] }[] = [];
  for (const a of articles) {
    let g = groups.find((x) => x.category === a.category);
    if (!g) { g = { category: a.category, items: [] }; groups.push(g); }
    g.items.push(a);
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={[styles.back, { color: colors.accentOn }]}>‹ Back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Help & FAQ</Text>
      </View>
      {loading ? (
        <Text style={[styles.muted, { color: colors.textMuted, padding: spacing.lg }]}>Loading...</Text>
      ) : articles.length === 0 ? (
        <View style={styles.empty}>
          <LifeBuoy size={32} color={colors.textMuted} strokeWidth={2} />
          <Text style={[styles.emptyText, { color: colors.text }]}>Help articles are on the way.</Text>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.category}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60, gap: spacing.lg }}
          renderItem={({ item: group }) => (
            <View style={{ gap: spacing.sm }}>
              <Text style={[styles.category, { color: colors.textMuted }]}>{group.category}</Text>
              {group.items.map((a) => (
                <Pressable
                  key={a.id}
                  onPress={() => navigation.navigate("HelpArticle", { title: a.title, body: a.body })}
                  style={[styles.row, { backgroundColor: glass.surface, borderColor: glass.stroke, boxShadow: glow.soft } as any]}
                >
                  <Text style={[styles.rowTitle, { color: colors.text, flex: 1 }]}>{a.title}</Text>
                  <ChevronRight size={20} color={colors.textMuted} strokeWidth={2} />
                </Pressable>
              ))}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  back: { fontSize: 16, fontWeight: "700" },
  headerTitle: { fontSize: 18, fontWeight: "800", position: "absolute", left: 0, right: 0, textAlign: "center", zIndex: -1 },
  muted: { fontSize: 14 },
  category: { fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginLeft: 4 },
  row: { flexDirection: "row", alignItems: "center", padding: 16, borderRadius: radius.md, borderWidth: 1 },
  rowTitle: { fontSize: 15, fontWeight: "600" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.xl },
  emptyText: { fontSize: 15, fontWeight: "600" },
});
