// Theme context: holds the active mode, persists the choice (expo-secure-store),
// and exposes live colours via useTheme(). Default: light.
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import { getTheme, ThemeMode } from "./index";

const KEY = "fr_theme_mode";

type ThemeValue = ReturnType<typeof getTheme> & {
  toggle: () => void;
  setMode: (m: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("light");

  useEffect(() => {
    SecureStore.getItemAsync(KEY).then((saved) => {
      if (saved === "light" || saved === "dark") setModeState(saved);
    });
  }, []);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    SecureStore.setItemAsync(KEY, m).catch(() => {});
  };
  const toggle = () => setMode(mode === "light" ? "dark" : "light");

  const value: ThemeValue = { ...getTheme(mode), toggle, setMode };
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
