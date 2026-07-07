// Auth input (theme-aware). Rounded box, optional right glyph, show/hide for pwd.
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

type Props = {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  icon?: string;
  secure?: boolean;
  keyboardType?: "default" | "email-address";
  autoCapitalize?: "none" | "words" | "sentences";
};

export function AuthInput({
  value, onChangeText, placeholder, icon, secure, keyboardType = "default", autoCapitalize = "none",
}: Props) {
  const { colors, glass } = useTheme();
  const [hidden, setHidden] = useState(!!secure);
  return (
    <View style={[styles.wrap, { borderColor: glass.stroke, backgroundColor: glass.surface }]}>
      <TextInput
        style={[styles.input, { color: colors.text }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        secureTextEntry={hidden}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
      />
      {secure ? (
        <Pressable onPress={() => setHidden((h) => !h)} hitSlop={12}>
          <Text style={[styles.icon, { color: colors.textMuted }]}>{hidden ? "Show" : "Hide"}</Text>
        </Pressable>
      ) : icon ? (
        <Text style={[styles.icon, { color: colors.textMuted }]}>{icon}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, height: 60 },
  input: { flex: 1, fontSize: 16 },
  icon: { fontSize: 14, fontWeight: "600", marginLeft: 8 },
});
