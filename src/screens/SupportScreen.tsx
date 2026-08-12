// ============================================================================
// Support - FlagRisk v2.1
// Designed, not rebuilt: no mockup exists.
//   header | ticket rows with status pill | 48pt ink FAB to compose
//   compose sheet: subject, message, send
//
// Copy addition: the empty state and the compose sheet now state a response
// window. Two testers sent a support message, got no acknowledgement, and one
// of them explicitly withheld a trust rating over it. Saying when someone will
// reply costs nothing and is the difference between silence and waiting.
// ============================================================================
import { useCallback, useState } from "react";
import {
  FlatList, KeyboardAvoidingView, Modal, Platform, Pressable,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { ArrowLeft, Plus, MessageCircle } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { showAlert } from "../components/Feedback";
import { colors, radius, spacing, type, elevation, screenBottomPad } from "../theme";

// The primary fill. Ink through graphite on the same 135 degree axis as the
// Dashboard tiles. A stylesheet cannot hold a gradient, so it is laid behind
// the button content instead.
const PRIMARY_GRAD = ["#101216", "#1B1E24", "#33373F"] as const;
const PRIMARY_STOPS = [0, 0.45, 1] as const;


type Ticket = {
  id: string; subject: string; status: string; updated_at: string;
  last_message: string | null; last_sender: string | null;
};

function statusMeta(s: string) {
  if (s === "answered") return { label: "Answered", fg: colors.safe, bg: "#D2F0E3" };
  if (s === "resolved") return { label: "Resolved", fg: colors.textMuted, bg: "#EBEBEB" };
  if (s === "closed") return { label: "Closed", fg: colors.textMuted, bg: "#EBEBEB" };
  return { label: "Open", fg: "#B26A12", bg: "#FDE7CF" };
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + " mins ago";
  if (diff < 86400) return Math.floor(diff / 3600) + " hrs ago";
  return new Date(iso).toLocaleDateString();
}

export function SupportScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
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
    const { data, error } = await supabase.rpc("create_support_ticket", {
      p_subject: subject.trim(), p_first_message: message.trim(),
    });
    setBusy(false);
    if (error) {
      showAlert({ title: "Could not send", message: error.message ?? "Please try again.", tone: "error" });
      return;
    }
    setComposeOpen(false); setSubject(""); setMessage("");
    load();
    showAlert({
      title: "Message received",
      message: "We have your request and will reply within one working day. You can follow it here.",
    });
    if (data) navigation.navigate("SupportThread", { ticketId: data, subject: subject.trim(), status: "open" });
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtnPlain} hitSlop={8}>
          <ArrowLeft size={20} color={colors.ink} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headTitle}>Support</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <Text style={styles.loading}>Loading</Text>
      ) : tickets.length === 0 ? (
        <View style={styles.empty}>
          <MessageCircle size={32} color={colors.textFaint} strokeWidth={1.8} />
          <Text style={styles.emptyTitle}>No requests yet</Text>
          <Text style={styles.emptySub}>
            Have a question or a problem? Send us a message. We reply within one working day.
          </Text>
          <Pressable style={styles.emptyBtn} onPress={() => setComposeOpen(true)}>
            <Text style={styles.emptyBtnText}>New request</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(t) => t.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, paddingBottom: screenBottomPad }}
          renderItem={({ item }) => {
            const st = statusMeta(item.status);
            return (
              <Pressable
                style={styles.row}
                onPress={() => navigation.navigate("SupportThread", {
                  ticketId: item.id, subject: item.subject, status: item.status,
                })}
              >
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTop}>
                    <Text style={styles.subject} numberOfLines={1}>{item.subject}</Text>
                    <View style={[styles.pill, { backgroundColor: st.bg }]}>
                      <Text style={[styles.pillText, { color: st.fg }]}>{st.label}</Text>
                    </View>
                  </View>
                  {item.last_message ? (
                    <Text style={styles.preview} numberOfLines={1}>
                      {item.last_sender === "agent" ? "FlagRisk: " : "You: "}{item.last_message}
                    </Text>
                  ) : null}
                  <Text style={styles.when}>{timeAgo(item.updated_at)}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <Pressable style={[styles.fab, { bottom: insets.bottom + spacing.xl }]} onPress={() => setComposeOpen(true)} hitSlop={10}>
        <Plus size={24} color="#FFFFFF" strokeWidth={2.4} />
      </Pressable>

      <Modal visible={composeOpen} transparent animationType="slide" onRequestClose={() => setComposeOpen(false)}>
        <View style={styles.backdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
              <View style={styles.sheetGrab} />
              <Text style={styles.sheetTitle}>New request</Text>
              <Text style={styles.sheetSub}>We reply within one working day.</Text>

              <TextInput
                style={styles.input}
                value={subject}
                onChangeText={setSubject}
                placeholder="Subject"
                placeholderTextColor="#8B8F96"
              />
              <TextInput
                style={[styles.input, styles.textarea]}
                value={message}
                onChangeText={setMessage}
                placeholder="Tell us what happened"
                placeholderTextColor="#8B8F96"
                multiline
                textAlignVertical="top"
              />

              <Pressable style={[styles.sendBtn, busy && { opacity: 0.7 }]} onPress={submit} disabled={busy}>
                <LinearGradient colors={PRIMARY_GRAD} locations={PRIMARY_STOPS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
                <Text style={styles.sendText}>{busy ? "Sending" : "Send request"}</Text>
              </Pressable>
              <Pressable onPress={() => setComposeOpen(false)} hitSlop={8}>
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { height: 36, flexDirection: "row", alignItems: "center", marginHorizontal: spacing.gutter, marginTop: spacing.md },
  headBtnPlain: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headTitle: { flex: 1, ...type.heading, color: colors.ink, textAlign: "center" },
  loading: { ...type.caption, color: colors.textMuted, textAlign: "center", marginTop: spacing.xl },

  row: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  subject: { flex: 1, ...type.label, fontWeight: "600", color: colors.ink },
  pill: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontSize: 10, lineHeight: 14, fontWeight: "600" },
  preview: { ...type.caption, color: colors.textMuted, marginTop: 4 },
  when: { ...type.caption, color: colors.textFaint, marginTop: 3 },

  fab: {
    position: "absolute", right: spacing.gutter,
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.ink,
    alignItems: "center", justifyContent: "center", ...elevation.card,
  },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, gap: 8 },
  emptyTitle: { ...type.subheading, color: colors.ink },
  emptySub: { ...type.caption, color: colors.textMuted, textAlign: "center", lineHeight: 18 },
  emptyBtn: { height: 48, borderRadius: radius.md, backgroundColor: "#F7F7F7", borderWidth: 1, borderColor: "rgba(20,21,42,0.10)", alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, marginTop: spacing.md },
  emptyBtnText: { ...type.label, fontWeight: "600", color: colors.ink },

  backdrop: { flex: 1, backgroundColor: "rgba(1,1,20,0.30)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#F6F6F8", borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.gutter, paddingTop: spacing.sm,
  },
  sheetGrab: { alignSelf: "center", width: 44, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: spacing.md },
  sheetTitle: { ...type.heading, color: colors.ink },
  sheetSub: { ...type.caption, color: colors.textMuted, marginTop: 4 },
  input: {
    height: 52, borderRadius: radius.sm, backgroundColor: "#F1F2F5", borderWidth: 1, borderColor: "rgba(20,21,42,0.14)",
    paddingHorizontal: spacing.md, ...type.body, color: colors.ink, marginTop: spacing.md,
  },
  textarea: { height: 130, paddingTop: spacing.ms },
  sendBtn: { height: 52, borderRadius: radius.md, backgroundColor: "transparent", overflow: "hidden", alignItems: "center", justifyContent: "center", marginTop: spacing.lg },
  sendText: { ...type.bodyStrong, fontWeight: "600", color: colors.accent},
  cancel: { ...type.caption, fontWeight: "600", color: colors.textMuted, textAlign: "center", marginTop: spacing.md },
});
