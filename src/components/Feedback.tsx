// ============================================================================
// Feedback popups - FlagRisk v2.1
//
// Rebuilt again, for two faults rather than a taste. Every button rendered
// silver, so on a two button question the committing action looked identical to
// the dismissal and nothing told you which was which. And the icon sat at 40pt
// with nothing behind it, which read as unfinished.
//
// New shape: white sheet, the icon in a tinted disc on the same line as the
// title, message beneath, and the LAST button styled as the primary because
// that is the one the caller means. Left aligned, which reads faster than
// centred and takes about 40pt less height.
//
// The card was a silver gradient, which suited white auth screens and now sits
// badly against Parchment. Plain white works on both.
//
// The showAlert, showToast and showModal API is unchanged, so no calling screen
// needs editing.
// ============================================================================
import React, { useRef, useState, useCallback, useEffect } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Check, TriangleAlert, Info, Siren, CircleAlert } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, type, elevation } from "../theme";

type Btn = { text?: string; style?: "cancel" | "destructive" | "default"; onPress?: () => void };
type Cfg = {
  title?: string; message?: string; tone?: "success" | "error" | "info";
  severity?: "low" | "moderate" | "high" | "critical";
  buttons?: Btn[]; dismissable?: boolean; duration?: number;
};

let _alert: ((c: Cfg) => void) | null = null;
export function showAlert(cfg?: Cfg) { if (_alert) _alert(cfg || {}); }
export function showToast(message: string, opts?: { tone?: Cfg["tone"] }) {
  showAlert({ message, tone: (opts && opts.tone) || "success" });
}
export function showModal(cfg?: Cfg) { showAlert(cfg || {}); }

// The disc carries the state. Nothing else in the card is tinted, so a routine
// confirmation never reads as an alarm.
function look(c: Cfg | null) {
  if (!c) return { fg: colors.ink, bg: "#E7E9F2", Icon: Info };
  if (c.severity === "critical" || c.severity === "high") return { fg: colors.riskHigh, bg: "#FBE3E3", Icon: Siren };
  if (c.severity === "moderate") return { fg: "#B26A12", bg: "#FBEDDC", Icon: TriangleAlert };
  if (c.severity === "low") return { fg: colors.safe, bg: "#DFF1E8", Icon: Check };
  if (c.tone === "error") return { fg: colors.riskHigh, bg: "#FBE3E3", Icon: CircleAlert };
  if (c.tone === "success") return { fg: colors.safe, bg: "#DFF1E8", Icon: Check };
  return { fg: "#1B1E3D", bg: "#E7E9F2", Icon: Info };
}

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(18)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(translate, { toValue: 18, duration: 150, useNativeDriver: true }),
    ]).start(() => setCfg(null));
  }, [opacity, translate]);

  const open = useCallback((c: Cfg) => {
    if (timer.current) clearTimeout(timer.current);
    setCfg(c);
    opacity.setValue(0); translate.setValue(18);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(translate, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    const hasButtons = !!(c.buttons && c.buttons.length > 0);
    if (!hasButtons) {
      const words = ((c.title || "") + " " + (c.message || "")).trim().split(/\s+/).length;
      const readMs = Math.min(12000, Math.max(6000, words * 450));
      timer.current = setTimeout(close, c.duration || readMs);
    }
  }, [opacity, translate, close]);

  useEffect(() => { _alert = open; return () => { _alert = null; }; }, [open]);

  // A sheet this size should never appear without a way out. When a caller
  // passes no buttons the notice still self dismisses on a read length timer,
  // but it also carries one so the modal is never a dead end.
  const given: Btn[] = cfg && cfg.buttons ? cfg.buttons : [];
  const buttons: Btn[] = given.length > 0 ? given : [{ text: "Close" }];

  const l = look(cfg);
  const Icon = l.Icon;

  return (
    <View style={{ flex: 1 }}>
      {children}
      <Modal visible={!!cfg} transparent animationType="none" statusBarTranslucent onRequestClose={close}>
        <Pressable
          style={styles.backdrop}
          onPress={() => { if (!cfg || cfg.dismissable !== false) close(); }}
        >
          <Animated.View style={[styles.cardWrap, { opacity, transform: [{ translateY: translate }] }]}>
            {/* The sheet sits at the very bottom of the screen, so without the
                inset the buttons land under the gesture bar. */}
            <Pressable onPress={() => {}} style={[styles.card, { paddingBottom: insets.bottom + 20 }]}>
              <View style={styles.grabber} />

              <View style={styles.head}>
                <View style={[styles.disc, { backgroundColor: l.bg }]}>
                  <Icon size={22} color={l.fg} strokeWidth={2.1} />
                </View>
                {cfg && cfg.title ? <Text style={styles.title}>{cfg.title}</Text> : null}
              </View>

              {cfg && cfg.message ? <Text style={styles.msg}>{cfg.message}</Text> : null}

              <View style={styles.btnRow}>
                {buttons.map((b, i) => {
                  const destructive = b.style === "destructive";
                  // The last button is the one the caller means, so it takes the
                  // primary. A single button is therefore primary too, which is
                  // right: there is nothing to weigh it against.
                  const primary = !destructive && i === buttons.length - 1;
                  return (
                    <Pressable
                      key={i}
                      onPress={() => { close(); if (b.onPress) b.onPress(); }}
                      style={[
                        styles.btn,
                        destructive ? styles.btnDestructive : primary ? styles.btnPrimary : styles.btnSilver,
                      ]}
                    >
                      <Text
                        style={[
                          styles.btnText,
                          destructive ? styles.btnTextDestructive : primary ? styles.btnTextPrimary : styles.btnTextSilver,
                        ]}
                        numberOfLines={1}
                      >
                        {b.text || "OK"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(1,1,20,0.34)", justifyContent: "flex-end" },
  cardWrap: { width: "100%" },
  card: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    paddingTop: 12, paddingHorizontal: 22, paddingBottom: spacing.xl,
    borderTopWidth: 1, borderColor: "rgba(20,21,42,0.10)",
    ...elevation.sheet,
  },
  grabber: {
    width: 44, height: 4, borderRadius: 2,
    backgroundColor: colors.borderStrong, alignSelf: "center", marginBottom: 16,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 13 },
  disc: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 19, lineHeight: 25, fontWeight: "700", color: colors.ink },
  msg: { fontSize: 14, lineHeight: 21, color: colors.textMuted, marginTop: 12 },

  btnRow: { flexDirection: "row", gap: 11, marginTop: 20 },
  btn: {
    flex: 1, height: 52, borderRadius: 13,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 12,
  },
  btnSilver: { backgroundColor: "#F1F0EC", borderWidth: 1, borderColor: "rgba(20,21,42,0.10)" },
  btnPrimary: { backgroundColor: "#1B1E3D" },
  btnDestructive: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.riskHigh },
  btnText: { fontSize: 14, lineHeight: 19, fontWeight: "600" },
  btnTextSilver: { color: colors.ink },
  btnTextPrimary: { color: colors.accent },
  btnTextDestructive: { color: colors.riskHigh },
});

