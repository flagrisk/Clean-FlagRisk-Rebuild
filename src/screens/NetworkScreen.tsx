// ============================================================================
// Network - FlagRisk v2.1
// Rebuilt against Figma "Network" (node 1:3165) and the 2.0 Network flow.
//   header 36pt round back | title 20/700 centred | 36pt #F0F0F0 round right
//   search 327x42 r16 #FAFAFA | divider | rows: 40pt avatar, 14/500 name,
//   12/500 #8B8B8B status | 48pt ink FAB bottom right
// Pending invites are shown as their own group with an explicit waiting state,
// because testers read a rising member count as "accepted" when it was not.
// ============================================================================
import { useCallback, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import {
  ArrowLeft, EllipsisVertical, Search, Plus, Pencil, AtSign, BookUser,
  ShieldPlus, ShieldMinus, UserMinus, Clock3, X,
} from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { showAlert } from "../components/Feedback";
import { Avatar } from "../components/Avatar";
import { colors, radius, spacing, type, elevation, screenBottomPad } from "../theme";
import { DraggableSheet } from "../components/DraggableSheet";
import { PhoneInput } from "../components/PhoneInput";

const MAX_MEMBERS = 7;

type Member = {
  member_id: string; display_name: string | null; avatar_url?: string | null;
  in_panic_circle: boolean; is_emergency_contact: boolean; log_access_granted: boolean;
};

export function NetworkScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [members, setMembers] = useState<Member[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [chooserOpen, setChooserOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<"manual" | "email">("manual");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [dial, setDial] = useState("+234");
  const [phone, setPhone] = useState("");
  const [adding, setAdding] = useState(false);
  const [actionTarget, setActionTarget] = useState<Member | null>(null);
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

  const full = members.length >= MAX_MEMBERS;

  function openChooser() {
    if (full) {
      showAlert({
        title: "Network is full",
        message: "Your network holds up to " + MAX_MEMBERS + " people. Remove someone before adding another.",
      });
      return;
    }
    setChooserOpen(true);
  }

  async function addMember() {
    let contact: string; let isEmail: boolean; let contactName: string | null = null;
    if (addMode === "email") {
      contact = email.trim(); isEmail = true;
    } else {
      const digits = phone.replace(/[^0-9]/g, "");
      if (!digits) { showAlert({ title: "Enter a number", message: "Please enter a phone number.", tone: "error" }); return; }
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
      const msg = m.includes("cannot_add_self") ? "You cannot add yourself."
        : m.includes("already_connected") ? "They are already in your network."
        : m.includes("invite_already_pending") ? "You have already sent them a request."
        : m.includes("network_full") ? "Your network is full. It holds up to " + MAX_MEMBERS + " people."
        : m.includes("empty_contact") ? "Enter a phone number or email address."
        : m;
      return showAlert({ title: "Could not send request", message: msg, tone: "error" });
    }
    const isUser = data && data[0] && data[0].target_is_user;
    setEmail(""); setName(""); setPhone(""); setAddOpen(false); load();
    showAlert({
      title: "Request sent",
      message: isUser
        ? "They have a FlagRisk account. They will get a request to join your safety circle and can accept it in the app."
        : "They are not on FlagRisk yet. They will be invited, and they will appear in your network once they accept.",
    });
  }

  async function togglePanic(m: Member) {
    await supabase.from("network_connections")
      .update({ in_panic_circle: !m.in_panic_circle })
      .eq("owner_id", uid).eq("member_id", m.member_id);
    setActionTarget(null);
    load();
  }

  async function doRemove(m: Member) {
    await supabase.from("network_connections").delete().eq("owner_id", uid).eq("member_id", m.member_id);
    setActionTarget(null);
    load();
  }

  function cancelInvite(inv: any) {
    showAlert({
      title: "Cancel invite",
      message: "Cancel the invite to " + (inv.invitee_name ?? inv.invitee_contact) + "?",
      buttons: [
        { text: "Keep", style: "cancel" },
        { text: "Cancel invite", style: "destructive", onPress: async () => {
            await supabase.rpc("revoke_network_invite", { p_token: inv.token });
            load();
          } },
      ],
    });
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => (m.display_name ?? "").toLowerCase().includes(q));
  }, [members, query]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtnPlain} hitSlop={8}>
          <ArrowLeft size={20} color={colors.ink} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headTitle}>Network</Text>
        <Pressable
          onPress={() => navigation.navigate("NetworkInvites")}
          style={styles.headBtnFilled}
          hitSlop={8}
        >
          <EllipsisVertical size={18} color={colors.ink} strokeWidth={2} />
          {inviteCount > 0 ? <View style={styles.headPip} /> : null}
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <Search size={16} color="#9F9F9F" strokeWidth={2} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search"
          placeholderTextColor="#9F9F9F"
          style={styles.searchInput}
        />
      </View>

      <View style={styles.divider} />
      <Text style={styles.countLine}>{members.length} of {MAX_MEMBERS} members</Text>

      {inviteCount > 0 ? (
        <Pressable onPress={() => navigation.navigate("NetworkInvites")} style={styles.inviteBanner}>
          <Text style={styles.inviteBannerText}>
            {inviteCount} request{inviteCount === 1 ? "" : "s"} waiting for you. Tap to review.
          </Text>
        </Pressable>
      ) : null}

      {!loading && members.length === 0 && pending.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Your network is empty</Text>
          <Text style={styles.emptySub}>Add new members to your network.</Text>
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(m) => m.member_id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            pending.length > 0 ? (
              <View style={{ marginBottom: spacing.sm }}>
                <Text style={styles.groupLabel}>Waiting to accept</Text>
                {pending.map((p) => (
                  <View key={p.token} style={styles.row}>
                    <View style={styles.pendingAvatar}>
                      <Clock3 size={18} color={colors.textMuted} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {p.invitee_name ?? p.invitee_contact}
                      </Text>
                      <Text style={styles.rowSub}>Not in your network until they accept</Text>
                    </View>
                    <Pressable onPress={() => cancelInvite(p)} hitSlop={10} style={styles.rowBtn}>
                      <X size={18} color={colors.riskHigh} strokeWidth={2} />
                    </Pressable>
                  </View>
                ))}
                {members.length > 0 ? <Text style={[styles.groupLabel, { marginTop: spacing.md }]}>Your network</Text> : null}
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => setActionTarget(item)}>
              <Avatar uri={item.avatar_url} name={item.display_name} id={item.member_id} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName} numberOfLines={1}>{item.display_name ?? "FlagRisk user"}</Text>
                <Text style={styles.rowSub}>
                  {item.in_panic_circle ? "In my panic circle" : "Not in my panic circle"}
                </Text>
              </View>
              <Pressable onPress={() => setActionTarget(item)} hitSlop={10} style={styles.rowBtn}>
                <EllipsisVertical size={18} color={colors.textMuted} strokeWidth={2} />
              </Pressable>
            </Pressable>
          )}
        />
      )}

      <Pressable
        style={[styles.fab, full && { opacity: 0.4 }]}
        onPress={openChooser}
        hitSlop={10}
      >
        <Plus size={24} color="#FFFFFF" strokeWidth={2.4} />
      </Pressable>

      <Modal visible={!!actionTarget} transparent animationType="slide" onRequestClose={() => setActionTarget(null)}>
        <DraggableSheet
          visible={!!actionTarget}
          onDismiss={() => setActionTarget(null)}
          title={actionTarget?.display_name ?? "This contact"}
          insetBottom={insets.bottom}
        >
          <Pressable style={styles.sheetRow} onPress={() => actionTarget && togglePanic(actionTarget)}>
            {actionTarget?.in_panic_circle
              ? <ShieldMinus size={20} color={colors.ink} strokeWidth={2} />
              : <ShieldPlus size={20} color={colors.ink} strokeWidth={2} />}
            <Text style={styles.sheetText}>
              {actionTarget?.in_panic_circle ? "Remove from panic circle" : "Add to panic circle"}
            </Text>
          </Pressable>
          <Pressable style={styles.sheetRow} onPress={() => actionTarget && doRemove(actionTarget)}>
            <UserMinus size={20} color={colors.riskHigh} strokeWidth={2} />
            <Text style={[styles.sheetText, { color: colors.riskHigh }]}>Remove from network</Text>
          </Pressable>
        </DraggableSheet>
      </Modal>

      <Modal visible={chooserOpen} transparent animationType="slide" onRequestClose={() => setChooserOpen(false)}>
        <DraggableSheet
          visible={chooserOpen}
          onDismiss={() => setChooserOpen(false)}
          title="Add contact from"
          subtitle="Choose how to add someone to your circle."
          insetBottom={insets.bottom}
        >
          <Pressable style={styles.sheetRow} onPress={() => { setChooserOpen(false); setAddMode("manual"); setAddOpen(true); }}>
            <Pencil size={20} color={colors.ink} strokeWidth={2} />
            <Text style={styles.sheetText}>Add manually</Text>
          </Pressable>
          <Pressable style={styles.sheetRow} onPress={() => { setChooserOpen(false); setAddMode("email"); setAddOpen(true); }}>
            <AtSign size={20} color={colors.ink} strokeWidth={2} />
            <Text style={styles.sheetText}>Email address</Text>
          </Pressable>
          <Pressable style={styles.sheetRow} onPress={() => { setChooserOpen(false); navigation.navigate("Phonebook"); }}>
            <BookUser size={20} color={colors.ink} strokeWidth={2} />
            <Text style={styles.sheetText}>Phonebook</Text>
          </Pressable>
        </DraggableSheet>
      </Modal>

      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)}>
        <DraggableSheet
          visible={addOpen}
          onDismiss={() => setAddOpen(false)}
          title={addMode === "email" ? "Add by email" : "Add to your circle"}
          subtitle="They must accept before they join your safety circle."
          insetBottom={insets.bottom}
        >
          {addMode === "manual" ? (
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Name (optional)"
              placeholderTextColor="#9F9F9F"
            />
          ) : null}
          {addMode === "email" ? (
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Email address"
              placeholderTextColor="#9F9F9F"
              autoCapitalize="none"
              keyboardType="email-address"
            />
          ) : (
            <View style={{ marginTop: spacing.md }}>
              <PhoneInput dial={dial} number={phone} onChangeDial={setDial} onChangeNumber={setPhone} placeholder="Phone number" />
            </View>
          )}
          <Pressable style={[styles.primaryBtn, adding && { opacity: 0.7 }]} onPress={addMember} disabled={adding}>
            <Text style={styles.primaryBtnText}>{adding ? "Sending" : "Add contact"}</Text>
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
  headBtnFilled: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#F0F0F0", alignItems: "center", justifyContent: "center" },
  headPip: { position: "absolute", top: 7, right: 7, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.riskHigh },
  headTitle: { flex: 1, ...type.heading, color: colors.ink, textAlign: "center" },

  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    height: 42, borderRadius: radius.md, backgroundColor: "#FAFAFA",
    marginHorizontal: spacing.gutter, marginTop: spacing.lg, paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, ...type.label, fontWeight: "400", color: colors.ink, padding: 0 },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.gutter, marginTop: spacing.md },
  countLine: { ...type.caption, color: colors.textMuted, marginHorizontal: spacing.gutter, marginTop: spacing.sm },

  inviteBanner: {
    marginHorizontal: spacing.gutter, marginTop: spacing.sm,
    backgroundColor: "#F0F0F0", borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: spacing.md,
  },
  inviteBannerText: { ...type.caption, fontWeight: "600", color: colors.ink, textAlign: "center" },

  list: { paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: screenBottomPad },
  groupLabel: { fontSize: 12, lineHeight: 24, fontWeight: "600", color: "#333333" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.ms },
  pendingAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#F0F0F0", alignItems: "center", justifyContent: "center" },
  rowName: { ...type.label, color: "#000000" },
  rowSub: { ...type.caption, fontWeight: "500", color: "#8B8B8B", marginTop: 3 },
  rowBtn: { paddingHorizontal: 6, paddingVertical: 6 },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl },
  emptyTitle: { ...type.subheading, color: colors.ink },
  emptySub: { ...type.caption, color: colors.textMuted, marginTop: 6 },

  fab: {
    position: "absolute", right: spacing.gutter, bottom: screenBottomPad,
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.ink,
    alignItems: "center", justifyContent: "center", ...elevation.card,
  },

  sheetRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  sheetText: { ...type.body, fontWeight: "500", color: colors.ink },
  input: {
    height: 52, borderRadius: radius.md, backgroundColor: "#FAFAFA",
    paddingHorizontal: spacing.md, ...type.body, color: colors.ink, marginTop: spacing.md,
  },
  primaryBtn: {
    height: 52, borderRadius: radius.md, backgroundColor: colors.ink,
    alignItems: "center", justifyContent: "center", marginTop: spacing.lg,
  },
  primaryBtnText: { ...type.bodyStrong, fontWeight: "600", color: colors.accent },
});
