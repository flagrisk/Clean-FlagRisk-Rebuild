// Support thread: the conversation for one ticket. User messages right, support left.
// Compose box at the bottom. Snapshot pattern: reload on focus.
import { useCallback, useRef, useState } from "react";
import { FlatList, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { Send, Paperclip, X } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { decode as decodeBase64 } from "base64-arraybuffer";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing } from "../theme";
import { showAlert } from "../components/Feedback";

type Msg = { id: string; sender: string; body: string; attachment_urls: string[] | null; created_at: string };

export function SupportThreadScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { colors, glass, gradients, glow } = useTheme();
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
    if (!perm.granted) { showAlert({ title: "Permission needed", message: "Allow photo access to attach images." }); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true, quality: 0.7 });
    if (res.canceled) return;
    const uris = (res.assets || []).map((a) => a.uri);
    setPendingImages((cur) => [...cur, ...uris]);
  }

  async function uploadOne(uri) {
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
      const urls = [];
      for (const uri of imagesToSend) { urls.push(await uploadOne(uri)); }
      const { error } = await supabase.rpc("send_support_message", { p_ticket_id: ticketId, p_body: body, p_attachments: urls });
      setSending(false);
      if (error) { showAlert({ title: "Not sent", message: error.message ?? "Please try again.", tone: "error" }); setText(body); setPendingImages(imagesToSend); return; }
      load();
    } catch (e) {
      setSending(false);
      showAlert({ title: "Upload failed", message: "Could not upload the image. Please try again.", tone: "error" });
      setText(body); setPendingImages(imagesToSend);
    }
  }

  async function toggleResolved() {
    const next = status === "resolved" ? "open" : "resolved";
    const { error } = await supabase.rpc("set_ticket_status", { p_ticket_id: ticketId, p_status: next });
    if (error) { showAlert({ title: "Could not update", message: error.message ?? "Please try again.", tone: "error" }); return; }
    setStatus(next);
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={[styles.back, { color: colors.accentOn }]}>‹ Back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>{subject}</Text>
        <Pressable onPress={toggleResolved} hitSlop={8} style={[styles.statusBtn, { borderColor: glass.stroke, backgroundColor: glass.surface }]}>
          <Text style={[styles.statusBtnText, { color: status === "resolved" ? colors.accentOn : colors.textMuted }]}>{status === "resolved" ? "Resolved" : "Mark resolved"}</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={80}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const mine = item.sender === "user";
            return (
              <View style={[styles.bubbleWrap, { alignItems: mine ? "flex-end" : "flex-start" }]}>
                <View style={[styles.bubble, mine
                  ? { backgroundColor: "#dff29a" }
                  : { backgroundColor: glass.surface, borderColor: glass.stroke, borderWidth: 1 }]}>
                  {item.body ? <Text style={[styles.bubbleText, { color: mine ? "#0a0a0a" : colors.text }]}>{item.body}</Text> : null}
                  {item.attachment_urls && item.attachment_urls.length > 0 ? (
                    <View style={styles.attachGrid}>
                      {item.attachment_urls.map((url, i) => (
                        <Image key={i} source={{ uri: url }} style={styles.attachImg} />
                      ))}
                    </View>
                  ) : null}
                </View>
                {!mine ? <Text style={[styles.sender, { color: colors.textFaint }]}>Support</Text> : null}
              </View>
            );
          }}
        />
        {pendingImages.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pendingStrip} contentContainerStyle={{ gap: 8, paddingHorizontal: spacing.md }}>
            {pendingImages.map((uri, i) => (
              <View key={i} style={styles.pendingWrap}>
                <Image source={{ uri }} style={styles.pendingImg} />
                <Pressable onPress={() => setPendingImages((cur) => cur.filter((_, idx) => idx !== i))} style={[styles.pendingRemove, { backgroundColor: colors.bg }]}>
                  <X size={14} color={colors.text} strokeWidth={2.5} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : null}
        <View style={[styles.composer, { borderTopColor: glass.stroke, paddingBottom: insets.bottom + spacing.sm }]}>
          <Pressable onPress={pickImages} hitSlop={8} style={styles.attachBtn}>
            <Paperclip size={22} color={colors.textMuted} strokeWidth={2} />
          </Pressable>
          <TextInput
            value={text} onChangeText={setText} placeholder="Type a message" placeholderTextColor={colors.textFaint}
            multiline
            style={[styles.input, { color: colors.text, borderColor: glass.stroke, backgroundColor: glass.surface }]}
          />
          <Pressable onPress={send} disabled={sending || (text.trim() === "" && pendingImages.length === 0)}>
            <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.sendBtn, { boxShadow: glow.brand, opacity: (text.trim() === "" && pendingImages.length === 0) ? 0.5 : 1 } as any]}>
              <Send size={20} color={colors.accentText} strokeWidth={2.5} />
            </LinearGradient>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 4 },
  back: { fontSize: 16, fontWeight: "700" },
  headerTitle: { fontSize: 17, fontWeight: "800", flex: 1 },
  statusBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1 },
  statusBtnText: { fontSize: 12, fontWeight: "700" },
  bubbleWrap: { width: "100%" },
  bubble: { maxWidth: "82%", paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.lg },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  sender: { fontSize: 11, marginTop: 3, marginLeft: 4 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1 },
  input: { flex: 1, borderWidth: 1, borderRadius: radius.lg, paddingVertical: 10, paddingHorizontal: 14, fontSize: 15, maxHeight: 120 },
  sendBtn: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  attachBtn: { width: 40, height: 46, alignItems: "center", justifyContent: "center" },
  attachGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  attachImg: { width: 140, height: 140, borderRadius: 10, backgroundColor: "#00000010" },
  pendingStrip: { maxHeight: 76, marginBottom: 6 },
  pendingWrap: { position: "relative" },
  pendingImg: { width: 64, height: 64, borderRadius: 8 },
  pendingRemove: { position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
});
