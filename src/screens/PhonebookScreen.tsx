// ============================================================================
// Phone book - FlagRisk v2.1
// Designed, not rebuilt: no mockup exists.
//   header | search | contact rows with initials avatar | invite sheet
//
// Privacy behaviour unchanged and now stated on screen: contacts are never
// uploaded in bulk. Only when you tap one person is that single number checked
// against FlagRisk. That is a real distinction and users should be told it.
// ============================================================================
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import * as Contacts from "expo-contacts";
import { ArrowLeft, Search, BookUser, Send, ShieldCheck } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { showAlert } from "../components/Feedback";
import { DraggableSheet } from "../components/DraggableSheet";
import { colors, radius, spacing, type, screenBottomPad } from "../theme";

// The primary fill. Ink through graphite on the same 135 degree axis as the
// Dashboard tiles. A stylesheet cannot hold a gradient, so it is laid behind
// the button content instead.
const PRIMARY_GRAD = ["#101216", "#1B1E24", "#33373F"] as const;
const PRIMARY_STOPS = [0, 0.45, 1] as const;


type Contact = { id: string; name: string; phone: string };

function initialsOf(name: string) {
  return name.split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export function PhonebookScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [query, setQuery] = useState("");
  const [uid, setUid] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [invite, setInvite] = useState<Contact | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    setUid(u.user?.id ?? null);
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== "granted") { setDenied(true); setLoading(false); return; }
    const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers] });
    const list: Contact[] = [];
    for (const c of data) {
      const num = c.phoneNumbers && c.phoneNumbers[0] && c.phoneNumbers[0].number;
      if (c.name && num) list.push({ id: c.id ?? c.name + num, name: c.name, phone: num });
    }
    list.sort((a, b) => a.name.localeCompare(b.name));
    setContacts(list);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q));
  }, [contacts, query]);

  async function onTap(c: Contact) {
    if (!uid) return;
    setBusyId(c.id);
    const { data } = await supabase.rpc("find_user_by_phone", { p_phone: c.phone });
    const match = data && data[0];
    if (match) {
      const { error } = await supabase.rpc("request_network_member", {
        p_owner: uid, p_contact: c.phone, p_name: c.name, p_is_email: false,
      });
      setBusyId(null);
      if (error) {
        const m = error.message;
        const msg = m.includes("cannot_add_self") ? "That is you."
          : m.includes("already_connected") ? "They are already in your network."
          : m.includes("invite_already_pending") ? "You have already sent them a request."
          : m.includes("network_full") ? "Your network is full. It holds up to 7 people."
          : m;
        return showAlert({ title: "Could not send request", message: msg, tone: "error" });
      }
      showAlert({
        title: "Request sent",
        message: c.name + " is on FlagRisk. They will get a request to join your safety circle.",
      });
    } else {
      setBusyId(null);
      setInvite(c);
    }
  }

  async function sendInvite() {
    if (!invite || !uid) return;
    setSending(true);
    const { error } = await supabase.rpc("request_network_member", {
      p_owner: uid, p_contact: invite.phone, p_name: invite.name, p_is_email: false,
    });
    const who = invite.name;
    setSending(false);
    setInvite(null);
    if (error && !error.message.includes("invite_already_pending")) {
      return showAlert({ title: "Could not create invite", message: error.message, tone: "error" });
    }
    showAlert({
      title: "Invite recorded",
      message: "Your invite to " + who + " has been noted. They will be invited to join FlagRisk.",
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtnPlain} hitSlop={8}>
          <ArrowLeft size={20} color={colors.ink} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headTitle}>Phone book</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.searchWrap}>
        <Search size={16} color="#8B8F96" strokeWidth={2} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search contacts"
          placeholderTextColor="#8B8F96"
          style={styles.searchInput}
        />
      </View>

      <View style={styles.privacyRow}>
        <ShieldCheck size={14} color={colors.textMuted} strokeWidth={2} />
        <Text style={styles.privacyText}>
          Your contacts stay on your phone. Only the person you tap is checked against FlagRisk.
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.ink} style={{ marginTop: 40 }} />
      ) : denied ? (
        <View style={styles.empty}>
          <BookUser size={32} color={colors.textFaint} strokeWidth={1.8} />
          <Text style={styles.emptyTitle}>Contacts are not available</Text>
          <Text style={styles.emptySub}>
            Allow contact access in your phone settings to add people this way, or add them by phone
            number or email instead.
          </Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <BookUser size={32} color={colors.textFaint} strokeWidth={1.8} />
          <Text style={styles.emptyTitle}>
            {query ? "No contact matches that" : "No contacts with phone numbers"}
          </Text>
          <Text style={styles.emptySub}>
            {query ? "Try a different name or number." : "Only contacts that have a phone number can be added."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: screenBottomPad }}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => onTap(item)} disabled={busyId === item.id}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initialsOf(item.name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.phone} numberOfLines={1}>{item.phone}</Text>
              </View>
              {busyId === item.id ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}
            </Pressable>
          )}
        />
      )}

      <Modal visible={!!invite} transparent animationType="slide" onRequestClose={() => setInvite(null)}>
        <DraggableSheet
          visible={!!invite}
          onDismiss={() => setInvite(null)}
          insetBottom={insets.bottom}
          title={invite ? "Invite " + invite.name : "Invite"}
          subtitle="They are not on FlagRisk yet. Invite them, and they will join your circle once they accept."
        >
          <Pressable style={[styles.inviteBtn, sending && { opacity: 0.7 }]} onPress={sendInvite} disabled={sending}>
            <LinearGradient colors={PRIMARY_GRAD} locations={PRIMARY_STOPS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
            <Send size={17} color={colors.accent} strokeWidth={2.2} />
            <Text style={styles.inviteText}>{sending ? "Sending" : "Send invite"}</Text>
          </Pressable>
          <Pressable onPress={() => setInvite(null)} hitSlop={8}>
            <Text style={styles.cancel}>Not now</Text>
          </Pressable>
        </DraggableSheet>
      </Modal>
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

  privacyRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    marginHorizontal: spacing.gutter, marginTop: spacing.md,
  },
  privacyText: { flex: 1, ...type.caption, color: colors.textMuted, lineHeight: 17 },

  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.ms, borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#F0F0F0", alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 13, lineHeight: 17, fontWeight: "700", color: colors.textMuted },
  name: { ...type.label, color: "#000000" },
  phone: { ...type.caption, color: "#8B8B8B", marginTop: 3 },

  inviteBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    height: 52, borderRadius: radius.md, backgroundColor: "transparent", overflow: "hidden", marginTop: spacing.md,
  },
  inviteText: { ...type.bodyStrong, fontWeight: "600", color: colors.accent},
  cancel: { ...type.caption, fontWeight: "600", color: colors.textMuted, textAlign: "center", marginTop: spacing.md },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, gap: 8 },
  emptyTitle: { ...type.subheading, color: colors.ink, textAlign: "center" },
  emptySub: { ...type.caption, color: colors.textMuted, textAlign: "center", lineHeight: 18 },
});
