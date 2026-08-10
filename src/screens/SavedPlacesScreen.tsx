// ============================================================================
// Saved places - FlagRisk v2.1
// Designed, not rebuilt: no mockup exists.
//   header | explainer card | place rows | 48pt ink FAB | save sheet
//
// The explainer is the point of this rebuild. All four testers who opened this
// screen said they could not tell what saved places were for. The feature was
// never broken; it was never explained. The card at the top now says what it
// does before showing an empty list.
//
// Behaviour unchanged: saving uses your current position, which is why the
// sheet says so plainly rather than implying you can pick a point.
// ============================================================================
import { useCallback, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { ArrowLeft, MapPin, Plus, Trash2, Home } from "lucide-react-native";
import * as Location from "expo-location";
import { supabase } from "../../lib/supabase";
import { showAlert } from "../components/Feedback";
import { DraggableSheet } from "../components/DraggableSheet";
import { colors, radius, spacing, type, elevation, screenBottomPad } from "../theme";

type Place = { id: string; label: string };

export function SavedPlacesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
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
      if (status !== "granted") {
        setBusy(false);
        return showAlert({ title: "Location needed", message: "Allow location so this place can be saved.", tone: "error" });
      }
      const pos = await Location.getCurrentPositionAsync({});
      const { data: u } = await supabase.auth.getUser();
      const wkt = "SRID=4326;POINT(" + pos.coords.longitude + " " + pos.coords.latitude + ")";
      const { error } = await supabase.from("saved_places").insert({
        user_id: u.user?.id, label: label.trim(), location: wkt,
      });
      setBusy(false);
      if (error) return showAlert({ title: "Could not save", message: error.message, tone: "error" });
      setLabel(""); setAddOpen(false); load();
    } catch (e) {
      setBusy(false);
      showAlert({ title: "Error", message: String(e), tone: "error" });
    }
  }

  function remove(p: Place) {
    showAlert({
      title: "Remove place",
      message: "Remove " + p.label + " from your saved places?",
      buttons: [
        { text: "Keep", style: "cancel" },
        {
          text: "Remove", style: "destructive", onPress: async () => {
            await supabase.from("saved_places").delete().eq("id", p.id);
            load();
          },
        },
      ],
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtnPlain} hitSlop={8}>
          <ArrowLeft size={20} color={colors.ink} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headTitle}>Saved places</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.explainer}>
        <View style={styles.explainerIcon}>
          <Home size={18} color={colors.ink} strokeWidth={2} />
        </View>
        <Text style={styles.explainerText}>
          Save the places that matter to you, such as home, work, or where your family stays.
          FlagRisk watches for risks reported near them, so you hear about trouble at home even
          when you are somewhere else.
        </Text>
      </View>

      {places.length === 0 ? (
        <View style={styles.empty}>
          <MapPin size={32} color={colors.textFaint} strokeWidth={1.8} />
          <Text style={styles.emptyTitle}>No saved places yet</Text>
          <Text style={styles.emptySub}>Stand where you want to save, then tap the plus button.</Text>
        </View>
      ) : (
        <FlatList
          data={places}
          keyExtractor={(p) => p.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, paddingBottom: screenBottomPad }}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowChip}>
                <MapPin size={18} color={colors.ink} strokeWidth={2} />
              </View>
              <Text style={styles.placeLabel} numberOfLines={1}>{item.label}</Text>
              <Pressable onPress={() => remove(item)} hitSlop={10} style={styles.removeBtn}>
                <Trash2 size={17} color={colors.riskHigh} strokeWidth={2} />
              </Pressable>
            </View>
          )}
        />
      )}

      <Pressable style={styles.fab} onPress={() => setAddOpen(true)} hitSlop={10}>
        <Plus size={24} color="#FFFFFF" strokeWidth={2.4} />
      </Pressable>

      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)}>
        <DraggableSheet
          visible={addOpen}
          onDismiss={() => setAddOpen(false)}
          insetBottom={insets.bottom}
          title="Save this place"
          subtitle="This saves where you are standing right now. Move to the place first, then save it."
        >
          <TextInput
            style={styles.input}
            value={label}
            onChangeText={setLabel}
            placeholder="Label, for example Home or Work"
            placeholderTextColor="#9F9F9F"
          />
          <Pressable style={[styles.saveBtn, busy && { opacity: 0.7 }]} onPress={addPlace} disabled={busy}>
            <Text style={styles.saveText}>{busy ? "Saving" : "Save this place"}</Text>
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

  explainer: {
    flexDirection: "row", gap: spacing.ms, alignItems: "flex-start",
    backgroundColor: "#FAFAFA", borderRadius: radius.md,
    marginHorizontal: spacing.gutter, marginTop: spacing.lg, padding: spacing.md,
  },
  explainerIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  explainerText: { flex: 1, ...type.caption, color: colors.textMuted, lineHeight: 18 },

  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.ms,
    paddingVertical: spacing.ms, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  rowChip: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#F0F0F0", alignItems: "center", justifyContent: "center" },
  placeLabel: { flex: 1, ...type.label, fontWeight: "500", color: colors.ink },
  removeBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },

  fab: {
    position: "absolute", right: spacing.gutter, bottom: spacing.xl,
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.ink,
    alignItems: "center", justifyContent: "center", ...elevation.card,
  },

  input: {
    height: 52, borderRadius: radius.sm, backgroundColor: "#FAFAFA",
    paddingHorizontal: spacing.md, ...type.body, color: colors.ink, marginTop: spacing.md,
  },
  saveBtn: { height: 52, borderRadius: radius.md, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center", marginTop: spacing.lg },
  saveText: { ...type.bodyStrong, fontWeight: "600", color: colors.accent },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, gap: 8 },
  emptyTitle: { ...type.subheading, color: colors.ink },
  emptySub: { ...type.caption, color: colors.textMuted, textAlign: "center", lineHeight: 18 },
});
