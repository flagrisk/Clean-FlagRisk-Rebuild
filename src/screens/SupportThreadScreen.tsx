// ============================================================================
// Support thread - FlagRisk v2.1
// Designed, not rebuilt: no mockup exists.
//   header with subject and a status pill | message bubbles | composer
//   yours: ink bubble, white text, right | support: #FAFAFA bubble, left
// Logic unchanged, including the base64 upload path that is the correct one
// and was the reference for fixing the evidence capture screens.
//
// Added: timestamps on messages, and an explicit "We reply within one working
// day" line on a thread that has no support reply yet. Two testers heard
// nothing back and had no idea whether the message had even been received.
// ============================================================================
import { useCallback, useRef, useState } from "react";
import {
  FlatList, Image, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { ArrowLeft, Send, Paperclip, X } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { decode as decodeBase64 } from "base64-arraybuffer";
import { supabase } from "../../lib/supabase";
import { showAlert } from "../components/Feedback";
import { colors, radius, spacing, type } from "../theme";

type Msg = { id: string; sender: string; body: string; attachment_urls: string[] | null; created_at: string };

function clockOf(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function SupportThreadScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const ticketId = route.params?.ticketId;
  const subject = route.params?.subject ?? "Support";
  const [status, setStatus] = useState(route.params?.status ?? "open");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    if (!ticketId) return;
    const { data } = await supabase.rpc("ticket_messages", { p_ticket_id: ticketId });
    setMessages(data ?? []);
  }, [ticketId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function pickImages() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert({ title: "Permission needed", message: "Allow photo access to attach images." });
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true, quality: 0.7,
    });
    if (res.canceled) return;
    const uris = (res.assets || []).map((a) => a.uri);
    setPendingImages((cur) => cur.concat(uris));
  }

  async function uploadOne(uri: string) {
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const bytes = decodeBase64(b64);
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id ?? "anon";
    const path = uid + "/" + ticketId + "/" + Date.now() + "-" + Math.floor(Math.random() * 10000) + ".jpg";
    const { error } = await supabase.storage.from("support-attachments").upload(path, bytes, { contentType: "image/jpeg" });
    if (error) throw error;
    const { data } = supabase.storage.from("support-attachments").getPublicUrl(path);
    return data.publicUrl;
  }

  async function send() {
    if (sending) return;
    const body = text.trim();
    if (body === "" && pendingImages.length === 0) return;
    setSending(true);
    const imagesToSend = pendingImages;
    setText("");
    setPendingImages([]);
    try {
      const urls: string[] = [];
      for (const uri of imagesToSend) { urls.push(await uploadOne(uri)); }
      const { error } = await supabase.rpc("send_support_message", {
        p_ticket_id: ticketId, p_body: body, p_attachments: urls,
      });
      setSending(false);
      if (error) {
        showAlert({ title: "Not sent", message: error.message ?? "Please try again.", tone: "error" });
        setText(body); setPendingImages(imagesToSend);
        return;
      }
      load();
    } catch (e) {
      setSending(false);
      showAlert({ title: "Upload failed", message: "The image could not be uploaded. Please try again.", tone: "error" });
      setText(body); setPendingImages(imagesToSend);
    }
  }

  async function toggleResolved() {
    const next = status === "resolved" ? "open" : "resolved";
    const { error } = await supabase.rpc("set_ticket_status", { p_ticket_id: ticketId, p_status: next });
    if (error) {
      showAlert({ title: "Could not update", message: error.message ?? "Please try again.", tone: "error" });
      return;
    }
    setStatus(next);
  }

  const canSend = text.trim() !== "" || pendingImages.length > 0;
  const awaitingReply = messages.length > 0 && !messages.some((m) => m.sender !== "user");

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtnPlain} hitSlop={8}>
          <ArrowLeft size={20} color={colors.ink} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headTitle} numberOfLines={1}>{subject}</Text>
        <Pressable onPress={toggleResolved} hitSlop={8} style={[styles.statusBtn, status === "resolved" && styles.statusBtnOn]}>
          <Text style={[styles.statusBtnText, status === "resolved" && { color: colors.accent }]}>
            {status === "resolved" ? "Resolved" : "Resolve"}
          </Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={80}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingVertical: spacing.lg, gap: spacing.ms }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListFooterComponent={
            awaitingReply ? (
              <Text style={styles.awaiting}>We have your message and will reply within one working day.</Text>
            ) : null
          }
          renderItem={({ item }) => {
            const mine = item.sender === "user";
            return (
              <View style={{ alignItems: mine ? "flex-end" : "flex-start" }}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  {item.body ? (
                    <Text style={[styles.bubbleText, mine && { color: "#FFFFFF" }]}>{item.body}</Text>
                  ) : null}
                  {item.attachment_urls && item.attachment_urls.length > 0 ? (
                    <View style={styles.attachGrid}>
                      {item.attachment_urls.map((url, i) => (
                        <Image key={i} source={{ uri: url }} style={styles.attachImg} />
                      ))}
                    </View>
                  ) : null}
                </View>
                <Text style={styles.meta}>
                  {mine ? "" : "FlagRisk  "}{clockOf(item.created_at)}
                </Text>
              </View>
            );
          }}
        />

        {pendingImages.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.pendingStrip}
            contentContainerStyle={{ gap: 8, paddingHorizontal: spacing.gutter }}
          >
            {pendingImages.map((uri, i) => (
              <View key={i} style={styles.pendingWrap}>
                <Image source={{ uri }} style={styles.pendingImg} />
                <Pressable
                  onPress={() => setPendingImages((cur) => cur.filter((_, idx) => idx !== i))}
                  style={styles.pendingRemove}
                >
                  <X size={13} color={colors.ink} strokeWidth={2.5} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : null}

        <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.sm }]}>
          <Pressable onPress={pickImages} hitSlop={8} style={styles.attachBtn}>
            <Paperclip size={20} color={colors.textMuted} strokeWidth={2} />
          </Pressable>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Type a message"
            placeholderTextColor="#9F9F9F"
            multiline
            style={styles.input}
          />
          <Pressable onPress={send} disabled={sending || !canSend} style={[styles.sendBtn, !canSend && { opacity: 0.4 }]}>
            <Send size={18} color={colors.accent} strokeWidth={2.5} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { height: 36, flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.gutter, marginTop: spacing.md },
  headBtnPlain: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headTitle: { flex: 1, ...type.subheading, color: colors.ink },
  statusBtn: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 6 },
  statusBtnOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  statusBtnText: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: colors.textMuted },

  bubble: { maxWidth: "84%", paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.md },
  bubbleMine: { backgroundColor: colors.ink, borderTopRightRadius: 4 },
  bubbleTheirs: { backgroundColor: "#FAFAFA", borderWidth: 1, borderColor: colors.border, borderTopLeftRadius: 4 },
  bubbleText: { ...type.label, fontWeight: "400", color: colors.ink, lineHeight: 21 },
  meta: { ...type.caption, color: colors.textFaint, marginTop: 4, marginHorizontal: 4 },
  attachGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  attachImg: { width: 120, height: 120, borderRadius: radius.sm },

  awaiting: { ...type.caption, color: colors.textMuted, textAlign: "center", marginTop: spacing.lg, paddingHorizontal: spacing.lg, lineHeight: 17 },

  pendingStrip: { maxHeight: 84, paddingVertical: spacing.sm },
  pendingWrap: { width: 64, height: 64 },
  pendingImg: { width: 64, height: 64, borderRadius: radius.sm },
  pendingRemove: {
    position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },

  composer: {
    flexDirection: "row", alignItems: "flex-end", gap: spacing.sm,
    paddingHorizontal: spacing.gutter, paddingTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  attachBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  input: {
    flex: 1, borderRadius: radius.md, backgroundColor: "#FAFAFA",
    paddingVertical: 12, paddingHorizontal: spacing.md,
    ...type.label, fontWeight: "400", color: colors.ink, maxHeight: 120,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
});
