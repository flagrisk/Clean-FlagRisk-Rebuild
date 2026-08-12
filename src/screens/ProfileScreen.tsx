// ============================================================================
// Account / Profile - FlagRisk v2.1
// Rebuilt against Figma "Profile" (node 115:1942) and the 11.0 Profile flow.
//   header 36pt round back | title 20/700 centred | 36pt #F0F0F0 edit button
//   avatar 100pt | name 20/700 | email 12 muted | plan chip
//   info card #FAFAFA r16 with 40pt icon circles, label 12 muted / value 14/500
// Settings keeps the full entry list, so this screen is identity plus the two
// check-in actions, not the mockup's six-row hub.
//
// FIX: the avatar upload used fetch(uri).blob(), which yields an empty body on
// React Native and wrote 0-byte objects. Now reads base64 -> ArrayBuffer.
// ============================================================================
import { useCallback, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import { decode as decodeBase64 } from "base64-arraybuffer";
import * as Location from "expo-location";
import {
  ArrowLeft, Pencil, Star, Globe, Phone, Crosshair, MapPin, CalendarDays,
  CreditCard, Inbox, Settings as SettingsIcon, LogOut, Send, Check,
} from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { showAlert } from "../components/Feedback";
import { useRiskCache } from "../theme/RiskCache";
import { SlideAction } from "../components/SlideAction";
import { humanize } from "../format";
import { colors, radius, spacing, type, screenBottomPad } from "../theme";

const SUPABASE_URL = "https://aqgkntulbuqqqjxjafmw.supabase.co";

export function ProfileScreen() {
  const navigation = useNavigation<any>();
  const cache = useRiskCache();
  const cp = cache.profile;
  const [name, setName] = useState(cp?.name ?? "");
  const [email, setEmail] = useState(cp?.email ?? "");
  const [phone, setPhone] = useState(cp?.phone ?? "");
  const [tier, setTier] = useState(cp?.tier ?? "basic");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(cp?.avatarUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkInDone, setCheckInDone] = useState(false);
  const insets = useSafeAreaInsets();
  const [lastFlag, setLastFlag] = useState<
    { when: string; cat: string; lat: number | null; lng: number | null; place: string | null } | null
  >(null);

  useFocusEffect(useCallback(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      setEmail(u.user?.email ?? "");
      if (!uid) return;
      const { data: prof } = await supabase
        .from("profiles").select("display_name, phone, current_tier, avatar_url").eq("id", uid).single();
      if (prof) {
        setName(prof.display_name ?? "");
        setPhone(prof.phone ?? "");
        setTier(prof.current_tier ?? "basic");
        setAvatarUrl(prof.avatar_url ?? null);
        cache.setProfile({
          name: prof.display_name ?? "",
          email: u.user?.email ?? "",
          phone: prof.phone ?? "",
          tier: prof.current_tier ?? "basic",
          avatarUrl: prof.avatar_url ?? null,
        });
      }
      const { data: lastRows } = await supabase.rpc("my_last_flag");
      const last = Array.isArray(lastRows) && lastRows.length > 0 ? lastRows[0] : null;
      if (last) {
        const d = new Date(last.occurred_at);
        setLastFlag({ cat: last.category_id, when: d.toLocaleString(), lat: last.lat ?? null, lng: last.lng ?? null, place: null });
        if (last.lat != null && last.lng != null) {
          try {
            const { data: geo } = await supabase.functions.invoke("geocode", { body: { lat: last.lat, lng: last.lng } });
            if (geo && geo.ok && geo.label) setLastFlag((cur) => (cur ? { ...cur, place: geo.label } : cur));
          } catch (_e) {}
        }
      } else setLastFlag(null);
    })();
  }, []));

  async function doCheckIn() {
    if (checkingIn) return;
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setCheckInOpen(false);
      return showAlert({
        title: "Location needed",
        message: "Allow location access to share a check-in.",
        tone: "error",
      });
    }
    setCheckingIn(true);
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { error } = await supabase.rpc("send_check_in", {
        p_lat: pos.coords.latitude, p_lng: pos.coords.longitude, p_note: null,
      });
      setCheckingIn(false);
      if (error) {
        setCheckInOpen(false);
        return showAlert({
          title: "Check-in not sent",
          message: "We could not send your check-in. Please try again.",
          tone: "error",
        });
      }
      setCheckInDone(true);
    } catch (e) {
      setCheckingIn(false);
      setCheckInOpen(false);
      showAlert({
        title: "Check-in not sent",
        message: "We could not send your check-in. Please try again.",
        tone: "error",
      });
    }
  }

  async function pickAndUpload() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      return showAlert({ title: "Permission needed", message: "Allow photo access to set a profile picture.", tone: "error" });
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false, quality: 1 });
    if (res.canceled || !res.assets || !res.assets[0]) return;
    const picked = res.assets[0];
    const side = Math.min(picked.width ?? 0, picked.height ?? 0);
    const originX = Math.floor(((picked.width ?? 0) - side) / 2);
    const originY = Math.floor(((picked.height ?? 0) - side) / 2);
    const asset = await ImageManipulator.manipulateAsync(
      picked.uri,
      [{ crop: { originX, originY, width: side, height: side } }, { resize: { width: 512, height: 512 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { data: sess } = await supabase.auth.getSession();
      const uid = u.user?.id;
      const token = sess.session ? sess.session.access_token : null;
      const path = uid + "/avatar.jpg";

      // Real bytes. fetch(uri).blob() sends an empty body on React Native.
      const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      const bytes = decodeBase64(b64);
      if (!bytes || bytes.byteLength === 0) throw new Error("The selected image was empty. Please choose another.");

      const uploadUrl = SUPABASE_URL + "/storage/v1/object/avatars/" + path;
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", uploadUrl);
        xhr.setRequestHeader("Authorization", "Bearer " + token);
        xhr.setRequestHeader("Content-Type", "image/jpeg");
        xhr.setRequestHeader("x-upsert", "true");
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error("Upload failed (" + xhr.status + ")"));
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(bytes);
      });

      const publicUrl = SUPABASE_URL + "/storage/v1/object/public/avatars/" + path + "?t=" + Date.now();
      await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", uid);
      setAvatarUrl(publicUrl);
      cache.setProfile({ name, email, phone, tier, avatarUrl: publicUrl });
    } catch (e: any) {
      showAlert({ title: "Upload failed", message: String(e && e.message ? e.message : e), tone: "error" });
    } finally {
      setUploading(false);
    }
  }

  const initials = (name || email || "?").split(/[ @]/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const planWord = tier.charAt(0).toUpperCase() + tier.slice(1);
  const point = lastFlag && lastFlag.lat != null && lastFlag.lng != null
    ? lastFlag.lat.toFixed(5) + ", " + lastFlag.lng.toFixed(5)
    : null;

  const InfoRow = ({
    Icon, label, value, last,
  }: { Icon: any; label: string; value: string; last?: boolean }) => (
    <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
      <View style={styles.infoIcon}>
        <Icon size={18} color={colors.ink} strokeWidth={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtnPlain} hitSlop={8}>
          <ArrowLeft size={20} color={colors.ink} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headTitle}>Profile</Text>
        <Pressable onPress={() => navigation.navigate("EditProfile")} style={styles.headBtnFilled} hitSlop={8}>
          <Pencil size={17} color={colors.ink} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Pressable onPress={pickAndUpload} disabled={uploading} style={styles.avatarWrap}>
          <View style={styles.avatar}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarText}>{initials}</Text>
            )}
            {uploading ? (
              <View style={styles.uploadOverlay}><ActivityIndicator color="#FFFFFF" /></View>
            ) : null}
          </View>
          <View style={styles.camBadge}>
            <Pencil size={13} color="#FFFFFF" strokeWidth={2.4} />
          </View>
        </Pressable>

        <Text style={styles.name}>{name || "Your name"}</Text>
        <Text style={styles.email} numberOfLines={1}>{email || "-"}</Text>

        <View style={styles.planChip}>
          <Star size={12} color="#F2C94C" fill="#F2C94C" strokeWidth={0} />
          <Text style={styles.planChipText}>{planWord}</Text>
        </View>

        <View style={styles.infoCard}>
          <InfoRow Icon={Globe} label="Country" value="Nigeria" />
          <InfoRow Icon={Phone} label="Phone" value={phone || "Not set"} />
          <InfoRow Icon={Crosshair} label="Last flag point" value={point || "No reports yet"} />
          <InfoRow Icon={MapPin} label="Last flag location" value={lastFlag && lastFlag.place ? lastFlag.place : "Not available"} />
          <InfoRow
            Icon={CalendarDays}
            label="Last flagged"
            value={lastFlag ? humanize(lastFlag.cat) + ", " + lastFlag.when : "No reports yet"}
            last
          />
        </View>

        <View style={styles.infoCard}>
          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <View style={styles.infoIcon}>
              <CreditCard size={18} color={colors.ink} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Subscription</Text>
              <Text style={styles.infoValue}>{planWord}</Text>
            </View>
            <Pressable style={styles.upgradeBtn} onPress={() => navigation.navigate("PlanPricing")}>
              <Text style={styles.upgradeText}>Upgrade</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.slideWrap}>
          <SlideAction
            label="Slide to send a check-in"
            committedLabel="Sent"
            onCommit={() => { setCheckInDone(false); setCheckInOpen(true); doCheckIn(); }}
            disabled={checkingIn}
          />
        </View>
        <Text style={styles.hint}>Quietly share where you are with your panic circle.</Text>

        <Pressable style={styles.linkRow} onPress={() => navigation.navigate("CheckInInbox")}>
          <Inbox size={18} color={colors.ink} strokeWidth={2} />
          <Text style={styles.linkText}>Check-ins shared with you</Text>
        </Pressable>
        <Pressable style={styles.linkRow} onPress={() => navigation.navigate("Settings")}>
          <SettingsIcon size={18} color={colors.ink} strokeWidth={2} />
          <Text style={styles.linkText}>Settings</Text>
        </Pressable>
        <Pressable style={styles.linkRow} onPress={() => supabase.auth.signOut({ scope: "local" })}>
          <LogOut size={18} color={colors.riskHigh} strokeWidth={2} />
          <Text style={[styles.linkText, { color: colors.riskHigh }]}>Sign out</Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={checkInOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCheckInOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => { if (!checkingIn) setCheckInOpen(false); }}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} onPress={() => {}}>
            <View style={styles.grabber} />
            {checkInDone ? (
              <>
                <View style={styles.doneDisc}>
                  <Check size={30} color={colors.accent} strokeWidth={3} />
                </View>
                <Text style={styles.sheetTitle}>Check-in sent</Text>
                <Text style={styles.sheetBody}>
                  Your location has been sent to your safety circle.
                </Text>
                <Pressable style={styles.sheetBtn} onPress={() => setCheckInOpen(false)}>
                  <Text style={styles.sheetBtnText}>Done</Text>
                </Pressable>
              </>
            ) : (
              <>
                <ActivityIndicator color={colors.ink} style={{ marginVertical: spacing.xl }} />
                <Text style={styles.sheetTitle}>Sending your check-in</Text>
                <Text style={styles.sheetBody}>Reading your location.</Text>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  header: { height: 36, flexDirection: "row", alignItems: "center", marginHorizontal: spacing.gutter, marginTop: spacing.md },
  headBtnPlain: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headBtnFilled: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#F0F0F0", alignItems: "center", justifyContent: "center" },
  headTitle: { flex: 1, ...type.heading, color: colors.ink, textAlign: "center" },

  scroll: { paddingHorizontal: spacing.gutter, paddingTop: spacing.xl, paddingBottom: screenBottomPad, alignItems: "center" },

  avatarWrap: { width: 100, height: 100 },
  avatar: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: "#F0F0F0",
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarText: { ...type.display, color: colors.textMuted },
  uploadOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  camBadge: {
    position: "absolute", right: 0, bottom: 2, width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.ink, borderWidth: 2, borderColor: colors.bg,
    alignItems: "center", justifyContent: "center",
  },

  name: { ...type.heading, color: colors.ink, marginTop: spacing.md },
  email: { ...type.caption, color: colors.textMuted, marginTop: 2 },

  planChip: {
    flexDirection: "row", alignItems: "center", gap: 5, marginTop: spacing.sm,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.bg,
  },
  planChipText: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: colors.ink },

  infoCard: {
    width: "100%", backgroundColor: colors.bgElevated, borderRadius: radius.md,
    paddingHorizontal: spacing.md, marginTop: spacing.lg,
  },
  infoRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.ms,
    paddingVertical: spacing.ms, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  infoIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  infoLabel: { ...type.caption, color: colors.textMuted },
  infoValue: { ...type.label, color: colors.ink, marginTop: 2 },
  // White on the #FAFAFA card, with a border strong enough to read as a control.
  // The previous #F7F7F7 sat five levels from its own card and looked disabled.
  upgradeBtn: {
    backgroundColor: colors.bg, borderWidth: 1, borderColor: "rgba(20,21,42,0.28)",
    borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 9,
  },
  upgradeText: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: colors.ink },

  slideWrap: { width: "100%", marginTop: spacing.xl },
  hint: { ...type.caption, color: colors.textMuted, marginTop: 8, textAlign: "center" },

  linkRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.ms,
    width: "100%", paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  linkText: { ...type.label, fontWeight: "500", color: colors.ink },

  backdrop: { flex: 1, backgroundColor: "rgba(1,1,20,0.30)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#F6F6F8", borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.gutter, paddingTop: spacing.sm, alignItems: "center",
  },
  grabber: { width: 44, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: spacing.xl },
  doneDisc: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: colors.ink,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.md,
  },
  sheetTitle: { ...type.title, color: colors.ink, textAlign: "center" },
  sheetBody: {
    ...type.body, color: colors.textMuted, textAlign: "center",
    marginTop: spacing.sm, lineHeight: 23, maxWidth: 300,
  },
  sheetBtn: {
    width: "100%", height: 56, borderRadius: radius.md,
    backgroundColor: "#F7F7F7", borderWidth: 1, borderColor: "rgba(20,21,42,0.10)",
    alignItems: "center", justifyContent: "center", marginTop: spacing.xl,
  },
  sheetBtnText: { ...type.bodyStrong, fontWeight: "600", color: colors.ink },
});
