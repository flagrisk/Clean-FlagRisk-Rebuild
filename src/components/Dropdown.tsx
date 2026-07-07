// Glass dropdown (theme-aware). Optional colorMap shows coloured dots + tints.
import { useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing } from "../theme";

export type Option = { value: string; label: string };

export function Dropdown({
  placeholder, value, options, onSelect, colorMap,
}: {
  placeholder: string; value: string | null; options: Option[];
  onSelect: (value: string) => void; colorMap?: Record<string, string>;
}) {
  const { colors, glass, mode } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const selColor = selected && colorMap ? colorMap[selected.value] : undefined;
  const menuBg = mode === "light" ? "#ffffff" : "#121419";

  return (
    <>
      <Pressable style={[styles.field, { borderColor: selColor ? selColor + "66" : glass.stroke, backgroundColor: glass.surface }]} onPress={() => setOpen(true)}>
        <View style={styles.fieldLeft}>
          {selColor && <View style={[styles.dot, { backgroundColor: selColor, boxShadow: `0px 0px 8px ${selColor}` } as any]} />}
          <Text style={[styles.fieldText, { color: selColor ?? (selected ? colors.text : colors.textMuted), fontWeight: selColor ? "700" : "400" }]}>
            {selected ? selected.label : placeholder}
          </Text>
        </View>
        <Text style={[styles.chevron, { color: colors.textMuted }]}>⌄</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={[styles.sheet, { backgroundColor: menuBg, borderColor: glass.stroke }]}>
            <FlatList
              data={options}
              keyExtractor={(o) => o.value}
              renderItem={({ item }) => {
                const c = colorMap ? colorMap[item.value] : undefined;
                const active = item.value === value;
                return (
                  <Pressable style={styles.row} onPress={() => { onSelect(item.value); setOpen(false); }}>
                    {c && <View style={[styles.dot, { backgroundColor: c }]} />}
                    <Text style={[styles.rowText, { color: active ? (c ?? colors.accentOn) : colors.text, fontWeight: active ? "700" : "400" }]}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: { height: 58, borderRadius: radius.md, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md },
  fieldLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  fieldText: { fontSize: 16 },
  chevron: { fontSize: 18 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: spacing.lg },
  sheet: { borderRadius: radius.lg, borderWidth: 1, maxHeight: "70%", paddingVertical: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16, paddingHorizontal: spacing.lg },
  rowText: { fontSize: 16 },
});
