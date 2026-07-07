// Bottom tabs with a custom floating bar. Map+Flag is reached via the center +
// (it's the flag surface), so it isn't shown as a normal tab slot.
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { FloatingTabBar } from "../components/FloatingTabBar";
import { DashboardScreen } from "../screens/DashboardScreen";
import { MapFlagScreen } from "../screens/MapFlagScreen";
import { NotificationsScreen } from "../screens/NotificationsScreen";
import { ReportsScreen } from "../screens/ReportsScreen";
import { ProfileScreen } from "../screens/ProfileScreen";

const Tab = createBottomTabNavigator();

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <FloatingTabBar {...props} />}
    >
      <Tab.Screen name="Home" component={DashboardScreen} />
      <Tab.Screen name="Inbox" component={NotificationsScreen} />
      <Tab.Screen name="Map" component={MapFlagScreen} />
      <Tab.Screen name="Reports" component={ReportsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}