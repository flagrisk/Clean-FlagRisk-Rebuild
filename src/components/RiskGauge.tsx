// ============================================================================
// Risk dial - FlagRisk v2.1
// Corrected against Figma "2.0 Risk Score Drawup": the dial is a SEMICIRCLE,
// not the 250 degree ring previously built. Thin radiating ticks, filled to the
// score in the band colour, unfilled ticks in a track dark enough to read on a
// tinted card. Numeral centred inside the arc, band word and one line below it.
// ============================================================================
import { View, Text, StyleSheet } from "react-native";
import Svg, { Line } from "react-native-svg";
import { colors, type } from "../theme";

const TICKS = 34;
const START = 270;   // degrees, 0 = 12 o'clock, clockwise. 270 = 9 o'clock.
const SWEEP = 180;   // a clean semicircle, opening downward
const INNER = 0.80;
const TRACK = "#B7BDC2";   // darkened: #E0E0E0 vanished against the card tint

function point(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export function RiskGauge({
  score, size = 220, showLabel = true, onTile = false,
}: {
  score: number; size?: number; showLabel?: boolean; onTile?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, score));
  const band =
    clamped >= 70 ? colors.riskHigh : clamped >= 40 ? colors.riskMedium : colors.riskLow;
  const label = clamped >= 70 ? "High" : clamped >= 40 ? "Medium" : "Low";

  const active = onTile ? "#FFFFFF" : band;
  const track = onTile ? "rgba(255,255,255,0.45)" : TRACK;
  const numColor = onTile ? "#FFFFFF" : colors.ink;

  const vb = 200;
  const cx = 100;
  const cy = 108;      // arc sits high in the box, numeral fills beneath it
  const outer = 92;
  const inner = outer * INNER;

  const filled = Math.round((clamped / 100) * TICKS);
  const ticks = [];
  for (let i = 0; i < TICKS; i++) {
    const deg = START + (i / (TICKS - 1)) * SWEEP;
    const a = point(cx, cy, inner, deg);
    const b = point(cx, cy, outer, deg);
    ticks.push(
      <Line
        key={i}
        x1={a.x} y1={a.y} x2={b.x} y2={b.y}
        stroke={i < filled ? active : track}
        strokeWidth={3.2}
        strokeLinecap="round"
      />
    );
  }

  const h = Math.round(size * 0.62);

  return (
    <View style={{ width: size, alignItems: "center" }}>
      <View style={{ width: size, height: h, overflow: "hidden" }}>
        <Svg width={size} height={size} viewBox={"0 0 " + vb + " " + vb}>{ticks}</Svg>
      </View>
      <View style={styles.readout}>
        <Text style={[styles.score, { color: numColor }]}>{Math.round(clamped)}</Text>
        {showLabel ? (
          <Text style={[styles.band, { color: onTile ? "#FFFFFF" : colors.ink }]}>{label}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  readout: { alignItems: "center", marginTop: -Math.round(0) },
  score: { ...type.score, marginTop: -58 },
  band: { ...type.subheading, marginTop: 2 },
});
