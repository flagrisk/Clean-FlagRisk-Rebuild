// Offline check-in queue for Trip Watch.
//
// When a trip check-in cannot be transmitted (no connectivity), it is saved
// here with its TRUE capture time. When connectivity returns, flush() replays
// each queued check-in to the server, passing the original timestamp so the
// watchers see when the person actually was there, not when the phone reconnected.
//
// The live path is unchanged: a check-in that sends immediately never touches
// this queue. The queue only holds check-ins that failed to send.
//
// Storage: AsyncStorage (a small JSON array). Adequate for the modest number of
// interval check-ins a trip produces. No native dependency, so this ships via OTA.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";

const QUEUE_KEY = "flagrisk-trip-checkin-queue-v1";

// A queued check-in carries everything send_trip_check_in needs to replay it,
// including the original capture time.
type QueuedCheckIn = {
  tripId: string;
  lat: number;
  lng: number;
  recordedAt: string; // ISO 8601, the true moment of capture
  battery?: number | null;
  signal?: string | null;
  conn?: string | null;
};

async function readQueue(): Promise<QueuedCheckIn[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_e) {
    return [];
  }
}

async function writeQueue(items: QueuedCheckIn[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch (_e) {
    // If persistence fails there is nothing more we can safely do here.
  }
}

// Save a check-in that could not be transmitted. Called when the live send fails.
export async function enqueueCheckIn(tripId: string, lat: number, lng: number, recordedAt: Date, battery: number | null = null, signal: string | null = null, conn: string | null = null): Promise<void> {
  const items = await readQueue();
  items.push({ tripId, lat, lng, recordedAt: recordedAt.toISOString(), battery, signal, conn });
  // Cap the queue to a sane size so a very long outage cannot grow it without bound.
  const capped = items.slice(-200);
  await writeQueue(capped);
}

// Attempt to send all queued check-ins, oldest first, preserving their original
// timestamps. Each success is removed from the queue. A failure stops the flush
// and leaves the remaining items for the next attempt. Returns the number sent.
export async function flushCheckIns(): Promise<number> {
  const items = await readQueue();
  if (items.length === 0) return 0;

  // Oldest first, so the trail replays in order.
  items.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));

  let sent = 0;
  const remaining = [...items];
  for (const item of items) {
    try {
      const { error } = await supabase.rpc("send_trip_check_in", {
        p_trip_id: item.tripId,
        p_lat: item.lat,
        p_lng: item.lng,
        p_recorded_at: item.recordedAt,
        p_battery_level: item.battery ?? null,
        p_signal_strength: item.signal ?? null,
        p_connection_type: item.conn ?? null,
      });
      if (error) {
        // If the trip is no longer active, this check-in can never be delivered.
        // Drop it so a stale entry does not block the queue forever.
        const msg = (error.message || "").toLowerCase();
        if (msg.includes("not active") || msg.includes("trip not found")) {
          remaining.shift();
          continue;
        }
        // A transient error (network): stop, keep this and the rest for later.
        break;
      }
      // Sent successfully: remove from the front of remaining.
      remaining.shift();
      sent++;
    } catch (_e) {
      // Network or other transient failure: stop and retry next time.
      break;
    }
  }

  await writeQueue(remaining);
  return sent;
}

// How many check-ins are waiting to sync. Useful for a small UI indicator.
export async function pendingCheckInCount(): Promise<number> {
  const items = await readQueue();
  return items.length;
}

// ---------------------------------------------------------------------------
// Local "last check-in time" tracker.
//
// The interval gate in the background task normally reads trips.last_check_in_at
// from the server. But when offline, the server cannot update, so that value goes
// stale and the gate would fire on every task run. We therefore also track the
// last check-in time LOCALLY, per trip, so the interval is respected even with no
// network. The gate uses whichever is more recent: the server value or this local
// one. On a successful live send the server value advances naturally; this local
// value covers the offline case.
// ---------------------------------------------------------------------------
const LAST_LOCAL_KEY = "flagrisk-trip-last-checkin-v1";

// Returns the locally recorded last check-in time for a trip, in ms since epoch,
// or 0 if none.
export async function getLocalLastCheckIn(tripId: string): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(LAST_LOCAL_KEY);
    if (!raw) return 0;
    const map = JSON.parse(raw);
    const v = map && map[tripId];
    return typeof v === "number" ? v : 0;
  } catch (_e) {
    return 0;
  }
}

// Records that a check-in was captured for a trip at the given time (ms since epoch).
export async function setLocalLastCheckIn(tripId: string, atMs: number): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(LAST_LOCAL_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[tripId] = atMs;
    await AsyncStorage.setItem(LAST_LOCAL_KEY, JSON.stringify(map));
  } catch (_e) {
    // best effort
  }
}

// ---------------------------------------------------------------------------
// Battery-critical beacon tracking. The beacon fires ONCE per trip when battery
// crosses a critical threshold, so we record that it was sent to avoid repeats.
// ---------------------------------------------------------------------------
const BEACON_SENT_KEY = "flagrisk-trip-beacon-sent-v1";

export async function getBeaconSent(tripId: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(BEACON_SENT_KEY);
    if (!raw) return false;
    const map = JSON.parse(raw);
    return !!(map && map[tripId]);
  } catch (_e) {
    return false;
  }
}

export async function setBeaconSent(tripId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(BEACON_SENT_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[tripId] = true;
    await AsyncStorage.setItem(BEACON_SENT_KEY, JSON.stringify(map));
  } catch (_e) {}
}
