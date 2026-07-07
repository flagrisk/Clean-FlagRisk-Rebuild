// Support: the user's request threads. Login-only. New request opens a compose modal;
// tapping a ticket opens its thread.
import { useCallback, useState } from "react";
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Plus, MessageCircle, X } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing } from "../theme";
import { showAlert } from "../components/Feedback";

type Ticket = { id: string; subject: string; status: string; updated_at: string; last_message: string | null; last_sender: string | null };

export function SupportScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { colors, glass, gradients, glow } = useTheme();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc("my_support_tickets");
    setTickets(data ?? []);
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function submit() {
    if (busy) return;
    if (subject.trim() === "" || message.trim() === "") {
      showAlert({ title: "Add details", message: "Please enter a subject and a message." });
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("create_support_ticket", { p_subject: subject.trim(), p_first_message: message.trim() });
    setBusy(false);
    if (error) { showAlert({ title: "Could not send", message: error.message ?? "Please try again.", tone: "error" }); return; }
    setComposeOpen(false); setSubject(""); setMessage("");
    load();
    if (data) navigation.navigate("SupportThread", { ticketId: data, subject: subject.trim(), status: "open" });
  }

  function statusColor(s: string) {
    if (s === "answered") return colors.accentOn;
    if (s === "resolved") return colors.textFaint;
    if (s === "closed") return colors.textFaint;
    return colors.textMuted;
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={[styles.back, { color: colors.accentOn }]}>‹ Back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Support</Text>
      </View>

      {loading ? (
        <Text style={[styles.muted, { color: colors.textMuted, padding: spacing.lg }]}>Loading...</Text>
      ) : tickets.length === 0 ? (
        <View style={styles.empty}>
          <MessageCircle size={32} color={colors.textMuted} strokeWidth={2} />
          <Text style={[styles.emptyText, { color: colors.text }]}>No requests yet.</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>Have a question or a problem? Send us a message and we will get back to you.</Text>
        </View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 90, gap: spacing.sm }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => navigation.navigate("SupportThread", { ticketId: item.id, subject: item.subject, status: item.status })}
              style={[styles.row, { backgroundColor: glass.surface, borderColor: glass.stroke, boxShadow: glow.soft } as any]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.subject, { color: colors.text }]} numberOfLines={1}>{item.subject}</Text>
                <Text style={[styles.preview, { color: colors.textMuted }]} numberOfLines={1}>
                  {item.last_sender === "support" ? "Support: " : ""}{item.last_message ?? ""}
                </Text>
              </View>
              <Text style={[styles.status, { color: statusColor(item.status) }]}>{item.status}</Text>
            </Pressable>
          )}
        />
      )}

      <Pressable style={[styles.fab, { bottom: insets.bottom + spacing.lg }]} onPress={() => setComposeOpen(true)}>
        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.fabInner, { boxShadow: glow.brand } as any]}>
          <Plus size={22} color={colors.accentText} strokeWidth={2.5} />
          <Text style={[styles.fabText, { color: colors.accentText }]}>New request</Text>
        </LinearGradient>
      </Pressable>

      <Modal visible={composeOpen} transparent animationType="slide" onRequestClose={() => setComposeOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalWrap}>
          <View style={[styles.sheet, { backgroundColor: colors.bg, paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.sheetHead}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>New request</Text>
              <Pressable onPress={() => setComposeOpen(false)} hitSlop={10}><X size={22} color={colors.textMuted} /></Pressable>
            </View>
            <TextInput
              value={subject} onChangeText={setSubject} placeholder="Subject" placeholderTextColor={colors.textFaint}
              style={[styles.input, { color: colors.text, borderColor: glass.stroke, backgroundColor: glass.surface }]}
            />
            <TextInput
              value={message} onChangeText={setMessage} placeholder="How can we help?" placeholderTextColor={colors.textFaint}
              multiline
              style={[styles.input, styles.multiline, { color: colors.text, borderColor: glass.stroke, backgroundColor: glass.surface }]}
            />
            <Pressable onPress={submit} disabled={busy} style={{ marginTop: spacing.md }}>
              <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.sendBtn, { boxShadow: glow.brand, opacity: busy ? 0.6 : 1 } as any]}>
                <Text style={[styles.sendText, { color: colors.accentText }]}>{busy ? "Sending..." : "Send"}</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  back: { fontSize: 16, fontWeight: "700" },
  headerTitle: { fontSize: 18, fontWeight: "800", position: "absolute", left: 0, right: 0, textAlign: "center", zIndex: -1 },
  muted: { fontSize: 14 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.xl },
  emptyText: { fontSize: 16, fontWeight: "700" },
  emptySub: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: 16, borderRadius: radius.md, borderWidth: 1 },
  subject: { fontSize: 15, fontWeight: "700" },
  preview: { fontSize: 13, marginTop: 2 },
  status: { fontSize: 12, fontWeight: "700", textTransform: "capitalize" },
  fab: { position: "absolute", right: spacing.lg },
  fabInner: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 13, paddingHorizontal: 20, borderRadius: radius.lg },
  fabText: { fontSize: 15, fontWeight: "800" },
  modalWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  sheetTitle: { fontSize: 18, fontWeight: "800" },
  input: { borderWidth: 1, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, marginTop: spacing.sm },
  multiline: { minHeight: 100, textAlignVertical: "top" },
  sendBtn: { paddingVertical: 14, borderRadius: radius.lg, alignItems: "center" },
  sendText: { fontSize: 16, fontWeight: "800" },
});
