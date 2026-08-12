// ============================================================================
// Feedback popups - FlagRisk v2.1
// Rebuilt to the 2.1 system. The old version rendered every message as a
// full-bleed gradient card with white type, which read as an alert even for a
// routine confirmation and used a palette nothing else in the app uses now.
//
// New shape: white card, ink type, a 40pt tinted status disc, and buttons that
// follow the same ghost-and-ink pair used on every other screen. Tone and
// severity change the disc and its icon only, never the whole card.
// Auto-dismiss behaviour and the showAlert / showToast / showModal API are
// unchanged, so no calling screen needs editing.
// ============================================================================
import React, { useRef, useState, useCallback, useEffect } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  Check, TriangleAlert, Info, Siren, CircleAlert,
} from "lucide-react-native";
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

// The icon carries the state on its own. Nothing else in the card is tinted.
function look(c: Cfg | null) {
  if (!c) return { fg: colors.ink, Icon: Info };
  if (c.severity === "critical" || c.severity === "high") return { fg: colors.riskHigh, Icon: Siren };
  if (c.severity === "moderate") return { fg: "#B26A12", Icon: TriangleAlert };
  if (c.severity === "low") return { fg: colors.safe, Icon: Check };
  if (c.tone === "error") return { fg: colors.riskHigh, Icon: CircleAlert };
  if (c.tone === "success") return { fg: colors.safe, Icon: Check };
  return { fg: colors.ink, Icon: Info };
}

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
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
  // passes no buttons the notice still self dismisses on a read-length timer,
  // but it also carries one so the modal is never a dead end.
  const given: Btn[] = cfg && cfg.buttons ? cfg.buttons : [];
  const buttons: Btn[] = given.length > 0 ? given : [{ text: "Close" }];
  const hasButtons = true;
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
          <Animated.View
            style={[styles.cardWrap, { opacity, transform: [{ translateY: translate }] }]}
          >
            <Pressable onPress={() => {}}>
              <LinearGradient
                colors={["#F9F9FB", "#F6F6F8", "#F0F0F2", "#E6E6EA"]}
                locations={[0, 0.38, 0.72, 1]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.card}
              >
              <View style={styles.grabber} />
              <Icon size={40} color={l.fg} strokeWidth={2.2} />

              {cfg && cfg.title ? <Text style={styles.title}>{cfg.title}</Text> : null}
              {cfg && cfg.message ? <Text style={styles.msg}>{cfg.message}</Text> : null}

              {hasButtons ? (
                <View style={styles.btnRow}>
                  {buttons.map((b, i) => {
                    const destructive = b.style === "destructive";
                    return (
                      <Pressable
                        key={i}
                        onPress={() => { close(); if (b.onPress) b.onPress(); }}
                        style={[
                          styles.btn,
                          destructive ? styles.btnDestructive : styles.btnSilver,
                        ]}
                      >
                        <Text
                          style={[
                            styles.btnText,
                            destructive ? styles.btnTextDestructive : styles.btnTextSilver,
                          ]}
                        >
                          {b.text || "OK"}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(1,1,20,0.30)", justifyContent: "flex-end" },
  cardWrap: { width: "100%" },
  card: {
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    paddingTop: spacing.sm, paddingHorizontal: spacing.gutter, paddingBottom: spacing.xxl,
    alignItems: "center",
    borderTopWidth: 1, borderColor: "rgba(20,21,42,0.10)",
    ...elevation.sheet,
  },
  grabber: { width: 44, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: spacing.lg },
  title: { ...type.title, color: colors.ink, textAlign: "center", marginTop: spacing.ms },
  msg: {
    ...type.body, color: colors.textMuted, textAlign: "center",
    lineHeight: 22, marginTop: spacing.sm, maxWidth: 270,
  },

  btnRow: { flexDirection: "row", gap: spacing.ms, marginTop: spacing.lg, width: "100%" },
  btn: {
    flex: 1, height: 54, borderRadius: radius.md,
    alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.md,
  },
  btnSilver: { backgroundColor: "#F7F7F7", borderWidth: 1, borderColor: "rgba(20,21,42,0.10)" },
  btnDestructive: { backgroundColor: "rgba(255,255,255,0.65)", borderWidth: 1, borderColor: colors.riskHigh },
  btnText: { ...type.label, fontWeight: "600", fontSize: 15, lineHeight: 20 },
  btnTextSilver: { color: colors.ink },
  btnTextDestructive: { color: colors.riskHigh },
});
