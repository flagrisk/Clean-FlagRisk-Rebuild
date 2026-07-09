// PhoneInput: a country-code selector (searchable, Nigeria default) + number field.
// Value is the local number; onChange returns { dial, number, full }.
import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Search, X, ChevronDown } from "lucide-react-native";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing } from "../theme";
import { COUNTRIES, DEFAULT_COUNTRY, Country } from "../data/countries";

type Props = {
  dial?: string;                 // controlled dial code, e.g. "+234"
  number: string;                // the local number
  onChangeNumber: (n: string) => void;
  onChangeDial: (d: string) => void;
  placeholder?: string;
};

export function PhoneInput({ dial, number, onChangeNumber, onChangeDial, placeholder }: Props) {
  const { colors, glass } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected: Country =
    COUNTRIES.find((c) => c.dial === dial) || DEFAULT_COUNTRY;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.dial.includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <View>
      <View style={styles.row}>
        <Pressable
          onPress={() => setOpen(true)}
          style={[styles.codeBtn, { backgroundColor: glass.surface, borderColor: glass.stroke }]}
        >
          <Text style={[styles.dial, { color: colors.text }]}>{selected.dial}</Text>
          <ChevronDown size={16} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
        <TextInput
          value={number}
          onChangeText={(v) => onChangeNumber(v.replace(/[^0-9]/g, ""))}
          placeholder={placeholder || "Phone number"}
          placeholderTextColor={colors.textFaint}
          keyboardType="phone-pad"
          style={[styles.numberInput, { color: colors.text, backgroundColor: glass.surface, borderColor: glass.stroke }]}
        />
      </View>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.modalWrap}>
          <View style={[styles.sheet, { backgroundColor: colors.bg, paddingBottom: insets.bottom + spacing.md, paddingTop: insets.top + spacing.sm }]}>
            <View style={styles.sheetHead}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Select country</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10}><X size={22} color={colors.textMuted} /></Pressable>
            </View>
            <View style={[styles.searchRow, { backgroundColor: glass.surface, borderColor: glass.stroke }]}>
              <Search size={18} color={colors.textMuted} strokeWidth={2} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search country or code"
                placeholderTextColor={colors.textFaint}
                style={[styles.searchInput, { color: colors.text }]}
                autoFocus
              />
            </View>
            <FlatList
              data={filtered}
              keyExtractor={(c) => c.code}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: spacing.lg }}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => { onChangeDial(item.dial); setOpen(false); setQuery(""); }}
                  style={[styles.countryRow, { borderBottomColor: glass.stroke }]}
                >
                  <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                  <Text style={[styles.rowDial, { color: colors.textMuted }]}>{item.dial}</Text>
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm },
  codeBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 48, borderRadius: radius.md, borderWidth: 1 },
  flag: { fontSize: 18 },
  dial: { fontSize: 15, fontWeight: "700" },
  numberInput: { flex: 1, height: 48, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 14, fontSize: 15 },
  modalWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { height: "82%", borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: spacing.lg },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  sheetTitle: { fontSize: 18, fontWeight: "800" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, height: 44, borderRadius: radius.md, borderWidth: 1, marginBottom: spacing.sm },
  searchInput: { flex: 1, fontSize: 15 },
  countryRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  rowFlag: { fontSize: 20, width: 30 },
  rowName: { flex: 1, fontSize: 15, fontWeight: "600" },
  rowDial: { fontSize: 14, fontWeight: "600" },
});
