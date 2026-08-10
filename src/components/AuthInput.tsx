// ============================================================================
// Auth input - FlagRisk v2.1
// Labelled field, 56pt, r8, #FAFAFA, ink border on focus. The password reveal
// is now an eye icon rather than the words Show and Hide, which a tester missed
// entirely and then hit repeated mismatch errors.
// ============================================================================
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Eye, EyeOff } from "lucide-react-native";
import { colors, radius, spacing, type } from "../theme";

type Props = {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  label?: string;
  icon?: string;
  secure?: boolean;
  keyboardType?: "default" | "email-address";
  autoCapitalize?: "none" | "words" | "sentences";
};

export function AuthInput({
  value, onChangeText, placeholder, label, secure,
  keyboardType = "default", autoCapitalize = "none",
}: Props) {
  const [hidden, setHidden] = useState(!!secure);
  const [focused, setFocused] = useState(false);
  return (
    <View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.wrap, focused && styles.wrapFocused]}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor="#9F9F9F"
          secureTextEntry={hidden}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
        />
        {secure ? (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={12}>
            {hidden
              ? <Eye size={19} color={colors.textMuted} strokeWidth={2} />
              : <EyeOff size={19} color={colors.ink} strokeWidth={2} />}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...type.label, fontWeight: "500", color: colors.ink, marginBottom: spacing.sm },
  wrap: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    height: 56, borderRadius: radius.sm, backgroundColor: "#FAFAFA",
    borderWidth: 1, borderColor: "#FAFAFA", paddingHorizontal: spacing.md,
  },
  wrapFocused: { borderColor: colors.ink, backgroundColor: colors.bg },
  input: { flex: 1, ...type.body, color: colors.ink, padding: 0 },
});
