// ============================================================================
// Video Capture - record a short clip as evidence for a report and upload it to
// the 'report-evidence' Storage bucket. Returns the storage path to the caller
// via navigation params (onCaptured). Capped at ~15s to keep uploads small.
//
// NOTE: video recording + binary upload from RN is the fiddliest piece; if a
// device/codec issue appears, this is the screen to iterate on. Falls back
// gracefully with clear errors.
// ============================================================================

import { useRef, useState } from "react";
import { showAlert } from "../components/Feedback";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import * as FileSystem from "expo-file-system/legacy";
import { decode as decodeBase64 } from "base64-arraybuffer";
import { supabase } from "../../lib/supabase";
import { colors, radius, spacing, type } from "../theme";

const MAX_SECONDS = 10;  // capture cap: change here only

export function VideoCaptureScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const cameraRef = useRef<CameraView>(null);
  const [camPerm, requestCam] = useCameraPermissions();
  const [micPerm, requestMic] = useMicrophonePermissions();
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1 upload progress
  const [remaining, setRemaining] = useState(MAX_SECONDS);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function ensurePerms() {
    if (!camPerm?.granted) { const r = await requestCam(); if (!r.granted) return false; }
    if (!micPerm?.granted) { await requestMic(); }
    return true;
  }

  async function startRecording() {
    if (!(await ensurePerms())) return showAlert({ title: "Camera needed", message: "Allow camera access to record evidence.", tone: "error" });
    if (!cameraRef.current) return;
    setRecording(true);
    setRemaining(MAX_SECONDS);
    tickRef.current = setInterval(() => {
      setRemaining((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    try {
      // capped at MAX_SECONDS at the source; the camera stops itself.
      // Cap the file as well as the duration. Without this a 10 second clip can
      // be 20 MB on a high bitrate device, which no one on mobile data will wait for.
      const video = await cameraRef.current.recordAsync({
        maxDuration: MAX_SECONDS,
        maxFileSize: 6 * 1024 * 1024,
      });
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
      setRecording(false);
      if (video?.uri) await upload(video.uri);
    } catch (e) {
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
      setRecording(false);
      showAlert({ title: "Recording failed", message: String(e), tone: "error" });
    }
  }

  function stopRecording() {
    cameraRef.current?.stopRecording();
  }

  async function upload(uri: string) {
    setUploading(true);
    setProgress(0);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const { data: u } = await supabase.auth.getUser();
      const token = sess.session?.access_token;
      const path = `${u.user?.id}/${Date.now()}.mp4`;

      // Read the local recording into real bytes. fetch(uri).blob() does NOT work
      // on React Native for file:// URIs - it yields a registry-backed Blob that
      // XHR sends as an empty body, so the object lands in Storage at 0 bytes and
      // the player shows a blank frame. Base64 -> ArrayBuffer is the path that
      // works (same as SupportThreadScreen).
      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const bytes = decodeBase64(b64);
      if (!bytes || bytes.byteLength === 0) throw new Error("The recording was empty. Please record again.");

      // upload via XHR so we get real progress events (the JS client doesn't expose them)
      const uploadUrl = `https://aqgkntulbuqqqjxjafmw.supabase.co/storage/v1/object/report-evidence/${path}`;
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", uploadUrl);
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.setRequestHeader("Content-Type", "video/mp4");
        xhr.setRequestHeader("x-upsert", "false");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && e.total > 0) {
            setProgress(Math.min(1, e.loaded / e.total));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText}`));
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(bytes);
      });

      setUploading(false);
      const cb = route.params?.onCaptured;
      if (cb) cb(path);
      navigation.goBack();
    } catch (e) {
      setUploading(false);
      showAlert({ title: "Upload error", message: String(e), tone: "error" });
    }
  }

  if (!camPerm) return <SafeAreaView style={styles.safe} />;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}><Text style={styles.back}>{"Cancel"}</Text></Pressable>
        <Text style={styles.headerTitle}>Video evidence</Text>
        <View style={{ width: 54 }} />
      </View>

      <View style={styles.cameraWrap}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} mode="video" facing="back" videoQuality="720p" />
        {uploading && (
          <View style={styles.overlay}>
            <Text style={styles.overlayText}>Uploading evidence</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>
            <Text style={styles.overlaySub}>{Math.round(progress * 100)}%</Text>
          </View>
        )}
      </View>

      <View style={styles.controls}>
        {!recording ? (
          <Pressable style={styles.recordBtn} onPress={startRecording} disabled={uploading}>
            <View style={styles.recordDot} />
          </Pressable>
        ) : (
          <Pressable style={styles.stopBtn} onPress={stopRecording}>
            <View style={styles.stopSquare} />
          </Pressable>
        )}
        <Text style={styles.hint}>{recording ? `Recording, ${remaining}s left. Tap to stop.` : `Tap to record, up to ${MAX_SECONDS} seconds`}</Text>
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
  recordBtn: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  recordDot: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.riskHigh },
  stopBtn: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: colors.riskHigh, alignItems: "center", justifyContent: "center" },
  stopSquare: { width: 30, height: 30, borderRadius: 6, backgroundColor: colors.riskHigh },
  hint: { ...type.caption, color: "rgba(255,255,255,0.75)" },
});
