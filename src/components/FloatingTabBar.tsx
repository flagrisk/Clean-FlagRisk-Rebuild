// ============================================================================
// Bottom navigation - FlagRisk v2.1
// Built from Figma component set "Flagrisk Bottom Nav" (node 123:16728).
//   bar #F5F5F5, 63pt + safe area | items 56x40 | icons 20 | labels 10pt
//   active: ink icon + 600 label | inactive: #828282 icon + 400 label
//   centre: 48pt ink disc, raised, white plus
// Emphasis on light is weight and contrast, never colour. The centre disc is
// ink and not lime: lime is valid on ink only, never on a light surface.
// ============================================================================
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { House, Inbox, Files, CircleUserRound, Plus, Minus } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors, elevation } from "../theme";

const BAR_BG = "#F5F5F5";
const INACTIVE = "#828282";

const TABS: { name: string; label: string; Icon: LucideIcon }[] = [
  { name: "Home", label: "Home", Icon: House },
  { name: "Inbox", label: "Inbox", Icon: Inbox },
  { name: "Reports", label: "Report", Icon: Files },
  { name: "Profile", label: "Account", Icon: CircleUserRound },
];

export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const activeName = state.routes[state.index]?.name;
  const onMap = activeName === "Map";

  const go = (name: string) => {
    const route = state.routes.find((r) => r.name === name);
    if (!route) return;
    const isFocused = activeName === name;
    const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) navigation.navigate(name as never);
  };

  const Tab = ({ name, label, Icon }: { name: string; label: string; Icon: LucideIcon }) => {
    const focused = activeName === name;
    return (
      <Pressable onPress={() => go(name)} style={styles.tab} hitSlop={8}>
        <Icon size={20} color={focused ? colors.ink : INACTIVE} strokeWidth={focused ? 2.2 : 1.8} />
        <Text style={[styles.label, { fontWeight: focused ? "600" : "400" }]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.row}>
        <Tab {...TABS[0]} />
        <Tab {...TABS[1]} />
        <View style={styles.centreSlot} />
        <Tab {...TABS[2]} />
        <Tab {...TABS[3]} />
      </View>
      <Pressable
        onPress={() => (onMap ? navigation.goBack() : go("Map"))}
        style={styles.centrePress}
        hitSlop={10}
      >
        <View style={styles.centreDisc}>
          {onMap
            ? <Minus size={24} color="#FFFFFF" strokeWidth={2.6} />
            : <Plus size={24} color="#FFFFFF" strokeWidth={2.4} />}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    backgroundColor: BAR_BG, paddingTop: 11,
  },
  row: {
    flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between",
    paddingHorizontal: 25,
  },
  tab: { width: 56, height: 40, alignItems: "center", justifyContent: "flex-start", gap: 4 },
  label: { fontSize: 10, lineHeight: 14, color: colors.ink },
  centreSlot: { width: 56 },
  centrePress: { position: "absolute", alignSelf: "center", top: -13 },
  centreDisc: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.ink,
    alignItems: "center", justifyContent: "center", ...elevation.hairline,
  },
});
