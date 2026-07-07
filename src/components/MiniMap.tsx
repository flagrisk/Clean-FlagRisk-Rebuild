// MiniMap - compact satellite map showing ONE point (an incident / panic / flag).
// Native Google Maps via react-native-maps. Interactive by default (pan + zoom);
// pass interactive={false} for a static preview.
// We force the camera to the point on map-ready because initialRegion is only
// honored on the first layout pass and intermittently fails to apply on Android
// Google Maps (falling back to a wide default). animateToRegion is one-shot and
// imperative, so it frames tightly without causing snap-back on pan.
import { useRef } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";

export function MiniMap({
  lat, lng, height = 220, interactive = true, delta = 0.0025,
}: { lat: number; lng: number; height?: number; interactive?: boolean; delta?: number }) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  const valid = !Number.isNaN(latitude) && !Number.isNaN(longitude);
  const mapRef = useRef<MapView | null>(null);
  const region = { latitude, longitude, latitudeDelta: delta, longitudeDelta: delta };

  return (
    <View style={[styles.wrap, { height }]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        onMapReady={() => { if (valid) mapRef.current?.animateToRegion(region, 0); }}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={interactive}
        pitchEnabled={interactive}
        toolbarEnabled={interactive}
        showsUserLocation={interactive}
        showsMyLocationButton={false}
        mapType="hybrid"
      >
        {valid && (
          <Marker coordinate={{ latitude, longitude }} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.dot} />
          </Marker>
        )}
      </MapView>
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { width: "100%", borderRadius: 16, overflow: "hidden" },
  dot: { width: 18, height: 18, borderRadius: 9, backgroundColor: "#ff5a5f", borderWidth: 2, borderColor: "#fff" },
});
