// ============================================================================
// Photo Capture - take a still image as evidence and upload to report-evidence.
// Guards against double-fire and not-yet-ready camera. Returns storage path via
// route.params.onCaptured(path).
// ============================================================================
import { useRef, useState, useEffect } from "react";
import { showAlert } from "../components/Feedback";
import { Alert, Pressable, StyleSheet, Text, View, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { supabase } from "../../lib/supabase";
import { colors, radius, spacing } from "../theme";

export function PhotoCaptureScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const cameraRef = useRef(null);
  const [camPerm, requestCam] = useCameraPermissions();
  const [camReady, setCamReady] = useState(false);

  // request camera permission on mount so the camera can initialize on a fresh
  // device. Without this, CameraView never fires onCameraReady (deadlock): the
  // camera cannot start without permission, but permission was only requested on
  // shutter tap, and the shutter is disabled until the camera is ready.
  useEffect(() => {
    if (!camPerm || !camPerm.granted) { requestCam(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [capturing, setCapturing] = useState(false);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  async function ensurePerms() {
    if (!camPerm || !camPerm.granted) { const r = await requestCam(); if (!r.granted) return false; }
    return true;
  }

  async function takePhoto() {
    if (capturing || uploading) return;
    if (!(await ensurePerms())) { showAlert({ title: "Camera needed", message: "Allow camera access to capture evidence.", tone: "error" }); return; }
    if (!cameraRef.current || !camReady) { showAlert({ title: "One moment", message: "The camera is still starting. Try again in a second." }); return; }
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7, skipProcessing: false });
      if (photo && photo.uri) setPreview(photo.uri);
      else showAlert({ title: "Capture failed", message: "No image was produced. Please try again.", tone: "error" });
    } catch (e) {
      showAlert({ title: "Capture failed", message: "Please hold steady and try again.", tone: "error" });
    } finally {
      setCapturing(false);
    }
  }

  async function upload(uri) {
    setUploading(true);
    setProgress(0);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const { data: u } = await supabase.auth.getUser();
      const token = sess.session ? sess.session.access_token : null;
      const path = (u.user ? u.user.id : "anon") + "/" + Date.now() + ".jpg";
      const res = await fetch(uri);
      const blob = await res.blob();
      const uploadUrl = "https://aqgkntulbuqqqjxjafmw.supabase.co/storage/v1/object/report-evidence/" + path;
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", uploadUrl);
        xhr.setRequestHeader("Authorization", "Bearer " + token);
        xhr.setRequestHeader("Content-Type", "image/jpeg");
        xhr.setRequestHeader("x-upsert", "false");
        xhr.upload.onprogress = (e) => { if (e.lengthComputable && e.total > 0) setProgress(Math.min(1, e.loaded / e.total)); };
        xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) resolve(); else reject(new Error("Upload failed (" + xhr.status + ")")); };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(blob);
      });
      setUploading(false);
      const cb = route.params ? route.params.onCaptured : null;
      if (cb) cb(path);
      navigation.goBack();
    } catch (e) {
      setUploading(false);
      showAlert({ title: "Upload error", message: String(e && e.message ? e.message : e), tone: "error" });
    }
  }

  if (!camPerm) return <SafeAreaView style={styles.safe} />;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}><Text style={styles.back}>{"< Cancel"}</Text></Pressable>
        <Text style={styles.headerTitle}>Capture evidence</Text>
        <View style={{ width: 60 }} />
      </View>
      <View style={styles.cameraWrap}>
        {preview ? (
          <Image source={{ uri: preview }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : camPerm?.granted ? (
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => setCamReady(true)} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }]}>
            <Text style={{ color: "#fff", fontSize: 15, textAlign: "center", marginBottom: 16 }}>
              Camera access is needed to capture photo evidence.
            </Text>
            <Pressable onPress={() => requestCam()} style={{ backgroundColor: "#fff", paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 }}>
              <Text style={{ color: "#14171c", fontWeight: "800", fontSize: 15 }}>Allow camera</Text>
            </Pressable>
          </View>
        )}
        {uploading && (
          <View style={styles.overlay}>
            <Text style={styles.overlayText}>Uploading evidence...</Text>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: (Math.round(progress * 100)) + "%" }]} /></View>
            <Text style={styles.overlaySub}>{Math.round(progress * 100)}%</Text>
          </View>
        )}
      </View>
      <View style={styles.controls}>
        {!preview ? (
          <>
            <Pressable style={[styles.shutterBtn, (!camReady || capturing) && { opacity: 0.4 }]} onPress={takePhoto} disabled={!camReady || capturing || uploading}>
              <View style={styles.shutterInner} />
            </Pressable>
            <Text style={styles.hint}>{!camReady ? "Starting camera..." : capturing ? "Capturing..." : "Tap to take a photo"}</Text>
          </>
        ) : (
          <View style={styles.reviewRow}>
            <Pressable style={styles.retakeBtn} onPress={() => setPreview(null)} disabled={uploading}><Text style={styles.retakeText}>Retake</Text></Pressable>
            <Pressable style={styles.useBtn} onPress={() => upload(preview)} disabled={uploading}><Text style={styles.useText}>{uploading ? "Uploading..." : "Use photo"}</Text></Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { color: colors.accent, fontSize: 16, fontWeight: "700" },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
  cameraWrap: { flex: 1, overflow: "hidden", margin: spacing.md, borderRadius: radius.lg },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  overlayText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  overlaySub: { color: "#fff", fontSize: 15, fontWeight: "700", marginTop: 10 },
  progressTrack: { width: 220, height: 10, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.25)", marginTop: 16, overflow: "hidden" },
  progressFill: { height: 10, borderRadius: 5, backgroundColor: colors.accent },
  controls: { alignItems: "center", paddingVertical: spacing.xl, gap: spacing.md },
  shutterBtn: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#fff" },
  hint: { color: "#fff", fontSize: 14 },
  reviewRow: { flexDirection: "row", gap: spacing.lg },
  retakeBtn: { paddingVertical: 14, paddingHorizontal: 28, borderRadius: radius.md, borderWidth: 1, borderColor: "#fff" },
  retakeText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  useBtn: { paddingVertical: 14, paddingHorizontal: 28, borderRadius: radius.md, backgroundColor: colors.accent },
  useText: { color: "#fff", fontSize: 15, fontWeight: "800" },
});
