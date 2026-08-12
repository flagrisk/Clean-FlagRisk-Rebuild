// Standalone navigation ref, imported by both App and components (e.g. the tour)
// without a circular dependency on App.tsx.
import { createNavigationContainerRef } from "@react-navigation/native";

export const navigationRef = createNavigationContainerRef();

// Params matter: an incident route with no incidentId lands on the "no longer
// available" state. The try/catch also swallowed unknown route names silently,
// so a bad route in the push payload looked like a dead tap with no trace.
export function goToRoute(route: string, params?: Record<string, unknown>) {
  if (!navigationRef.isReady()) return;
  try {
    navigationRef.navigate(route as never, params as never);
  } catch (e) {
    console.log("push route failed:", route, String(e));
  }
}
