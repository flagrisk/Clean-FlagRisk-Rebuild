// Saved Places (V2 rich + theming). Lucide icons, gradient empty-state chip, lifted rows.
import { useCallback, useState } from "react";
import { showAlert } from "../components/Feedback";
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { MapPin, Plus, X } from "lucide-react-native";
import * as Location from "expo-location";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing } from "../theme";
import { DraggableSheet } from "../components/DraggableSheet";

type Place = { id: string; label: string };

export function SavedPlacesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { colors, glass, gradients, glow } = useTheme();
  const [places, setPlaces] = useState<Place[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("saved_places").select("id, label").order("created_at");
    setPlaces(data ?? []);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function addPlace() {
    if (!label.trim()) return;
    setBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { setBusy(false); return showAlert({ title: "Location needed", message: "Allow location to save this place.", tone: "error" }); }
      const pos = await Location.getCurrentPositionAsync({});
      const { data: u } = await supabase.auth.getUser();
      const wkt = `SRID=4326;POINT(${pos.coords.longitude} ${pos.coords.latitude})`;
      const { error } = await supabase.from("saved_places").insert({ user_id: u.user?.id, label: label.trim(), location: wkt });
      setBusy(false);
      if (error) return showAlert({ title: "Could not save", message: error.message, tone: "error" });
      setLabel(""); setAddOpen(false); load();
    } catch (e) { setBusy(false); showAlert({ title: "Error", message: String(e), tone: "error" }); }
  }

  function remove(p: Place) {
    showAlert({ title: "Remove place", message: `Remove "${p.label}"?`, buttons: [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => { await supabase.from("saved_places").delete().eq("id", p.id); load(); } },
    ] });
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}><Text style={[styles.back, { color: colors.accentOn }]}>‹ Back</Text></Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Saved Places</Text>
        <View style={{ width: 50 }} />
      </View>

      {places.length === 0 ? (
        <View style={styles.empty}>
          <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={[styles.emptyChip, { boxShadow: glow.brand } as any]}>
            <MapPin size={30} color={colors.accentText} strokeWidth={2} />
          </LinearGradient>
          <Text style={[styles.emptyText, { color: colors.text }]}>No saved places yet.</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>Save places like home or work to get relevant alerts.</Text>
        </View>
      ) : (
        <FlatList
          data={places}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 110, gap: spacing.md }}
          renderItem={({ item }) => (
            <View style={[styles.row, { backgroundColor: glass.surface, borderColor: glass.stroke, boxShadow: glow.soft } as any]}>
              <View style={[styles.rowChip, { backgroundColor: colors.accentOn + "1f", borderColor: colors.accentOn + "44" }]}>
                <MapPin size={18} color={colors.accentOn} strokeWidth={2} />
              </View>
              <Text style={[styles.placeLabel, { color: colors.text }]}>{item.label}</Text>
              <Pressable onPress={() => remove(item)} hitSlop={10} style={styles.removeBtn}>
                <X size={18} color={colors.danger} strokeWidth={2.2} />
              </Pressable>
            </View>
          )}
        />
      )}

      <Pressable style={styles.fabWrap} onPress={() => setAddOpen(true)}>
        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[styles.fab, { boxShadow: glow.brand } as any]}>
          <Plus size={26} color={colors.accentText} strokeWidth={2.4} />
        </LinearGradient>
      </Pressable>

      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)}>
        <DraggableSheet visible={addOpen} onDismiss={() => setAddOpen(false)} insetBottom={insets.bottom}
          title="Save this place" subtitle="Uses your current location.">
          <TextInput style={[styles.input, { borderColor: glass.stroke, backgroundColor: glass.surface, color: colors.text }]}
            value={label} onChangeText={setLabel} placeholder="Label (e.g. Home, Work)" placeholderTextColor={colors.textMuted} />
          <Pressable style={styles.saveWrap} onPress={addPlace} disabled={busy}>
            <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={[styles.saveBtn, busy && { opacity: 0.7 }]}>
              <Text style={[styles.saveText, { color: colors.accentText }]}>{busy ? "Saving..." : "Save place"}</Text>
            </LinearGradient>
          </Pressable>
        </DraggableSheet>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { fontSize: 16, fontWeight: "700" },
  headerTitle: { fontSize: 18, fontWeight: "800" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyChip: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  emptyText: { fontSize: 16, fontWeight: "700" },
  emptySub: { fontSize: 14, marginTop: 4, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md },
  rowChip: { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  placeLabel: { fontSize: 16, fontWeight: "600", flex: 1 },
  removeBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  fabWrap: { position: "absolute", right: spacing.lg, bottom: 90 },
  fab: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  input: { height: 56, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, fontSize: 16, marginTop: spacing.md },
  saveWrap: { marginTop: spacing.md, borderRadius: radius.md },
  saveBtn: { height: 56, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  saveText: { fontSize: 16, fontWeight: "800" },
});
