// Background task for Trip Watch. Registered at module load (imported early in
// App). Fires on OS-scheduled location updates while a trip is active, even when
// the app is closed. Sends check-ins on the chosen interval and ends the trip on
// arrival or when the planned duration elapses.
//
// Runs OUTSIDE React (no hooks/state). Reuses the persisted Supabase session
// (AsyncStorage) so the RPC calls authenticate as the user.
import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import { supabase } from "../../lib/supabase";

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

TaskManager.defineTask(TRIP_TASK, async ({ data, error }) => {
  if (error) return;
  const locs = data && data.locations;
  if (!locs || locs.length === 0) return;
  const pos = locs[locs.length - 1];
  const lat = pos.coords.latitude;
  const lng = pos.coords.longitude;

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

    // Interval check-in.
    const lastAt = trip.last_check_in_at ? new Date(trip.last_check_in_at).getTime() : 0;
    const intervalMs = trip.interval_minutes * 60 * 1000;
    if (now - lastAt >= intervalMs) {
      await supabase.rpc("send_trip_check_in", { p_trip_id: trip.id, p_lat: lat, p_lng: lng });
    }
  } catch (_e) {
    // Next location fire will retry.
  }
});
