// Network (V2 rich + theming). Lucide icons, gradient empty-state chip, lifted rows.
import { useCallback, useState } from "react";
import { showAlert } from "../components/Feedback";
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { UsersRound, UserPlus, X, User, Pencil, AtSign, BookUser, ChevronDown, Trash2 } from "lucide-react-native";

// Common African dialing codes (Nigeria first for launch market).
const DIAL_CODES = ["+234", "+233", "+254", "+27", "+256", "+255", "+250", "+260", "+1", "+44"];
import { supabase } from "../../lib/supabase";
import { Avatar } from "../components/Avatar";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing } from "../theme";
import { DraggableSheet } from "../components/DraggableSheet";

type Member = {
  member_id: string; display_name: string | null; avatar_url?: string | null;
  in_panic_circle: boolean; is_emergency_contact: boolean; log_access_granted: boolean;
};

const AVATAR_COLORS = ["#e0457b", "#3ec46a", "#5b6cf0", "#e0a045", "#9c45e0"];
function avatarColor(id: string) {
  let h = 0; for (const c of id) h = (h + c.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}
function initials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export function NetworkScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { colors, glass, gradients, glow } = useTheme();
  const [members, setMembers] = useState<Member[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<"manual" | "email">("manual");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [dial, setDial] = useState("+234");
  const [dialOpen, setDialOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [inviteCount, setInviteCount] = useState(0);

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    const id = u.user?.id ?? null;
    setUid(id);
    if (!id) return;
    const { data } = await supabase.rpc("my_network_members", { p_owner: id });
    setMembers(data ?? []);
    const { data: out } = await supabase.rpc("my_outgoing_invites");
    setPending(out ?? []);
    const { data: inv } = await supabase.rpc("my_incoming_invites");
    setInviteCount((inv ?? []).length);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function openChooser() { setChooserOpen(true); }
  function chooseManual() { setChooserOpen(false); setAddMode("manual"); setAddOpen(true); }
  function chooseEmail() { setChooserOpen(false); setAddMode("email"); setAddOpen(true); }
  function choosePhonebook() { setChooserOpen(false); navigation.navigate("Phonebook"); }

  async function addMember() {
    let contact: string; let isEmail: boolean; let contactName: string | null = null;
    if (addMode === "email") {
      contact = email.trim(); isEmail = true;
    } else {
      const digits = email.replace(/[^0-9]/g, "");
      if (!digits) { if (uid) showAlert({ title: "Enter a number", message: "Please enter a phone number.", tone: "error" }); return; }
      // strip a leading 0 then prefix the chosen dial code -> full international number
      contact = dial + digits.replace(/^0+/, "");
      isEmail = false; contactName = name.trim() || null;
    }
    if (!contact || !uid) return;
    setAdding(true);
    const { data, error } = await supabase.rpc("request_network_member", {
      p_owner: uid, p_contact: contact, p_name: contactName, p_is_email: isEmail,
    });
    setAdding(false);
    if (error) {
      const m = error.message;
      const msg = m.includes("cannot_add_self") ? "You can't add yourself."
        : m.includes("already_connected") ? "They're already in your network."
        : m.includes("invite_already_pending") ? "You've already sent them a request."
        : m.includes("network_full") ? "Your network is full (7 members)."
        : m.includes("empty_contact") ? "Enter a phone number or email."
        : m;
      return showAlert({ title: "Could not send request", message: msg, tone: "error" });
    }
    const isUser = data && data[0] && data[0].target_is_user;
    setEmail(""); setName(""); setAddOpen(false); load();
    showAlert({
      title: "Request sent",
      message: isUser
        ? "They have a FlagRisk account. They will get a request to join your safety circle and can accept in the app."
        : "They are not on FlagRisk yet. They will be invited to join your safety circle and appear in your network once they accept."
    });
  }

  function confirmRemove(m: Member) { setRemoveTarget(m); }
  async function doRemove() {
    if (!removeTarget || !uid) return;
    await supabase.from("network_connections").delete().eq("owner_id", uid).eq("member_id", removeTarget.member_id);
    setRemoveTarget(null); load();
  }

  function cancelInvite(inv: any) {
    showAlert({ title: "Cancel invite", message: `Cancel the invite to ${inv.invitee_name ?? inv.invitee_contact}?`, buttons: [
      { text: "Keep", style: "cancel" },
      { text: "Cancel invite", style: "destructive", onPress: async () => {
          await supabase.rpc("revoke_network_invite", { p_token: inv.token });
          load();
        } },
    ] });
  }

  async function togglePanic(m: Member) {
    await supabase.from("network_connections")
      .update({ in_panic_circle: !m.in_panic_circle })
      .eq("owner_id", uid).eq("member_id", m.member_id);
    load();
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top", "bottom"]}>
      <Text style={[styles.header, { color: colors.text }]}>Network</Text>
      {inviteCount > 0 && (
        <Pressable onPress={() => navigation.navigate("NetworkInvites")}
          style={[styles.inviteBanner, { backgroundColor: colors.accentOn + "1a", borderColor: colors.accentOn }]}>
          <Text style={[styles.inviteBannerText, { color: colors.accentOn }]}>
            {inviteCount} safety circle request{inviteCount === 1 ? "" : "s"} waiting. Tap to review.
          </Text>
        </Pressable>
      )}

      {!loading && members.length === 0 && pending.length === 0 ? (
        <View style={styles.empty}>
          <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={[styles.emptyChip, { boxShadow: glow.brand } as any]}>
            <UsersRound size={32} color={colors.accentText} strokeWidth={2} />
          </LinearGradient>
          <Text style={[styles.emptyText, { color: colors.text }]}>You have no contacts.</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>Tap the Add button to build your network.</Text>
        </View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(m) => m.member_id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 160, gap: spacing.md }}
          ListHeaderComponent={
            pending.length > 0 ? (
              <View style={{ marginBottom: spacing.md, gap: spacing.sm }}>
                <Text style={[styles.pendingHead, { color: colors.textMuted }]}>Pending invites</Text>
                {pending.map((inv) => (
                  <View key={inv.token} style={[styles.row, { backgroundColor: glass.surface, borderColor: glass.stroke, opacity: 0.85 } as any]}>
                    <View style={[styles.avatar, { backgroundColor: colors.textMuted + "33" }]}>
                      <User size={22} color={colors.textMuted} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.name, { color: colors.text }]}>{inv.invitee_name ?? inv.invitee_contact}</Text>
                      <Text style={[styles.panicTag, { color: colors.textMuted }]}>Waiting to accept</Text>
                    </View>
                    <Pressable onPress={() => cancelInvite(inv)} hitSlop={10} style={styles.removeBtn}>
                      <X size={18} color={colors.danger} strokeWidth={2} />
                    </Pressable>
                  </View>
                ))}
                {members.length > 0 && <Text style={[styles.pendingHead, { color: colors.textMuted, marginTop: spacing.sm }]}>Your network</Text>}
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const ac = avatarColor(item.member_id);
            return (
              <View style={[styles.row, { backgroundColor: glass.surface, borderColor: glass.stroke, boxShadow: glow.soft } as any]}>
                <Avatar uri={item.avatar_url} name={item.display_name} id={item.member_id} size={48} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.text }]}>{item.display_name ?? "FlagRisk user"}</Text>
                  <Pressable onPress={() => togglePanic(item)}>
                    <Text style={[styles.panicTag, { color: item.in_panic_circle ? colors.accentOn : colors.textMuted, fontWeight: item.in_panic_circle ? "600" : "400" }]}>
                      {item.in_panic_circle ? "In panic circle" : "Add to panic circle"}
                    </Text>
                  </Pressable>
                </View>
                <Pressable onPress={() => confirmRemove(item)} hitSlop={10} style={styles.removeBtn}>
                  <X size={18} color={colors.danger} strokeWidth={2} />
                </Pressable>
              </View>
            );
          }}
        />
      )}

      <Pressable style={styles.fabWrap} onPress={openChooser}>
        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[styles.fab, { boxShadow: glow.brand } as any]}>
          <UserPlus size={22} color={colors.accentText} strokeWidth={2} />
          <Text style={[styles.fabLabel, { color: colors.accentText }]}>Add</Text>
        </LinearGradient>
      </Pressable>

      <Modal visible={chooserOpen} transparent animationType="slide" onRequestClose={() => setChooserOpen(false)}>
        <DraggableSheet visible={chooserOpen} onDismiss={() => setChooserOpen(false)}
          title="Add contact from" subtitle="Choose how to add someone to your circle." insetBottom={insets.bottom}>
          <Pressable style={[styles.chooserRow, { backgroundColor: glass.surface, borderColor: glass.stroke }]} onPress={chooseManual}>
            <Pencil size={20} color={colors.accentOn} strokeWidth={2} />
            <Text style={[styles.chooserText, { color: colors.text }]}>Add manually</Text>
          </Pressable>
          <Pressable style={[styles.chooserRow, { backgroundColor: glass.surface, borderColor: glass.stroke, marginTop: spacing.sm }]} onPress={chooseEmail}>
            <AtSign size={20} color={colors.accentOn} strokeWidth={2} />
            <Text style={[styles.chooserText, { color: colors.text }]}>Email</Text>
          </Pressable>
          <Pressable style={[styles.chooserRow, { backgroundColor: glass.surface, borderColor: glass.stroke, marginTop: spacing.sm }]} onPress={choosePhonebook}>
            <BookUser size={20} color={colors.accentOn} strokeWidth={2} />
            <Text style={[styles.chooserText, { color: colors.text }]}>Phonebook</Text>
          </Pressable>
        </DraggableSheet>
      </Modal>

      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)}>
        <DraggableSheet visible={addOpen} onDismiss={() => setAddOpen(false)}
          title={addMode === "email" ? "Add by email" : "Add to your circle"}
          subtitle="They must accept to join your safety circle." insetBottom={insets.bottom}>
          {addMode === "manual" && (
            <TextInput
              style={[styles.input, { borderColor: glass.stroke, backgroundColor: glass.surface, color: colors.text }]}
              value={name} onChangeText={setName}
              placeholder="Name (optional)" placeholderTextColor={colors.textMuted} />
          )}
          {addMode === "email" ? (
            <TextInput
              style={[styles.input, { borderColor: glass.stroke, backgroundColor: glass.surface, color: colors.text }]}
              value={email} onChangeText={setEmail}
              placeholder="Email address" placeholderTextColor={colors.textMuted}
              autoCapitalize="none" keyboardType="email-address" />
          ) : (
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
              <Pressable onPress={() => setDialOpen((v) => !v)}
                style={[styles.dialBtn, { borderColor: glass.stroke, backgroundColor: glass.surface }]}>
                <Text style={[styles.dialText, { color: colors.text }]}>{dial}</Text>
                <ChevronDown size={16} color={colors.textMuted} />
              </Pressable>
              <TextInput
                style={[styles.input, { flex: 1, marginTop: 0, borderColor: glass.stroke, backgroundColor: glass.surface, color: colors.text }]}
                value={email} onChangeText={setEmail}
                placeholder="Phone number" placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad" />
            </View>
          )}
          {dialOpen && addMode === "manual" && (
            <View style={[styles.dialList, { backgroundColor: glass.surface, borderColor: glass.stroke }]}>
              {DIAL_CODES.map((d) => (
                <Pressable key={d} style={styles.dialItem} onPress={() => { setDial(d); setDialOpen(false); }}>
                  <Text style={[styles.dialText, { color: d === dial ? colors.accentOn : colors.text }]}>{d}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <Pressable style={styles.addWrap} onPress={addMember} disabled={adding}>
            <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={[styles.addBtn, adding && { opacity: 0.7 }]}>
              <Text style={[styles.addBtnText, { color: colors.accentText }]}>{adding ? "Sending..." : "Add Contact"}</Text>
            </LinearGradient>
          </Pressable>
        </DraggableSheet>
      </Modal>

      <Modal visible={!!removeTarget} transparent animationType="slide" onRequestClose={() => setRemoveTarget(null)}>
        <DraggableSheet visible={!!removeTarget} onDismiss={() => setRemoveTarget(null)}
          title="Remove contact" subtitle={`Remove ${removeTarget?.display_name ?? "this contact"} from your network?`} insetBottom={insets.bottom}>
          <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
            <Pressable style={[styles.removeAction, { borderColor: glass.stroke }]} onPress={() => setRemoveTarget(null)}>
              <Text style={[styles.removeActionText, { color: colors.text }]}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.removeAction, { backgroundColor: colors.danger + "18", borderColor: colors.danger + "55" }]} onPress={doRemove}>
              <Trash2 size={18} color={colors.danger} strokeWidth={2} />
              <Text style={[styles.removeActionText, { color: colors.danger, fontWeight: "800" }]}>Remove</Text>
            </Pressable>
          </View>
        </DraggableSheet>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { fontSize: 22, fontWeight: "800", textAlign: "center", paddingVertical: spacing.md },
  inviteBanner: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, borderWidth: 1, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: spacing.md },
  inviteBannerText: { fontSize: 14, fontWeight: "700", textAlign: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyChip: { width: 72, height: 72, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  emptyText: { fontSize: 16, fontWeight: "700" },
  emptySub: { fontSize: 14, marginTop: 4, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  name: { fontSize: 17, fontWeight: "700" },
  panicTag: { fontSize: 13, marginTop: 4 },
  removeBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  pendingHead: { fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  fabWrap: { position: "absolute", right: spacing.lg, bottom: 110 },
  fab: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  fabLabel: { fontSize: 10, fontWeight: "800", marginTop: 1 },
  input: { height: 56, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, fontSize: 16, marginTop: spacing.md },
  addWrap: { marginTop: spacing.md, borderRadius: radius.md },
  addBtn: { height: 56, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  addBtnText: { fontSize: 16, fontWeight: "800" },
  chooserRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1, borderRadius: radius.md, padding: spacing.lg },
  chooserText: { fontSize: 16, fontWeight: "700" },
  dialBtn: { flexDirection: "row", alignItems: "center", gap: 4, height: 56, paddingHorizontal: spacing.md, borderWidth: 1, borderRadius: radius.md },
  dialText: { fontSize: 16, fontWeight: "700" },
  dialList: { marginTop: spacing.sm, borderWidth: 1, borderRadius: radius.md, overflow: "hidden" },
  dialItem: { paddingVertical: 12, paddingHorizontal: spacing.lg },
  removeAction: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 52, borderWidth: 1, borderRadius: radius.md },
  removeActionText: { fontSize: 16, fontWeight: "700" },
});

















