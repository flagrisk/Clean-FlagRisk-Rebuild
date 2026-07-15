// MiniMap - compact satellite map showing ONE point (an incident / panic / flag),
// and OPTIONALLY a set of verified refuge places around it.
//
// Native Google Maps via react-native-maps. Interactive by default (pan + zoom);
// pass interactive={false} for a static preview.
//
// We force the camera on map-ready because initialRegion is only honored on the
// first layout pass and intermittently fails to apply on Android Google Maps
// (falling back to a wide default). With refuges present we fitToCoordinates so
// every pin is in frame; otherwise we animateToRegion to the single point.
//
// REFUGE PINS: real places returned by the safety-suggestions function (Google
// Places, hard-capped at 1km, never invented). Tapping one OPENS IT IN MAPS.
// It deliberately does NOT auto-route: routing a frightened person along a path
// we have not checked could send them past the very thing they are fleeing. We
// show them where it is and let them choose their own way there.
//
// NOTE: do NOT set tracksViewChanges={false} on these custom-view markers. It
// snapshots the view before it has drawn and renders the pins INVISIBLE on
// Android. This was a real bug on MapFlagScreen; leave the default.
import { useEffect, useMemo, useRef } from "react";
import { Linking, Platform, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";

export type RefugePlace = {
  name: string;
  type?: string;
  lat: number;
  lng: number;
  distance_m?: number;
  direction?: string;
  reason?: string;
  placeId?: string;
};

function openInMaps(p: RefugePlace) {
  // Open the PLACE, not directions. See note above on why we do not auto-route.
  const url = p.placeId
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}&query_place_id=${p.placeId}`
    : `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
  Linking.openURL(url).catch(() => {});
}

export function MiniMap({
  lat, lng, height = 220, interactive = true, delta = 0.0025, places = [],
}: {
  lat: number; lng: number; height?: number; interactive?: boolean; delta?: number;
  places?: RefugePlace[];
}) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  const valid = !Number.isNaN(latitude) && !Number.isNaN(longitude);
  const mapRef = useRef<MapView | null>(null);
  const region = { latitude, longitude, latitudeDelta: delta, longitudeDelta: delta };

  // Memoize so refuges keeps a STABLE identity across the parent's many state
  // updates (advice fetch sets several states). Without this, a fresh array every
  // render makes react-native-maps re-add the native markers each time, which on
  // Android shows as the pin flickering between filled and outline.
  const placesKey = JSON.stringify((places ?? []).map((p) => [p.lat, p.lng]));
  const refuges = useMemo(
    () => (places ?? []).filter((p) => p && !Number.isNaN(Number(p.lat)) && !Number.isNaN(Number(p.lng))),
    [placesKey]
  );

  function frame() {
    if (!valid) return;
    if (refuges.length > 0) {
      // Fit the incident AND every refuge, so nothing sits off-screen.
      const coords = [
        { latitude, longitude },
        ...refuges.map((p) => ({ latitude: Number(p.lat), longitude: Number(p.lng) })),
      ];
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
        animated: false,
      });
    } else {
      mapRef.current?.animateToRegion(region, 0);
    }
  }

  // CRITICAL: refuges arrive ASYNCHRONOUSLY, well after onMapReady has fired. Framing
  // only on map-ready leaves the camera zoomed tight on the incident (delta 0.0025 is
  // roughly a 250m view) while the refuges sit 400-1000m away - drawn, but off-screen.
  // That looked exactly like "the pins are not rendering". Re-frame whenever the refuge
  // set changes so they are actually visible.
  const mapReady = useRef(false);
  function onReady() {
    mapReady.current = true;
    frame();
  }

  const refugeKey = refuges.map((r) => `${r.lat},${r.lng}`).join("|");
  useEffect(() => {
    if (!mapReady.current) return;
    frame();
  }, [refugeKey, latitude, longitude]);

  return (
    <View style={[styles.wrap, { height }]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        onMapReady={onReady}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={interactive}
        pitchEnabled={interactive}
        toolbarEnabled={interactive}
        showsUserLocation={interactive}
        showsMyLocationButton={false}
        mapType="hybrid"
      >
        {/* Refuges first, so the incident marker draws ON TOP of them.
            NATIVE pins (pinColor), NOT custom child views. Custom-view markers
            routinely fail to paint on Android Google Maps - the same class of bug that
            made MapFlagScreen's markers invisible. Native pins are drawn by the Maps
            SDK itself and always render. We lose the custom green dot, but a marker
            that shows beats a prettier one that does not. */}
        {refuges.map((p, i) => (
          <Marker
            key={`refuge-${i}-${p.placeId ?? p.name}`}
            coordinate={{ latitude: Number(p.lat), longitude: Number(p.lng) }}
            pinColor="#22c55e"
            title={p.name}
            description={[
              p.type,
              p.distance_m != null ? `${p.distance_m} m ${p.direction ?? ""}`.trim() : null,
              p.reason,
            ].filter(Boolean).join(" - ")}
            onCalloutPress={() => openInMaps(p)}
          />
        ))}

        {valid && (
          <Marker
            coordinate={{ latitude, longitude }}
            pinColor="#ff3b30"
            title="Flagged location"
          />
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", borderRadius: 16, overflow: "hidden" },
  // Incident: red, as before.
  dot: { width: 18, height: 18, borderRadius: 9, backgroundColor: "#ff5a5f", borderWidth: 2, borderColor: "#fff" },
  // Refuge: green, visually unmistakable from the risk. Generous hit area so a
  // frightened person with an imprecise tap still lands on it.
  refugeHit: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  refugeDot: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: "#22c55e", borderWidth: 2.5, borderColor: "#fff",
  },
  callout: {
    minWidth: 180, maxWidth: 240,
    backgroundColor: "#fff", borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 10,
    ...Platform.select({
      android: { elevation: 4 },
      default: { shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
    }),
  },
  calloutTitle: { fontSize: 14, fontWeight: "800", color: "#111" },
  calloutMeta: { fontSize: 11.5, color: "#555", marginTop: 1, textTransform: "capitalize" },
  calloutReason: { fontSize: 12, color: "#333", marginTop: 5, lineHeight: 16 },
  calloutOpen: { fontSize: 11, fontWeight: "700", color: "#15803d", marginTop: 6 },
});

