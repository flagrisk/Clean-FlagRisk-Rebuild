// Background task for Trip Watch. Registered at module load (imported early in
// App). Fires on OS-scheduled location updates while a trip is active, even when
// the app is closed. Sends check-ins on the chosen interval and ends the trip on
// arrival or when the planned duration elapses.
//
// Runs OUTSIDE React (no hooks/state). Reuses the persisted Supabase session
// (AsyncStorage) so the RPC calls authenticate as the user.
import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import * as Battery from "expo-battery";
import * as Network from "expo-network";
import { supabase } from "../../lib/supabase";
import { enqueueCheckIn, flushCheckIns, getLocalLastCheckIn, setLocalLastCheckIn, getBeaconSent, setBeaconSent } from "./tripCheckInQueue";

export const TRIP_TASK = "flagrisk-trip-watch";

function metres(aLat, aLng, bLat, bLng) {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(s));
}

async function readDeviceState(): Promise<{ battery: number | null; signal: string | null; conn: string | null }> {
  let battery: number | null = null;
  let signal: string | null = null;
  let conn: string | null = null;
  try {
    const lvl = await Battery.getBatteryLevelAsync(); // 0..1, -1 if unknown
    if (typeof lvl === "number" && lvl >= 0) battery = Math.round(lvl * 100);
  } catch (_e) {}
  try {
    const state = await Network.getNetworkStateAsync();
    const ty = state?.type ? String(state.type).toLowerCase() : null;
    // Normalise Expo's NetworkStateType to our coarse buckets.
    if (!state?.isConnected) { conn = "none"; signal = "none"; }
    else if (ty && ty.includes("wifi")) { conn = "wifi"; signal = "strong"; }
    else if (ty && ty.includes("cellular")) { conn = "cellular"; signal = "strong"; }
    else { conn = state?.isConnected ? "other" : "none"; signal = state?.isConnected ? "strong" : "none"; }
  } catch (_e) {}
  return { battery, signal, conn };
}

TaskManager.defineTask(TRIP_TASK, async ({ data, error }) => {
  if (error) return;
  const locs = data && data.locations;
  if (!locs || locs.length === 0) return;
  const pos = locs[locs.length - 1];
  const lat = pos.coords.latitude;
  const lng = pos.coords.longitude;
  // The GPS fix carries its own timestamp: the true moment the position was taken,
  // which is more accurate than the moment the task processes it (which may be late).
  const fixAt = pos.timestamp ? new Date(pos.timestamp) : new Date();

  try {
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) return;

    const { data: trips } = await supabase
      .from("trips")
      .select("id, interval_minutes, last_check_in_at, planned_end_at, destination_lat, destination_lng, arrival_radius_m")
      .eq("user_id", uid)
      .eq("status", "active")
      .limit(1);
    const trip = trips && trips.length > 0 ? trips[0] : null;

    if (!trip) {
      const started = await Location.hasStartedLocationUpdatesAsync(TRIP_TASK).catch(() => false);
      if (started) await Location.stopLocationUpdatesAsync(TRIP_TASK).catch(() => {});
      return;
    }

    const now = Date.now();

    // Duration stop.
    if (trip.planned_end_at && new Date(trip.planned_end_at).getTime() <= now) {
      await supabase.rpc("end_trip", { p_trip_id: trip.id, p_reason: "duration" });
      await Location.stopLocationUpdatesAsync(TRIP_TASK).catch(() => {});
      return;
    }

    // Arrival stop.
    if (trip.destination_lat != null && trip.destination_lng != null && trip.arrival_radius_m != null) {
      const d = metres(lat, lng, trip.destination_lat, trip.destination_lng);
      if (d <= trip.arrival_radius_m) {
        await supabase.rpc("end_trip", { p_trip_id: trip.id, p_reason: "arrived" });
        await Location.stopLocationUpdatesAsync(TRIP_TASK).catch(() => {});
        return;
      }
    }

    // First, try to drain any check-ins that were queued during an earlier outage.
    // This runs whenever the task fires, so a returning connection flushes the backlog.
    try { await flushCheckIns(); } catch (_e) {}
    // Interval check-in.
    // Use the MORE RECENT of the server value and the local value. When offline the
    // server value cannot advance, so the local value throttles the interval and
    // prevents a burst of check-ins per task fire.
    const serverLastAt = trip.last_check_in_at ? new Date(trip.last_check_in_at).getTime() : 0;
    const localLastAt = await getLocalLastCheckIn(trip.id);
    const lastAt = Math.max(serverLastAt, localLastAt);
    const intervalMs = trip.interval_minutes * 60 * 1000;
    if (now - lastAt >= intervalMs) {
      const capturedAt = fixAt;
      // Record the local check-in time IMMEDIATELY, before attempting the send, so
      // that even if this fires again quickly, the interval gate holds. This is the
      // fix for the offline burst: one check-in per interval, at its true time.
      await setLocalLastCheckIn(trip.id, capturedAt.getTime());
      // Capture the phone's state at this moment for the silence watcher's confidence.
      const dev = await readDeviceState();
      try {
        const { error } = await supabase.rpc("send_trip_check_in", {
          p_trip_id: trip.id, p_lat: lat, p_lng: lng, p_recorded_at: capturedAt.toISOString(),
          p_battery_level: dev.battery, p_signal_strength: dev.signal, p_connection_type: dev.conn,
        });
        if (error) { await enqueueCheckIn(trip.id, lat, lng, capturedAt, dev.battery, dev.signal, dev.conn); }
      } catch (_e) {
        // No connectivity. Queue with the true capture time + state; syncs on reconnect.
        await enqueueCheckIn(trip.id, lat, lng, capturedAt, dev.battery, dev.signal, dev.conn);
      }
    }
  } catch (_e) {
    // Next location fire will retry.
  }
});
