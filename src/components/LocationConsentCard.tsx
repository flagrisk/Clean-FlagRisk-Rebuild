// One-time location consent card. Honest disclosure BEFORE the OS permission
// dialog. Records the decision via set_consent, then (on allow) requests OS
// permission and logs location. Dismissible; never blocks the app.
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { MapPin } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { logLocationOnce } from "../../lib/push";
import { useTheme } from "../theme/ThemeProvider";

export const LOCATION_DISCLOSURE_VERSION = "location_v1";

export function LocationConsentCard({ visible, onDone, title, body }) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);

  async function record(status) {
    try { await supabase.rpc("set_consent", { p_type: "location", p_status: status, p_disclosure_version: LOCATION_DISCLOSURE_VERSION }); } catch (_e) {}
  }

  async function allow() {
    if (busy) return;
    setBusy(true);
    await record("granted");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") { logLocationOnce(0); }
    } catch (_e) {}
    setBusy(false);
    onDone && onDone();
  }

  async function notNow() {
    if (busy) return;
    setBusy(true);
    await record("declined");
    setBusy(false);
    onDone && onDone();
  }

  const s = styles(t);
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={notNow}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <LinearGradient colors={t.gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.iconWrap}>
            <MapPin size={26} color={t.colors.accentText} strokeWidth={2.2} />
          </LinearGradient>
          <Text style={[s.title, { color: t.colors.text }]}>{title || "Share your location for safety"}</Text>
          <Text style={[s.body, { color: t.colors.textMuted }]}>{body || "FlagRisk uses your location for two things. First, when someone nearby triggers an emergency alarm, we alert people close enough to help. Second, it lets the people in your safety circle reach you when you need them."}</Text>
          <Text style={[s.body, { color: t.colors.textMuted }]}>Your location is stored only while it is recent and is removed automatically over time. You can turn this off at any time in your device settings.</Text>
          <Pressable onPress={allow} disabled={busy} style={{ width: "100%" }}>
            <LinearGradient colors={t.gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.primaryBtn, busy && { opacity: 0.7 }]}>
              <Text style={[s.primaryText, { color: t.colors.accentText }]}>Allow location</Text>
            </LinearGradient>
          </Pressable>
          <Pressable onPress={notNow} disabled={busy} style={s.secondaryBtn}>
            <Text style={[s.secondaryText, { color: t.colors.textMuted }]}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function styles(t) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 28 },
    card: { width: "100%", maxWidth: 420, backgroundColor: (t.glass && t.glass.surface) || "#fff", borderRadius: (t.radius && t.radius.xl) || 24, padding: 24, alignItems: "center", boxShadow: "0px 0px 3px 2px rgba(20,25,40,0.18), 0px 14px 34px rgba(40,50,80,0.24)" },
    iconWrap: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 16 },
    title: { fontSize: 20, fontWeight: "800", textAlign: "center", marginBottom: 12, letterSpacing: -0.3 },
    body: { fontSize: 14, lineHeight: 21, textAlign: "center", marginBottom: 14 },
    primaryBtn: { height: 52, borderRadius: (t.radius && t.radius.md) || 12, alignItems: "center", justifyContent: "center", marginTop: 8 },
    primaryText: { fontSize: 16, fontWeight: "800" },
    secondaryBtn: { height: 44, alignItems: "center", justifyContent: "center", marginTop: 4 },
    secondaryText: { fontSize: 14, fontWeight: "600" },
  });
}
