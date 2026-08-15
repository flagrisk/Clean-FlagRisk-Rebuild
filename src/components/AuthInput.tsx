// ============================================================================
// Auth input - FlagRisk v2.1
//
// Design C. A leading icon, no label above, and the placeholder carrying the
// name of the field. That is the pattern in all four references and it halves
// the vertical space a form takes, which is why Create Account now fits without
// scrolling.
//
// On Parchment the field is warm white with a warm edge, so it belongs to the
// card rather than looking pasted onto it. Focus turns the edge Indigo and
// lifts the fill to pure white.
// ============================================================================
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Eye, EyeOff, Lock, Mail, Phone, User, KeyRound } from "lucide-react-native";
import { colors, type } from "../theme";

type IconName = "phone" | "mail" | "lock" | "user" | "key";

const ICONS = { phone: Phone, mail: Mail, lock: Lock, user: User, key: KeyRound };

type Props = {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  label?: string;
  icon?: IconName;
  secure?: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad" | "number-pad";
  autoCapitalize?: "none" | "words" | "sentences";
};

export function AuthInput({
  value, onChangeText, placeholder, label, icon, secure,
  keyboardType = "default", autoCapitalize = "none",
}: Props) {
  const [hidden, setHidden] = useState(!!secure);
  const [focused, setFocused] = useState(false);

  // The icon is inferred from the field when one is not named, so no call site
  // has to be changed for the common cases.
  const guess: IconName =
    icon ??
    (secure ? "lock"
      : keyboardType === "phone-pad" ? "phone"
      : keyboardType === "email-address" ? "mail"
      : keyboardType === "number-pad" ? "key"
      : "user");
  const Icon = ICONS[guess];
  const active = focused || value.length > 0;

  return (
    <View style={[styles.wrap, focused && styles.wrapFocused]}>
      <Icon size={18} color={active ? colors.ink : "#A9AEB6"} strokeWidth={1.9} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        // The label is the placeholder. Both would repeat the same word twice
        // and cost 27pt a field.
        placeholder={label ?? placeholder}
        placeholderTextColor="#A9AEB6"
        secureTextEntry={hidden}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
      />
      {secure ? (
        <Pressable onPress={() => setHidden((h) => !h)} hitSlop={12}>
          {hidden
            ? <Eye size={18} color="#A9AEB6" strokeWidth={1.9} />
            : <EyeOff size={18} color={colors.ink} strokeWidth={1.9} />}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row", alignItems: "center", gap: 11,
    height: 52, borderRadius: 13, marginTop: 13,
    paddingHorizontal: 15,
    backgroundColor: "#FBF9F5",
    borderWidth: 1, borderColor: "#E7E1D5",
  },
  // Border and fill only. A shadow here carried elevation, and on Android an
  // elevation change re-orders the view and forces the parent to re-layout.
  // Inside a ScrollView under KeyboardAvoidingView that re-layout bounced the
  // focus, which set elevation again, and the screen flickered without stopping
  // the moment any field was tapped.
  wrapFocused: {
    borderColor: "#1B1E3D", backgroundColor: colors.bg,
  },
  input: { flex: 1, fontSize: 14, lineHeight: 19, color: colors.ink, padding: 0 },
});

