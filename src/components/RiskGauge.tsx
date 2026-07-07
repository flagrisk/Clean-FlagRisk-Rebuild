// SVG risk gauge. Band colours stay semantic normally; on a coloured tile
// (light mode) it renders white/translucent to read cleanly on the gradient.
import { View, Text, StyleSheet } from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg";
import { useTheme } from "../theme/ThemeProvider";

function polar(cx: number, cy: number, r: number, a: number) {
  const rad = ((a - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function arc(cx: number, cy: number, r: number, start: number, end: number) {
  const s = polar(cx, cy, r, end);
  const e = polar(cx, cy, r, start);
  const large = end - start <= 180 ? 0 : 1;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y}`;
}

export function RiskGauge({ score, size = 145, onTile = false }: { score: number; size?: number; onTile?: boolean }) {
  const { colors, mode } = useTheme();
  const clamped = Math.max(0, Math.min(100, score));
  const color = clamped >= 70 ? colors.riskHigh : clamped >= 40 ? colors.riskMedium : colors.riskLow;
  const label = clamped >= 70 ? "High Risk" : clamped >= 40 ? "Medium Risk" : "Low Risk";
  const track = onTile ? "rgba(255,255,255,0.30)" : mode === "light" ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)";
  const progressColor = onTile ? "#ffffff" : color;
  const numColor = onTile ? "#ffffff" : colors.text;
  const labelColor = onTile ? "rgba(255,255,255,0.9)" : color;
  const vb = 160;
  const cx = 80, cy = 80, r = 56, stroke = 11;
  const START = 225, SWEEP = 270;
  const end = START + (clamped / 100) * SWEEP;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`}>
        <Defs>
          <LinearGradient id="gauge" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.accentSecondary} />
            <Stop offset="1" stopColor={colors.accent} />
          </LinearGradient>
        </Defs>
        <Path d={arc(cx, cy, r, START, START + SWEEP)} stroke={track}
          strokeWidth={stroke} strokeLinecap="round" fill="none" />
        {clamped > 0 && !onTile && (
          <Path d={arc(cx, cy, r, START, end)} stroke={color} strokeWidth={stroke + 6}
            strokeLinecap="round" fill="none" opacity={0.16} />
        )}
        {clamped > 0 && (
          <Path d={arc(cx, cy, r, START, end)} stroke={onTile ? "#ffffff" : "url(#gauge)"} strokeWidth={stroke}
            strokeLinecap="round" fill="none" />
        )}
      </Svg>
      <View style={styles.center}>
        <Text style={[styles.score, { color: numColor }]}>{Math.round(clamped)}</Text>
        <Text numberOfLines={1} style={[styles.label, { color: labelColor }]}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { position: "absolute", alignItems: "center" },
  score: { fontSize: 38, fontWeight: "800", lineHeight: 42 },
  label: { fontSize: 9, fontWeight: "600", marginTop: 2 },
});





