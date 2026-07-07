// Branded feedback: ONE gradient card for everything. Tone/severity sets the
// gradient; buttons render as legible chips on it. Auto-dismisses when no buttons.
import React, { useRef, useState, useCallback, useEffect } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, View, Easing } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../theme/ThemeProvider";

let _alert = null;
export function showAlert(cfg) { if (_alert) _alert(cfg || {}); }
export function showToast(message, opts) { showAlert({ message, tone: (opts && opts.tone) || "success" }); }
export function showModal(cfg) { showAlert(cfg || {}); }

export function FeedbackProvider({ children }) {
  const t = useTheme();
  const [cfg, setCfg] = useState(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  const timer = useRef(null);

  const close = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 0.92, duration: 160, useNativeDriver: true }),
    ]).start(() => setCfg(null));
  }, [opacity, scale]);

  const open = useCallback((c) => {
    if (timer.current) clearTimeout(timer.current);
    setCfg(c);
    opacity.setValue(0); scale.setValue(0.92);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 240, easing: Easing.out(Easing.back(1.3)), useNativeDriver: true }),
    ]).start();
    const hasButtons = c.buttons && c.buttons.length > 0;
    if (!hasButtons) {
      const words = ((c.title || "") + " " + (c.message || "")).trim().split(/\s+/).length;
      const readMs = Math.min(12000, Math.max(6000, words * 450));
      timer.current = setTimeout(close, c.duration || readMs);
    }
  }, [opacity, scale, close]);

  useEffect(() => { _alert = open; return () => { _alert = null; }; }, [open]);

  const g = t.gradients || {};
  function gradientFor(c) {
    if (!c) return g.brand || ["#c6f24e", "#2bd6a8"];
    if (c.severity === "critical" || c.severity === "high") return g.heroHigh || ["#e5484d", "#ff8a3d"];
    if (c.severity === "moderate") return g.heroMedium || ["#c77700", "#e0a64d"];
    if (c.severity === "low") return g.heroLow || ["#3b6d11", "#8fb04b"];
    if (c.tone === "error") return g.heroHigh || ["#e5484d", "#ff8a3d"];
    return g.brand || ["#c6f24e", "#2bd6a8"];
  }

  const hasButtons = cfg && cfg.buttons && cfg.buttons.length > 0;
  const buttons = hasButtons ? cfg.buttons : [];
  const s = styles(t);
  const grad = gradientFor(cfg);

  return (
    <View style={{ flex: 1 }}>
      {children}
      <Modal visible={!!cfg} transparent animationType="none" statusBarTranslucent onRequestClose={close}>
        <Pressable style={s.backdrop} onPress={() => { if (!cfg || cfg.dismissable !== false) close(); }}>
          <Animated.View style={[s.cardWrap, { opacity, transform: [{ scale }] }]}>
            <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.card}>
              <LinearGradient colors={["rgba(0,0,0,0.32)", "rgba(0,0,0,0.10)"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={s.scrim} pointerEvents="none" />
              {cfg && cfg.title ? <Text style={s.title}>{cfg.title}</Text> : null}
              {cfg && cfg.message ? <Text style={s.msg}>{cfg.message}</Text> : null}
              {hasButtons ? (
                <View style={s.btnRow}>
                  {buttons.map((b, i) => {
                    const cancel = b.style === "cancel";
                    const destructive = b.style === "destructive";
                    return (
                      <Pressable key={i} onPress={() => { close(); if (b.onPress) b.onPress(); }}
                        style={[s.chip, cancel ? s.chipGhost : s.chipSolid]}>
                        <Text style={[s.chipText, cancel ? s.chipTextGhost : s.chipTextSolid]}>{b.text || "OK"}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </LinearGradient>
          </Animated.View>
        </Pressable>
      </Modal>
    </View>
  );
}

function styles(t) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: 28 },
    cardWrap: { width: "100%", maxWidth: 420, alignSelf: "center" },
    scrim: { ...StyleSheet.absoluteFillObject, borderRadius: (t.radius && t.radius.xl) || 24 },
    card: { borderRadius: (t.radius && t.radius.xl) || 24, paddingVertical: 24, paddingHorizontal: 22, overflow: "hidden", boxShadow: "0px 0px 3px 2px rgba(20,25,40,0.18), 0px 14px 34px rgba(40,50,80,0.28)" },
    title: { fontSize: 19, fontWeight: "800", color: "#ffffff", marginBottom: 8, letterSpacing: -0.3 },
    msg: { fontSize: 15, lineHeight: 22, fontWeight: "600", color: "rgba(255,255,255,0.95)" },
    btnRow: { flexDirection: "row", justifyContent: "flex-end", gap: 10, flexWrap: "wrap", marginTop: 20 },
    chip: { paddingVertical: 11, paddingHorizontal: 20, borderRadius: (t.radius && t.radius.md) || 12 },
    chipSolid: { backgroundColor: "#ffffff" },
    chipGhost: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.7)" },
    chipDestructive: { backgroundColor: "#e5484d" },
    chipTextDestructive: { color: "#ffffff" },
    chipText: { fontSize: 15, fontWeight: "800" },
    chipTextSolid: { color: "#14171c" },
    chipTextGhost: { color: "#ffffff" },
  });
}
