// ============================================================================
// Video Capture â€” record a short clip as evidence for a report and upload it to
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
import { supabase } from "../../lib/supabase";
import { colors, radius, spacing } from "../theme";

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
      const video = await cameraRef.current.recordAsync({ maxDuration: MAX_SECONDS });
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

      // read the local recording into bytes
      const res = await fetch(uri);
      const blob = await res.blob();

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
        xhr.send(blob);
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
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}><Text style={styles.back}>{"< Cancel"}</Text></Pressable>
        <Text style={styles.headerTitle}>Record evidence</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.cameraWrap}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} mode="video" facing="back" />
        {uploading && (
          <View style={styles.overlay}>
            <Text style={styles.overlayText}>Uploading evidence...</Text>
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
        <Text style={styles.hint}>{recording ? `Recording... ${remaining}s left (tap to stop)` : `Tap to record (max ${MAX_SECONDS}s)`}</Text>
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
  recordBtn: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  recordDot: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.danger },
  stopBtn: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: colors.danger, alignItems: "center", justifyContent: "center" },
  stopSquare: { width: 30, height: 30, borderRadius: 6, backgroundColor: colors.danger },
  hint: { color: "#fff", fontSize: 14 },
});




