// ============================================================================
// Risk category icons - FlagRisk v2.1
// One dedicated glyph per category. No two types share a mark, so a person can
// tell a flood from a fire without reading the label. Lucide only, never a
// Unicode glyph, which renders differently on every Android device.
// ============================================================================
import {
  UserRoundX, Bomb, Mountain, ShieldAlert, Flame, Zap,
  Waves, CloudLightning, Hammer, PawPrint, Megaphone, Car, TriangleAlert,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";

export const RISK_ICON: Record<string, LucideIcon> = {
  kidnapping: UserRoundX,
  terrorism: Bomb,
  earthquake: Mountain,
  robbery: ShieldAlert,
  fire_outbreak: Flame,
  electric_hazard: Zap,
  flood: Waves,
  storm: CloudLightning,
  vandalism: Hammer,
  animal_threat: PawPrint,
  protest: Megaphone,
  traffic_jam: Car,
};

export function riskIcon(categoryId: string | null | undefined): LucideIcon {
  return (categoryId && RISK_ICON[categoryId]) || TriangleAlert;
}
