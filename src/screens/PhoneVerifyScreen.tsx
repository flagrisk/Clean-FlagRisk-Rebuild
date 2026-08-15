// ============================================================================
// Phone Verify - FlagRisk v2.1
// One screen, two jobs, because they are the same six digits either way.
//
//  mode "signup"  the account was just created with signUp({ phone, password }).
//                 Supabase sent a code through the Send SMS hook, and verifyOtp
//                 confirms the number and returns a session.
//
//  mode "attach"  the person signed up with email and is adding a phone to an
//                 account that already exists. The code proves the number is
//                 theirs, then claim_verified_phone stamps it on their profile.
//
// The code is a one time confirmation, not a login step. After this they sign in
// with their phone and password like anyone else.
// ============================================================================
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "../../lib/supabase";
import { showAlert } from "../components/Feedback";
import { AuthInput } from "../components/AuthInput";
import { AuthShell } from "./authShared";
import { colors, radius, spacing, type } from "../theme";

const PRIMARY_GRAD = ["#101216", "#1B1E24", "#33373F"] as const;
const PRIMARY_STOPS = [0, 0.45, 1] as const;

// Same rules as normalize_phone in the database and in the hook. All three must
// agree or a code sent to 0814... cannot be confirmed as +234814...
function normalize(raw: string, cc = "234"): string {
  let d = (raw || "").replace(/[^0-9]/g, "");
  if (!d) return "";
  if (d.startsWith("234")) { /* already international */ }
  else if (d.startsWith("0")) d = cc + d.slice(1);
  else if (d.length === 10) d = cc + d;
  return "+" + d;
}

export function PhoneVerifyScreen({ route, navigation }: any) {
  const mode: "signup" | "attach" | "reset" = route?.params?.mode ?? "attach";
  const [phone, setPhone] = useState(route?.params?.phone ?? "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(!!route?.params?.phone && mode === "signup");
  // Reset needs a third step after the code: the new password itself.
  const [needPw, setNeedPw] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [wait, setWait] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // A resend countdown, because without one people press it repeatedly and hit
  // the provider rate limit, which then blocks the code they are waiting for.
  useEffect(() => {
    if (wait <= 0) return;
    timer.current = setInterval(() => setWait((w) => (w <= 1 ? 0 : w - 1)), 1000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [wait]);

  async function leave() {
    if (mode === "attach") return navigation.goBack();
    // The account was created but never confirmed. Sign out so they land back
    // on Create Account rather than a half made account they cannot reach.
    await supabase.auth.signOut();
    navigation.reset({ index: 0, routes: [{ name: "CreateAccount" }] });
  }

  async function sendCode() {
    const p = normalize(phone);
    if (p.length < 11) return showAlert({ title: "Enter your phone number", tone: "error" });
    setBusy(true);
    // Attach changes the number on the account already signed in. signInWithOtp
    // would have signed them in AS the phone account instead, silently
    // replacing the email session they were adding the number to.
    // Wrapped because an exception here took the whole app down rather than
    // showing anything. A thrown error is now a message you can read and report.
    let error: any = null;
    try {
      const r = mode === "attach"
        ? await supabase.auth.updateUser({ phone: p })
        : await supabase.auth.signInWithOtp({ phone: p, options: { shouldCreateUser: false } });
      error = r.error;
    } catch (e: any) {
      error = { message: "threw: " + String(e && e.message ? e.message : e) };
    }
    setBusy(false);
    if (error) {
      return showAlert({ title: "Could not send the code", message: error.message, tone: "error" });
    }
    setSent(true);
    setWait(45);
    showAlert({ title: "Code sent", message: "Enter the six digits we sent to " + p + "." });
  }

  async function confirm() {
    const p = normalize(phone);
    const token = code.trim();
    if (token.length < 6) {
      return showAlert({ title: "Enter the code", message: "It is six digits.", tone: "error" });
    }
    setBusy(true);

    const { error } = await supabase.auth.verifyOtp({ phone: p, token, type: mode === "attach" ? "phone_change" : "sms" });
    if (error) {
      setBusy(false);
      return showAlert({
        title: "Code not accepted",
        message: /expired/i.test(error.message)
          ? "That code has expired. Ask for a new one."
          : "Check the code and try again.",
        tone: "error",
      });
    }

    // A phone signup is already stamped by the trigger that mirrors auth.users
    // into profiles. An email account adding a phone is not, so it claims it.
    if (mode === "attach") {
      const { data, error: cErr } = await supabase.rpc("claim_verified_phone", { p_phone: p });
      setBusy(false);
      const r: any = data;
      if (cErr || !r?.ok) {
        return showAlert({
          title: "Could not link this number",
          message: r?.error === "phone_in_use"
            ? "This number is already linked to another account."
            : "Please try again.",
          tone: "error",
        });
      }
      return showAlert({
        title: "Number verified",
        message: "You can now flag risks, raise an alarm and use Trip Watch.",
        buttons: [{ text: "Done", onPress: () => navigation.goBack() }],
      });
    }

    // Reset ends here for now. They are signed in, which is exactly why the
    // password cannot wait: someone who forgot it would otherwise be let in and
    // never fix it.
    if (mode === "reset") {
      setNeedPw(true);
      return;
    }

    // A signup verify returns a session, and App.tsx swaps the stack when
    // onAuthStateChange fires. That can take a moment, and without this the
    // person is left on the same screen with no sign anything happened, which
    // is exactly what a tester reported.
    setBusy(false);
    // verifyOtp returns a session and onAuthStateChange fires, but the listener
    // in App.tsx can land while this screen still holds the tree, leaving the
    // person on a dismissed modal with nothing behind it. Reading the session
    // back and setting it again forces the navigator to re-evaluate.
    // Do not call setSession here. Handing the client tokens it already holds
    // can resolve without emitting SIGNED_IN, and App.tsx swaps the stack on
    // that event alone, so the person stays on this screen with a session they
    // cannot see. refreshSession issues a new one and always emits.
    showAlert({
      title: "Number verified",
      message: "Welcome to FlagRisk.",
      buttons: [{
        text: "Continue",
        onPress: () => {
          // PhoneVerify is registered in both the signed-out and signed-in
          // stacks. React Navigation keeps the current route when the navigator
          // swaps if a screen of that name exists in the new one, so flipping
          // signedIn left the person sitting here. Force the destination.
          setTimeout(() => {
            try { navigation.reset({ index: 0, routes: [{ name: "Main" }] }); } catch (_e) {}
          }, 150);
        },
      }],
    });
  }

  async function savePassword() {
    if (pw.length < 8) {
      return showAlert({ title: "Too short", message: "Use at least 8 characters.", tone: "error" });
    }
    if (/^[0-9]+$/.test(pw)) {
      return showAlert({
        title: "Choose a stronger password",
        message: "Numbers alone are easy to guess. Mix in letters.",
        tone: "error",
      });
    }
    if (pw !== pw2) {
      return showAlert({ title: "They do not match", message: "The two passwords are different.", tone: "error" });
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) {
      return showAlert({ title: "Could not set your password", message: error.message, tone: "error" });
    }
    showAlert({
      title: "Password changed",
      message: "You are signed in with your new password.",
      buttons: [{
        text: "Continue",
        onPress: () => setTimeout(() => {
          try { navigation.reset({ index: 0, routes: [{ name: "Main" }] }); } catch (_e) {}
        }, 150),
      }],
    });
  }

  return (
    <AuthShell
      headerTitle={mode === "reset" ? "Reset password" : "Verify number"}
      title={
        needPw ? "Choose a new password"
        : sent ? "Enter your code"
        : mode === "reset" ? "Reset your password"
        : "Verify your number"
      }
      subtitle={
        needPw
          ? "Eight characters or more. This protects the people in your circle."
          : sent
          ? "We sent a code to " + normalize(phone) + ". It expires in ten minutes."
          : mode === "reset"
          ? "Enter the number on your account and we will send you a code."
          : "Your phone number is how we know who is raising an alarm. It is never shown to strangers."
      }
      footer={
        <>
          <Pressable
            style={[styles.cta, busy && { opacity: 0.7 }]}
            onPress={needPw ? savePassword : sent ? confirm : sendCode}
            disabled={busy}
          >
            <LinearGradient colors={PRIMARY_GRAD} locations={PRIMARY_STOPS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
            <Text style={styles.ctaText}>
              {busy ? (needPw ? "Saving" : sent ? "Checking" : "Sending") : needPw ? "Set new password" : sent ? (mode === "reset" ? "Confirm code" : "Verify number") : "Send me a code"}
            </Text>
          </Pressable>

          {sent && !needPw ? (
            <Pressable onPress={wait > 0 ? undefined : sendCode} hitSlop={8} disabled={wait > 0 || busy}>
              <Text style={[styles.link, wait > 0 && { color: colors.textFaint }]}>
                {wait > 0 ? "Send another code in " + wait + "s" : "Send another code"}
              </Text>
            </Pressable>
          ) : null}

          {/* Signup mode has no back button in the shell and the account already
              exists unconfirmed, so someone who mistyped their number would be
              stuck. Signing out returns them to a usable state. */}
          <Pressable onPress={leave} hitSlop={8}>
            <Text style={styles.link}>{mode === "attach" ? "Not now" : mode === "reset" ? "Back to sign in" : "Use a different number"}</Text>
          </Pressable>
        </>
      }
    >
      {needPw ? (
        <>
          <AuthInput
            label="New password"
            value={pw}
            onChangeText={setPw}
            placeholder="At least 8 characters"
            secure
          />
          <AuthInput
            label="Confirm new password"
            value={pw2}
            onChangeText={setPw2}
            placeholder="Enter it again"
            secure
          />
          {pw2.length > 0 && pw !== pw2
            ? <Text style={styles.mismatch}>These do not match yet.</Text>
            : null}
        </>
      ) : (
      <AuthInput
        label="Phone number"
        value={phone}
        onChangeText={(v: string) => { setPhone(v); if (sent) setSent(false); }}
        placeholder="0803 000 0000"
        keyboardType="phone-pad"
      />
      )}
      {sent && !needPw ? (
        <AuthInput
          label="Six digit code"
          value={code}
          onChangeText={setCode}
          placeholder="000000"
          keyboardType="number-pad"
        />
      ) : null}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  cta: {
    height: 54, borderRadius: 13,
    backgroundColor: "transparent", overflow: "hidden",
    alignItems: "center", justifyContent: "center",
  },
  ctaText: { ...type.bodyStrong, fontWeight: "600", color: colors.accent },
  link: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.ink, textAlign: "center" },
  mismatch: { fontSize: 12, lineHeight: 17, color: colors.riskHigh, marginTop: 8 },
});



















