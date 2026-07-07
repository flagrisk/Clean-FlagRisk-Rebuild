// ============================================================================
// Location intelligence helpers (grounded, no AI):
//   - bearing/direction between two points (pure math)
//   - reverse geocoding via OpenStreetMap Nominatim (FREE, no key)
// Nominatim usage policy: <=1 req/sec, must send a descriptive User-Agent.
// For production scale you'd host your own geocoder; fine for now.
// ============================================================================

export function compassDirection(fromLat: number, fromLng: number, toLat: number, toLng: number): string {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLng = toRad(toLng - fromLng);
  const y = Math.sin(dLng) * Math.cos(toRad(toLat));
  const x = Math.cos(toRad(fromLat)) * Math.sin(toRad(toLat)) -
            Math.sin(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.cos(dLng);
  let brng = (toDeg(Math.atan2(y, x)) + 360) % 360;
  const dirs = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
  return dirs[Math.round(brng / 45) % 8];
}

// Reverse geocode a point to a human place description. Returns a short label
// like "Wuse Market, Abuja" or null if unavailable. Never throws.
// Reverse geocode a point to a human place description. Tries our geocode Edge
// Function (LocationIQ, better data) first; falls back to free Nominatim if the
// function isn't configured or fails. Returns a short label or null. Never throws.
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  // 1) preferred: our Edge Function (LocationIQ, token server-side)
  try {
    const { supabase } = await import("./supabase");
    const { data: s } = await supabase.auth.getSession();
    const res = await fetch("https://aqgkntulbuqqqjxjafmw.supabase.co/functions/v1/geocode", {
      method: "POST",
      headers: { Authorization: `Bearer ${s.session?.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng }),
    });
    if (res.ok) {
      const j = await res.json();
      if (j.ok && j.label) return j.label as string;
    }
  } catch { /* fall through to Nominatim */ }

  // 2) fallback: free Nominatim
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const res = await fetch(url, { headers: { "User-Agent": "FlagRisk/1.0 (safety app)", "Accept": "application/json" } });
    if (!res.ok) return null;
    const j = await res.json();
    const a = j.address ?? {};
    const specific =
      (a.amenity || a.shop || a.building || a.office || a.leisure || a.tourism) ||
      (a.house_number && a.road ? `${a.house_number} ${a.road}` : null) ||
      a.road || a.pedestrian || a.footway;
    const area = a.neighbourhood || a.suburb || a.quarter || a.hamlet || a.village || a.town;
    const city = a.city || a.town || a.city_district || a.state_district;
    if (specific && area) return `${specific}, ${area}`;
    if (specific && city) return `${specific}, ${city}`;
    if (specific) return specific;
    if (area && city && area !== city) return `${area}, ${city}`;
    return area || city || (j.name || null) || (j.display_name?.split(",").slice(0, 2).join(",") ?? null);
  } catch {
    return null;
  }
}
