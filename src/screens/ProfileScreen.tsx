// Profile (V2 + theming + photo upload). Tap avatar to pick/crop a square photo,
// upload to the avatars bucket, save URL to profiles.avatar_url. Initials fallback.
import { useCallback, useState } from "react";
import { showAlert } from "../components/Feedback";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as Location from "expo-location";
import { MapPin, Inbox } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../theme/ThemeProvider";
import { humanize } from "../format";
import { useRiskCache } from "../theme/RiskCache";
import { radius, spacing } from "../theme";

const SUPABASE_URL = "https://aqgkntulbuqqqjxjafmw.supabase.co";

export function ProfileScreen() {
  const navigation = useNavigation<any>();
  const { colors, glass, gradients, glow } = useTheme();
  const cache = useRiskCache();
  const cp = cache.profile;
  const [name, setName] = useState(cp?.name ?? "");
  const [email, setEmail] = useState(cp?.email ?? "");
  const [phone, setPhone] = useState(cp?.phone ?? "");
  const [tier, setTier] = useState(cp?.tier ?? "basic");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(cp?.avatarUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [lastFlag, setLastFlag] = useState<{ when: string; cat: string; lat: number | null; lng: number | null; place: string | null } | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);

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
        // Reverse-geocode the point to a place name (best effort).
        if (last.lat != null && last.lng != null) {
          try {
            const { data: geo } = await supabase.functions.invoke("geocode", { body: { lat: last.lat, lng: last.lng } });
            if (geo && geo.ok && geo.label) {
              setLastFlag((cur) => cur ? { ...cur, place: geo.label } : cur);
            }
          } catch (_e) {}
        }
      } else setLastFlag(null);
    })();
  }, []));

  async function doCheckIn() {
    if (checkingIn) return;
    // Permission must be confirmed before we promise anything is being sent.
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") { return showAlert({ title: "Location needed", message: "Allow location access to share a check-in.", tone: "error" }); }
    // Instant feedback: confirm on tap, then get the fix and send in the background.
    showAlert({ title: "Sending your check-in", message: "Your location is being shared with your safety circle." });
    setCheckingIn(true);
    (async () => {
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const { error } = await supabase.rpc("send_check_in", { p_lat: pos.coords.latitude, p_lng: pos.coords.longitude, p_note: null });
        setCheckingIn(false);
        // Silent on success; recipients receiving the check-in is the confirmation.
        if (error) { showAlert({ title: "Check-in not sent", message: "We could not send your check-in. Please try again.", tone: "error" }); }
      } catch (e) {
        setCheckingIn(false);
        showAlert({ title: "Check-in not sent", message: "We could not send your check-in. Please try again.", tone: "error" });
      }
    })();
  }

  async function pickAndUpload() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return showAlert({ title: "Permission needed", message: "Allow photo access to set a profile picture.", tone: "error" });
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false, quality: 1 });
    if (res.canceled || !res.assets?.[0]) return;
    const picked = res.assets[0];
    const side = Math.min(picked.width ?? 0, picked.height ?? 0);
    const originX = Math.floor(((picked.width ?? 0) - side) / 2);
    const originY = Math.floor(((picked.height ?? 0) - side) / 2);
    const asset = await ImageManipulator.manipulateAsync(picked.uri, [{ crop: { originX, originY, width: side, height: side } }, { resize: { width: 512, height: 512 } }], { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG });
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { data: sess } = await supabase.auth.getSession();
      const uid = u.user?.id;
      const token = sess.session?.access_token;
      const path = `${uid}/avatar.jpg`;

      const r = await fetch(asset.uri);
      const blob = await r.blob();

      const uploadUrl = `${SUPABASE_URL}/storage/v1/object/avatars/${path}`;
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", uploadUrl);
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.setRequestHeader("Content-Type", "image/jpeg");
        xhr.setRequestHeader("x-upsert", "true");
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`${xhr.status}: ${xhr.responseText}`));
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(blob);
      });

      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}?t=${Date.now()}`;
      await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", uid);
      setAvatarUrl(publicUrl);
      cache.setProfile({ name, email, phone, tier, avatarUrl: publicUrl });
    } catch (e) {
      showAlert({ title: "Upload failed", message: String(e), tone: "error" });
    } finally {
      setUploading(false);
    }
  }

  const initials = (name || email || "?").split(/[ @]/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const planLabel = tier.charAt(0).toUpperCase() + tier.slice(1) + " Plan";

  const Row = ({ label, value }: { label: string; value: string }) => (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.text }]} numberOfLines={1}>{value}</Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top"]}>
      <Text style={[styles.header, { color: colors.text }]}>Profile</Text>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.avatarWrap}>
          <Pressable onPress={pickAndUpload} disabled={uploading}>
            <LinearGradient colors={gradients.brand} style={styles.avatarRing}>
              <View style={[styles.avatar, { backgroundColor: colors.bgElevated }]}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
                ) : (
                  <Text style={[styles.avatarText, { color: colors.accentOn }]}>{initials}</Text>
                )}
                {uploading && (
                  <View style={styles.uploadOverlay}><ActivityIndicator color="#fff" /></View>
                )}
              </View>
            </LinearGradient>
            <View style={[styles.camBadge, { backgroundColor: colors.accent, borderColor: colors.bg }]}>
              <Text style={[styles.camGlyph, { color: colors.accentText }]}>+</Text>
            </View>
          </Pressable>
        </View>
        <Text style={[styles.name, { color: colors.text }]}>{name || "Your name"}</Text>
        <Text style={[styles.tapHint, { color: colors.textMuted }]}>Tap photo to change</Text>

        <Pressable style={styles.editWrap} onPress={() => navigation.navigate("EditProfile")}>
          <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={[styles.editBtn, { boxShadow: glow.brand } as any]}>
            <Text style={[styles.editText, { color: colors.accentText }]}>Edit Profile</Text>
          </LinearGradient>
        </Pressable>

        <Pressable style={styles.checkInWrap} onPress={doCheckIn} disabled={checkingIn}>
          <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={[styles.checkInBtn, { boxShadow: glow.brand } as any, checkingIn && { opacity: 0.7 }]}>
            <MapPin size={20} color={colors.accentText} strokeWidth={2.4} />
            <Text style={[styles.checkInText, { color: colors.accentText }]}>{checkingIn ? "Sharing location..." : "Trip Check-in"}</Text>
          </LinearGradient>
        </Pressable>
        <Text style={[styles.checkInHint, { color: colors.textMuted }]}>Quietly share where you are with your panic circle.</Text>

        <Pressable style={[styles.linkBtn, { borderColor: glass.strokeStrong, backgroundColor: glass.surface, marginTop: spacing.md, flexDirection: "row", justifyContent: "center", gap: 8 }]} onPress={() => navigation.navigate("CheckInInbox")}>
          <Inbox size={18} color={colors.text} strokeWidth={2} />
          <Text style={[styles.linkText, { color: colors.text }]}>Check-ins shared with you</Text>
        </Pressable>

        <View style={[styles.card, { backgroundColor: glass.surface, borderColor: glass.stroke }]}>
          <Row label="Email" value={email || "-"} />
          <Row label="Phone" value={phone || "Not set"} />
          <Row label="Plan" value={planLabel} />
          <Row label="Last Flagged" value={lastFlag ? humanize(lastFlag.cat) : "No reports yet"} />
        {lastFlag && lastFlag.lat != null && lastFlag.lng != null && (
          <Row label="Point" value={lastFlag.lat.toFixed(5) + ", " + lastFlag.lng.toFixed(5)} />
        )}
        {lastFlag && lastFlag.place && <Row label="Location" value={lastFlag.place} />}
          {lastFlag && <Row label="When" value={lastFlag.when} />}
        </View>

        <View style={[styles.planCard, { backgroundColor: glass.surface, borderColor: glass.stroke }]}>
          <Text style={[styles.planTitle, { color: colors.text }]}>Subscription Plan</Text>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
            <Text style={[styles.planValue, { color: colors.accentOn }]}>{planLabel}</Text>
            <Pressable style={[styles.upgradeBtn, { backgroundColor: colors.accent }]} onPress={() => navigation.navigate("PlanPricing")}>
              <Text style={[styles.upgradeText, { color: colors.accentText }]}>Upgrade</Text>
            </Pressable>
          </View>
        </View>

        <Pressable style={[styles.linkBtn, { borderColor: glass.strokeStrong, backgroundColor: glass.surface }]} onPress={() => navigation.navigate("Settings")}>
          <Text style={[styles.linkText, { color: colors.text }]}>Settings</Text>
        </Pressable>
        <Pressable style={[styles.signOut, { borderColor: colors.danger }]} onPress={() => supabase.auth.signOut({ scope: "local" })}>
          <Text style={[styles.signOutText, { color: colors.danger }]}>Sign Out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { fontSize: 22, fontWeight: "800", textAlign: "center", paddingVertical: spacing.md },
  scroll: { padding: spacing.lg, alignItems: "center", paddingBottom: 155 },
  avatarWrap: { marginTop: spacing.sm },
  avatarRing: { width: 114, height: 114, borderRadius: 57, padding: 2, alignItems: "center", justifyContent: "center" },
  avatar: { width: "100%", height: "100%", borderRadius: 55, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: "100%", height: "100%", borderRadius: 55 },
  avatarText: { fontSize: 36, fontWeight: "800" },
  uploadOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", borderRadius: 55 },
  camBadge: { position: "absolute", right: 2, bottom: 2, width: 34, height: 34, borderRadius: 17, borderWidth: 3, alignItems: "center", justifyContent: "center" },
  camGlyph: { fontSize: 20, fontWeight: "800", lineHeight: 22 },
  name: { fontSize: 26, fontWeight: "800", marginTop: spacing.md },
  tapHint: { fontSize: 12, marginTop: 2 },
  editWrap: { marginTop: spacing.md, borderRadius: radius.md },
  editBtn: { borderRadius: radius.md, paddingHorizontal: spacing.xl, paddingVertical: 12 },
  editText: { fontWeight: "800", fontSize: 16 },
  checkInWrap: { width: "100%", borderRadius: radius.md, marginTop: spacing.xl },
  checkInBtn: { borderRadius: radius.md, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  checkInText: { fontWeight: "800", fontSize: 17 },
  checkInHint: { fontSize: 12, marginTop: 6, textAlign: "center" },
  card: { width: "100%", borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, marginTop: spacing.xl, gap: 14 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  rowLabel: { fontSize: 15 },
  rowValue: { fontSize: 15, flexShrink: 1, textAlign: "right" },
  planCard: { width: "100%", borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, marginTop: spacing.md },
  planTitle: { fontWeight: "700", fontSize: 16 },
  planValue: { fontSize: 15, fontWeight: "600" },
  upgradeBtn: { borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 8 },
  upgradeText: { fontWeight: "800" },
  linkBtn: { marginTop: spacing.xl, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.xl, paddingVertical: 12, width: "100%", alignItems: "center" },
  linkText: { fontWeight: "700" },
  signOut: { marginTop: spacing.md, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.xl, paddingVertical: 12, width: "100%", alignItems: "center" },
  signOutText: { fontWeight: "700" },
});


