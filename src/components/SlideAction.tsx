// ============================================================================
// Slide action - FlagRisk v2.1
// Extracted from the alarm screen so the manual trip check-in uses the same
// deliberate gesture. Travel lives in a ref because the PanResponder is built
// once and would otherwise close over a width of zero.
// ============================================================================
import { useEffect, useRef, useState } from "react";
import { Animated, PanResponder, StyleSheet, Text, View } from "react-native";
import { ChevronRight, Check } from "lucide-react-native";
import { colors, type } from "../theme";

const TRACK_H = 52;
const KNOB = 36;
const TRACK_PAD = 8;
const FIRE_AT = 0.85;

export function SlideAction({
  label, committedLabel, onCommit, disabled, autoReset = true, resetAfterMs = 1200,
}: {
  label: string;
  committedLabel: string;
  onCommit: () => void;
  disabled?: boolean;
  /** Return the control to its resting state after committing. A single action
   *  should not leave the knob parked at the far end forever. Pass false only
   *  where the screen itself changes state on commit. */
  autoReset?: boolean;
  resetAfterMs?: number;
}) {
  const [done, setDone] = useState(false);
  const [sliding, setSliding] = useState(false);
  const x = useRef(new Animated.Value(0)).current;
  const committed = useRef(false);
  const travelRef = useRef(0);
  const disabledRef = useRef(!!disabled);
  disabledRef.current = !!disabled;
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoResetRef = useRef(autoReset);
  autoResetRef.current = autoReset;
  const resetMsRef = useRef(resetAfterMs);
  resetMsRef.current = resetAfterMs;

  useEffect(() => () => { if (resetTimer.current) clearTimeout(resetTimer.current); }, []);

  // If this instance is reused for a different action, its committed state must
  // not carry over. A stale `committed` makes the pan responder return early and
  // the control stops working entirely, with no visible sign of it.
  useEffect(() => {
    if (resetTimer.current) { clearTimeout(resetTimer.current); resetTimer.current = null; }
    committed.current = false;
    setDone(false);
    setSliding(false);
    x.setValue(0);
  }, [label, onCommit]);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => setSliding(true),
      onPanResponderMove: (_e, g) => {
        if (disabledRef.current || committed.current) return;
        const t = travelRef.current;
        x.setValue(Math.max(0, Math.min(t, g.dx)));
      },
      onPanResponderRelease: (_e, g) => {
        setSliding(false);
        if (disabledRef.current || committed.current) return;
        const t = travelRef.current;
        const v = Math.max(0, Math.min(t, g.dx));
        if (t > 0 && v / t >= FIRE_AT) {
          committed.current = true;
          setDone(true);
          Animated.timing(x, { toValue: t, duration: 120, useNativeDriver: false }).start(() => {
            onCommit();
            if (!autoResetRef.current) return;
            resetTimer.current = setTimeout(() => {
              Animated.timing(x, { toValue: 0, duration: 220, useNativeDriver: false }).start(() => {
                committed.current = false;
                setDone(false);
              });
            }, resetMsRef.current);
          });
        } else {
          Animated.spring(x, { toValue: 0, useNativeDriver: false, bounciness: 6 }).start();
        }
      },
      onPanResponderTerminate: () => {
        setSliding(false);
        Animated.spring(x, { toValue: 0, useNativeDriver: false, bounciness: 6 }).start();
      },
    })
  ).current;

  return (
    <View
      style={[styles.track, disabled && { opacity: 0.5 }]}
      onLayout={(e) => {
        travelRef.current = Math.max(0, e.nativeEvent.layout.width - KNOB - TRACK_PAD * 2);
      }}
    >
      <Text style={styles.label} numberOfLines={1}>
        {done ? committedLabel : sliding ? "Keep sliding" : label}
      </Text>
      <Animated.View style={[styles.knob, { transform: [{ translateX: x }] }]} {...responder.panHandlers}>
        {done
          ? <Check size={19} color={colors.ink} strokeWidth={3} />
          : <ChevronRight size={19} color={colors.ink} strokeWidth={3} />}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Every slide is ink with a lime knob. One dark, one lime, no exceptions.
  track: {
    height: TRACK_H, borderRadius: 64, backgroundColor: colors.ink,
    justifyContent: "center", paddingHorizontal: TRACK_PAD,
  },
  label: {
    position: "absolute", left: 0, right: 0, textAlign: "center",
    ...type.label, fontWeight: "600", color: "#FFFFFF",
  },
  knob: {
    width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: colors.accent,
    alignItems: "center", justifyContent: "center",
  },
});
