// Floating pill tab bar with centered gradient + (flag-a-risk). Theme-aware.
// Icons are Lucide components (not glyph strings) to avoid Android tofu.
import { View, Text, Pressable, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Home, Inbox, FileCheck, CircleUser } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { useTheme } from "../theme/ThemeProvider";

const ICONS: Record<string, LucideIcon> = {
  Home: Home, Inbox: Inbox, Reports: FileCheck, Profile: CircleUser,
};

export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors, glass, glow, gradients, mode } = useTheme();
  const activeName = state.routes[state.index]?.name;
  const go = (name: string) => {
    const route = state.routes.find((r) => r.name === name);
    if (!route) return;
    const isFocused = activeName === name;
    const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) navigation.navigate(name as never);
  };
  const Tab = ({ name }: { name: string }) => {
    const focused = activeName === name;
    const Icon = ICONS[name];
    return (
      <Pressable onPress={() => go(name)} style={styles.tab} hitSlop={8}>
        <Icon size={24} color={focused ? colors.accentOn : colors.textFaint} strokeWidth={focused ? 1.8 : 1.5} />
      </Pressable>
    );
  };
  const barBg = mode === "light" ? "rgba(255,255,255,0.96)" : "rgba(20,22,26,0.94)";
  return (
    <View style={[styles.wrap, { bottom: insets.bottom + 12 }]} pointerEvents="box-none">
      <View style={[styles.bar, { backgroundColor: barBg, borderColor: glass.stroke, boxShadow: glow.soft } as any]}>
        <Tab name="Home" />
        <Tab name="Inbox" />
        <View style={styles.fabSlot} />
        <Tab name="Reports" />
        <Tab name="Profile" />
      </View>
      <Pressable onPress={() => go("Map")} style={styles.fabPress}>
        <LinearGradient
          colors={gradients.brand}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[styles.fab, { borderColor: colors.bg, boxShadow: glow.brand } as any]}
        >
          <Text style={[styles.plus, { color: colors.accentText }]}>+</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 24, right: 24, alignItems: "center" },
  bar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    width: "100%", height: 64, borderRadius: 30, paddingHorizontal: 18, borderWidth: 1,
  },
  tab: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  fabSlot: { width: 60 },
  fabPress: { position: "absolute", alignSelf: "center", top: -22 },
  fab: { width: 62, height: 62, borderRadius: 31, alignItems: "center", justifyContent: "center", borderWidth: 4 },
  plus: { fontSize: 30, fontWeight: "800", marginTop: -2 },
});

