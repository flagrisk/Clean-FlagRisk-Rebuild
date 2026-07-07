// Standalone navigation ref, imported by both App and components (e.g. the tour)
// without a circular dependency on App.tsx.
import { createNavigationContainerRef } from "@react-navigation/native";

export const navigationRef = createNavigationContainerRef();

export function goToRoute(route: string) {
  if (navigationRef.isReady()) {
    try { navigationRef.navigate(route as never); } catch (_e) {}
  }
}
