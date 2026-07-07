// Glowing icon chip. Takes a Lucide icon component (corruption-proof, no glyph chars).
import { View } from "react-native";

function rgba(hex: string, a: number) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

type Props = { color: string; icon?: React.ComponentType<any>; size?: number };

export function GlowChip({ color, icon: Icon, size = 34 }: Props) {
  const box = {
    width: size, height: size, borderRadius: size * 0.32,
    alignItems: "center" as const, justifyContent: "center" as const, flexShrink: 0,
    backgroundColor: rgba(color, 0.14),
    borderWidth: 1, borderColor: rgba(color, 0.25),
    boxShadow: `0px 0px 10px ${rgba(color, 0.40)}`,
  } as any;
  return (
    <View style={box}>
      {Icon ? <Icon size={size * 0.5} color={color} strokeWidth={2} /> : null}
    </View>
  );
}
