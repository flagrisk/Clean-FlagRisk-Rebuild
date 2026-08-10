// ============================================================================
// Help article - FlagRisk v2.1
// Designed, not rebuilt: no mockup exists.
// Title and body passed via route params. Reading measure is capped and the
// body runs at 16/25, which is the comfortable setting for long prose.
// ============================================================================
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { ArrowLeft } from "lucide-react-native";
import { colors, radius, spacing, type } from "../theme";

export function HelpArticleScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const title = route.params?.title ?? "Help";
  const body = route.params?.body ?? "";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtnPlain} hitSlop={8}>
          <ArrowLeft size={20} color={colors.ink} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headTitle}>Help</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>

        <Pressable style={styles.footerCard} onPress={() => navigation.navigate("Support")}>
          <Text style={styles.footerTitle}>Did this answer your question?</Text>
          <Text style={styles.footerSub}>If not, send us a message and we will help directly.</Text>
        </Pressable>
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
  title: { ...type.title, color: colors.ink, lineHeight: 32 },
  body: { ...type.body, color: colors.ink, lineHeight: 25, marginTop: spacing.md },

  footerCard: { backgroundColor: "#FAFAFA", borderRadius: radius.md, padding: spacing.md, marginTop: spacing.xxl },
  footerTitle: { ...type.label, fontWeight: "600", color: colors.ink },
  footerSub: { ...type.caption, color: colors.textMuted, marginTop: 3 },
});
