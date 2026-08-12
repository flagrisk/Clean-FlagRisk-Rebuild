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
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { decode as decodeBase64 } from "base64-arraybuffer";
import { supabase } from "../../lib/supabase";
import { colors, radius, spacing, type } from "../theme";

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

  async function upload(uriIn) {
    let uri = uriIn;
    setUploading(true);
    setProgress(0);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const { data: u } = await supabase.auth.getUser();
      const token = sess.session ? sess.session.access_token : null;
      const path = (u.user ? u.user.id : "anon") + "/" + Date.now() + ".jpg";
      // Downscale first. A modern phone writes a 3 to 6 MB frame at quality 0.7,
      // which is what made evidence crawl on mobile data. 1600px on the long
      // edge is more than enough to read a street sign and lands near 250 KB.
      const shrunk = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1600 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );
      uri = shrunk.uri;

      // Read the local file into real bytes. fetch(uri).blob() does NOT work on
      // React Native for file:// URIs - it yields a registry-backed Blob that
      // XHR sends as an empty body, so the object lands in Storage at 0 bytes
      // and every later read renders blank. Base64 -> ArrayBuffer is the path
      // that works (same as SupportThreadScreen).
      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const bytes = decodeBase64(b64);
      if (!bytes || bytes.byteLength === 0) throw new Error("The captured image was empty. Please retake it.");
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
        xhr.send(bytes);
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
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}><Text style={styles.back}>{"Cancel"}</Text></Pressable>
        <Text style={styles.headerTitle}>Photo evidence</Text>
        <View style={{ width: 54 }} />
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
            <Text style={styles.overlayText}>Uploading evidence</Text>
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
            <Text style={styles.hint}>{!camReady ? "Starting camera" : capturing ? "Capturing" : "Tap to take a photo"}</Text>
          </>
        ) : (
          <View style={styles.reviewRow}>
            <Pressable style={styles.retakeBtn} onPress={() => setPreview(null)} disabled={uploading}><Text style={styles.retakeText}>Retake</Text></Pressable>
            <Pressable style={styles.useBtn} onPress={() => upload(preview)} disabled={uploading}><Text style={styles.useText}>{uploading ? "Uploading" : "Use photo"}</Text></Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.inkDeep },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.gutter, paddingVertical: spacing.md },
  back: { ...type.label, fontWeight: "600", color: "#FFFFFF" },
  headerTitle: { ...type.subheading, color: "#FFFFFF" },
  cameraWrap: { flex: 1, overflow: "hidden", marginHorizontal: spacing.md, marginBottom: spacing.md, borderRadius: radius.lg, backgroundColor: "#000000" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(1,1,20,0.72)", alignItems: "center", justifyContent: "center" },
  overlayText: { ...type.subheading, color: "#FFFFFF" },
  overlaySub: { ...type.label, fontWeight: "600", color: "#FFFFFF", marginTop: 10 },
  progressTrack: { width: 220, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.25)", marginTop: 16, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
  controls: { alignItems: "center", paddingBottom: spacing.xl, gap: spacing.md },
  shutterBtn: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#FFFFFF" },
  hint: { ...type.caption, color: "rgba(255,255,255,0.75)" },
  reviewRow: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.gutter, alignSelf: "stretch" },
  retakeBtn: { flex: 1, height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: "rgba(255,255,255,0.4)", alignItems: "center", justifyContent: "center" },
  retakeText: { ...type.label, fontWeight: "600", color: "#FFFFFF" },
  useBtn: { flex: 1, height: 52, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  useText: { ...type.label, fontWeight: "600", color: colors.ink },
});
