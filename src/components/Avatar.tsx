// One avatar, used everywhere people are shown. Renders the profile picture when
// present; otherwise the coloured initials fallback (identical to the old look).
import { Image, Text, View, StyleSheet } from "react-native";

const AVATAR_COLORS = ["#e0457b", "#3ec46a", "#5b6cf0", "#e0a045", "#9c45e0"];
function avatarColor(id) { let h = 0; for (const c of (id || "")) h = (h + c.charCodeAt(0)) % AVATAR_COLORS.length; return AVATAR_COLORS[h]; }
function initials(name) { if (!name) return "?"; return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase(); }

export function Avatar({ uri, name, id, size = 36 }) {
  const dim = { width: size, height: size, borderRadius: size / 2 };
  if (uri) {
    return <Image source={{ uri }} style={[dim, { backgroundColor: "#00000010" }]} />;
  }
  return (
    <View style={[dim, styles.fallback, { backgroundColor: avatarColor(id || name) }]}>
      <Text style={[styles.txt, { fontSize: Math.round(size * 0.38) }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: "center", justifyContent: "center" },
  txt: { color: "#fff", fontWeight: "800" },
});
