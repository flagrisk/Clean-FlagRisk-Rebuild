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

function look(c: Cfg | null) {
  if (!c) return { fg: colors.ink, bg: "#F0F0F0", Icon: Info };
  if (c.severity === "critical" || c.severity === "high") {
    return { fg: colors.riskHigh, bg: "#FBD1CF", Icon: Siren };
  }
  if (c.severity === "moderate") return { fg: "#B26A12", bg: "#FDE7CF", Icon: TriangleAlert };
  if (c.severity === "low") return { fg: "#1C9D6B", bg: "#D2F0E3", Icon: Check };
  if (c.tone === "error") return { fg: colors.riskHigh, bg: "#FBD1CF", Icon: CircleAlert };
  if (c.tone === "success") return { fg: "#1C9D6B", bg: "#D2F0E3", Icon: Check };
  return { fg: colors.ink, bg: "#F0F0F0", Icon: Info };
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

  const buttons: Btn[] = cfg && cfg.buttons ? cfg.buttons : [];
  const hasButtons = buttons.length > 0;
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
            <Pressable style={styles.card} onPress={() => {}}>
              <View style={[styles.disc, { backgroundColor: l.bg }]}>
                <Icon size={20} color={l.fg} strokeWidth={2.2} />
              </View>

              {cfg && cfg.title ? <Text style={styles.title}>{cfg.title}</Text> : null}
              {cfg && cfg.message ? <Text style={styles.msg}>{cfg.message}</Text> : null}

              {hasButtons ? (
                <View style={styles.btnRow}>
                  {buttons.map((b, i) => {
                    const cancel = b.style === "cancel";
                    const destructive = b.style === "destructive";
                    return (
                      <Pressable
                        key={i}
                        onPress={() => { close(); if (b.onPress) b.onPress(); }}
                        style={[
                          styles.btn,
                          cancel ? styles.btnGhost : destructive ? styles.btnDestructive : styles.btnSolid,
                        ]}
                      >
                        <Text
                          style={[
                            styles.btnText,
                            cancel ? styles.btnTextGhost : destructive ? styles.btnTextDestructive : styles.btnTextSolid,
                          ]}
                        >
                          {b.text || "OK"}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: "rgba(1,1,20,0.30)",
    alignItems: "center", justifyContent: "flex-end", padding: spacing.gutter,
  },
  cardWrap: { width: "100%", maxWidth: 420, alignSelf: "center", marginBottom: spacing.xl },
  card: {
    backgroundColor: colors.bg, borderRadius: radius.lg,
    paddingVertical: spacing.lg, paddingHorizontal: spacing.lg, ...elevation.sheet,
  },
  disc: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.ms,
  },
  title: { ...type.subheading, color: colors.ink },
  msg: { ...type.label, fontWeight: "400", color: colors.textMuted, lineHeight: 20, marginTop: 6 },

  btnRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  btn: { flex: 1, height: 48, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.md },
  btnSolid: { backgroundColor: colors.ink },
  btnGhost: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  btnDestructive: { backgroundColor: colors.riskHigh },
  btnText: { ...type.label, fontWeight: "600" },
  btnTextSolid: { color: colors.accent },
  btnTextGhost: { color: colors.ink },
  btnTextDestructive: { color: "#FFFFFF" },
});
