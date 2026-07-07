// Phonebook: device contacts (expo-contacts), alphabetized + searchable.
// Privacy: NO bulk upload. Only when the user TAPS a contact do we check that
// one number against FlagRisk via find_user_by_phone. User -> consent add.
// Non-user -> invite sheet (record created; outbound send parked on compliance).
import { useCallback, useMemo, useState } from "react";
import { showAlert } from "../components/Feedback";
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import * as Contacts from "expo-contacts";
import { ChevronLeft, Search, User, Send } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing } from "../theme";
import { DraggableSheet } from "../components/DraggableSheet";

type Contact = { id: string; name: string; phone: string };

export function PhonebookScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { colors, glass, gradients, glow } = useTheme();
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
    setContacts(list); setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q));
  }, [contacts, query]);

  // Tap a contact: check THIS one number only.
  async function onTap(c: Contact) {
    if (!uid) return;
    setBusyId(c.id);
    const { data } = await supabase.rpc("find_user_by_phone", { p_phone: c.phone });
    const match = data && data[0];
    if (match) {
      // FlagRisk user -> send a consent request via the existing flow
      const { error } = await supabase.rpc("request_network_member", {
        p_owner: uid, p_contact: c.phone, p_name: c.name, p_is_email: false,
      });
      setBusyId(null);
      if (error) {
        const m = error.message;
        const msg = m.includes("cannot_add_self") ? "That's you."
          : m.includes("already_connected") ? "Already in your network."
          : m.includes("invite_already_pending") ? "Request already sent."
          : m.includes("network_full") ? "Your network is full (7 members)."
          : m;
        return showAlert({ title: "Could not send request", message: msg, tone: "error" });
      }
      showAlert({ title: "Request sent", message: c.name + " is on FlagRisk. They will get a request to join your safety circle." });
    } else {
      setBusyId(null);
      setInvite(c); // not on FlagRisk -> offer invite
    }
  }

  async function sendInvite() {
    if (!invite || !uid) return;
    setSending(true);
    // Creates the invite record. Outbound SMS/email send is parked on compliance.
    const { error } = await supabase.rpc("request_network_member", {
      p_owner: uid, p_contact: invite.phone, p_name: invite.name, p_is_email: false,
    });
    setSending(false); setInvite(null);
    if (error && !error.message.includes("invite_already_pending")) {
      return showAlert({ title: "Could not create invite", message: error.message, tone: "error" });
    }
    showAlert({ title: "Invite recorded", message: "We have noted your invite to " + invite.name + ". They will be invited to join FlagRisk." });
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top", "bottom"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={{ flexDirection: "row", alignItems: "center" }}>
          <ChevronLeft size={22} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Text style={[styles.header, { color: colors.text }]}>Phone Book</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={[styles.searchBar, { backgroundColor: glass.surface, borderColor: glass.stroke }]}>
        <Search size={18} color={colors.textMuted} />
        <TextInput style={[styles.searchInput, { color: colors.text }]} value={query} onChangeText={setQuery}
          placeholder="Search contacts" placeholderTextColor={colors.textMuted} autoCapitalize="none" />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.accentOn} /></View>
      ) : denied ? (
        <View style={styles.center}>
          <Text style={[styles.denyText, { color: colors.text }]}>Contacts permission is off.</Text>
          <Text style={[styles.denySub, { color: colors.textMuted }]}>Enable contacts access in your phone settings to add people from your phonebook.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, gap: spacing.sm }}
          renderItem={({ item }) => (
            <Pressable onPress={() => onTap(item)} disabled={busyId === item.id}
              style={[styles.row, { backgroundColor: glass.surface, borderColor: glass.stroke } as any]}>
              <View style={[styles.avatar, { backgroundColor: colors.accentOn + "22" }]}>
                <User size={20} color={colors.accentOn} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
                <Text style={[styles.phone, { color: colors.textMuted }]}>{item.phone}</Text>
              </View>
              {busyId === item.id && <ActivityIndicator color={colors.accentOn} />}
            </Pressable>
          )}
        />
      )}

      <Modal visible={!!invite} transparent animationType="slide" onRequestClose={() => setInvite(null)}>
        <DraggableSheet visible={!!invite} onDismiss={() => setInvite(null)}
          title="Invite to FlagRisk"
          subtitle={(invite?.name ?? "This contact") + " is not on FlagRisk. Send them an invite to join?"}
          insetBottom={insets.bottom}>
          <Pressable style={styles.addWrap} onPress={sendInvite} disabled={sending}>
            <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={[styles.addBtn, { boxShadow: glow.brand } as any, sending && { opacity: 0.7 }]}>
              <Send size={18} color={colors.accentText} strokeWidth={2} />
              <Text style={[styles.addBtnText, { color: colors.accentText }]}>{sending ? "Sending..." : "Send Invite"}</Text>
            </LinearGradient>
          </Pressable>
        </DraggableSheet>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  header: { fontSize: 20, fontWeight: "800" },
  searchBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginVertical: spacing.sm, paddingHorizontal: spacing.md, height: 50, borderWidth: 1, borderRadius: radius.md },
  searchInput: { flex: 1, fontSize: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  denyText: { fontSize: 16, fontWeight: "700" },
  denySub: { fontSize: 14, marginTop: 6, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 16, fontWeight: "700" },
  phone: { fontSize: 13, marginTop: 2 },
  addWrap: { marginTop: spacing.md, borderRadius: radius.md },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 56, borderRadius: radius.md },
  addBtnText: { fontSize: 16, fontWeight: "800" },
});
