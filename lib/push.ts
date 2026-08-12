// ============================================================================
// Push registration (Layer 2). Asks notification permission, gets the Expo push
// token for this device, and saves it via the save_push_token RPC. Call once
// after sign-in. Safe to call repeatedly (upsert). No-ops gracefully if perms
// are denied or running where push isn't available.
// ============================================================================

import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { supabase } from "./supabase";

// Show notifications while the app is foregrounded too.
// shouldShowAlert was removed in expo-notifications 0.32. Returning it means the
// handler resolves with an unknown key, the defaults apply, and every
// notification arriving while the app is open is silently suppressed.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Tap handling lives in App.tsx, which covers both the cold start
// (getLastNotificationResponseAsync) and the warm tap. A second listener here
// meant every tap was handled twice.

export async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync("default", {
      name: "FlagRisk Alerts",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#D4FF24",
      sound: "default",
      enableVibrate: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  } catch (_e) {}
}

export async function registerForPush() {
  try {
    await ensureAndroidChannel();
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== "granted") {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== "granted") return;

    const projectId =
      (Constants.expoConfig as any)?.extra?.eas?.projectId ??
      (Constants as any)?.easConfig?.projectId ??
      "73a0efca-d1d5-4702-bf9a-183ff3e63f94"; // FlagRisk EAS project (explicit fallback)

    const tokenResp = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResp.data;
    if (token) {
      await supabase.rpc("save_push_token", { p_token: token, p_platform: Platform.OS });
    }
  } catch (e) {
    // push is best-effort; never block the app on it
    console.log("push registration skipped:", String(e));
  }
}

// ---- silent location logging ------------------------------------------------
// Records the user's location so "nearby" incident notifications can target real
// people. Best-effort, foreground-only here. PRIVACY: needs the consent +
// retention/purge layer before production (NG/KE/ZA review).
import * as Location from "expo-location";

let _lastLocLog = 0;
export async function logLocationOnce(minGapMs = 60000) {
  try {
    const now = Date.now();
    if (now - _lastLocLog < minGapMs) return; // throttle
    _lastLocLog = now;
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== "granted") return; // never re-prompt here
    let pos = await Location.getLastKnownPositionAsync();
    if (!pos) {
      pos = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise((resolve) => setTimeout(() => resolve(null), 4000)),
      ]);
    }
    if (pos && pos.coords) {
      await supabase.rpc("log_location", { p_lat: pos.coords.latitude, p_lng: pos.coords.longitude });
    }
  } catch (e) {
    console.log("location log skipped:", String(e));
  }
}
