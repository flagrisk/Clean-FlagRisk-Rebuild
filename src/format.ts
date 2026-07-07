// Formatting helpers to keep raw database values out of the UI.

// Turn a snake_case or slug value into a human Title Case label.
// e.g. "fire_outbreak" -> "Fire Outbreak", "in_app" -> "In-app"
export function humanize(value: string | null | undefined): string {
  if (!value) return "-";
  // Known special cases first (nicer than plain title-casing).
  const special: Record<string, string> = {
    in_app: "In-app",
    push: "Push",
    sms: "SMS",
    ussd: "USSD",
  };
  if (special[value]) return special[value];
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

// Turn a 0..1 risk score into a human band.
// Tune thresholds here in one place.
export function scoreBand(score: number | null | undefined): { label: string; tone: "low" | "medium" | "high" } {
  if (score == null) return { label: "-", tone: "low" };
  if (score < 0.34) return { label: "Low", tone: "low" };
  if (score < 0.67) return { label: "Medium", tone: "medium" };
  return { label: "High", tone: "high" };
}
