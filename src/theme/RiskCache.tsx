// Startup-preloaded cache: last-known risk score, location, and profile basics,
// loaded from disk once at app launch so screens paint real data on first render.
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

type LatLng = { lat: number; lng: number };
type Profile = { name: string; email: string; phone: string; tier: string; avatarUrl: string | null };
type Ctx = {
  score: number | null;
  band: string | null;
  loc: LatLng | null;
  profile: Profile | null;
  ready: boolean;
  setRisk: (score: number, band: string) => void;
  setLoc: (lat: number, lng: number) => void;
  setProfile: (p: Profile) => void;
};

const RiskCacheContext = createContext<Ctx>({
  score: null, band: null, loc: null, profile: null, ready: false,
  setRisk: () => {}, setLoc: () => {}, setProfile: () => {},
});

export function RiskCacheProvider({ children }: { children: ReactNode }) {
  const [score, setScore] = useState<number | null>(null);
  const [band, setBand] = useState<string | null>(null);
  const [loc, setLocState] = useState<LatLng | null>(null);
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [s, b, l, p] = await Promise.all([
          AsyncStorage.getItem("dash_score"),
          AsyncStorage.getItem("dash_band"),
          AsyncStorage.getItem("last_loc"),
          AsyncStorage.getItem("profile_basics"),
        ]);
        if (s != null) setScore(Number(s));
        if (b != null) setBand(b);
        if (l != null) { try { setLocState(JSON.parse(l)); } catch {} }
        if (p != null) { try { setProfileState(JSON.parse(p)); } catch {} }
      } catch { /* no cache yet */ }
      setReady(true);
    })();
  }, []);

  const setRisk = (s: number, b: string) => {
    setScore(s); setBand(b);
    AsyncStorage.setItem("dash_score", String(s));
    AsyncStorage.setItem("dash_band", b);
  };

  const setLoc = (lat: number, lng: number) => {
    const v = { lat, lng };
    setLocState(v);
    AsyncStorage.setItem("last_loc", JSON.stringify(v));
  };

  const setProfile = (p: Profile) => {
    setProfileState(p);
    AsyncStorage.setItem("profile_basics", JSON.stringify(p));
  };

  return (
    <RiskCacheContext.Provider value={{ score, band, loc, profile, ready, setRisk, setLoc, setProfile }}>
      {children}
    </RiskCacheContext.Provider>
  );
}

export function useRiskCache() {
  return useContext(RiskCacheContext);
}
