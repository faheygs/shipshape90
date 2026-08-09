import { Icon, theme, type IconName } from "@shipshape/ui-mobile";
import { Tabs } from "expo-router";
import { StyleSheet } from "react-native";
import { useUnreadNotificationCount } from "../../src/features/notifications/useNotifications";

const icons: Record<string, IconName> = { home: "home", challenges: "challenges", create: "create", notifications: "bell", profile: "profile" };

export default function TabLayout() {
  const unreadNotifications = useUnreadNotificationCount();
  return <Tabs initialRouteName="home" screenOptions={({ route }) => ({ headerShown: false, tabBarHideOnKeyboard: true, tabBarActiveTintColor: theme.colors.brand, tabBarInactiveTintColor: theme.colors.textMuted, tabBarStyle: styles.bar, tabBarLabelStyle: styles.label, tabBarIcon: ({ color, focused }) => <Icon name={icons[route.name] ?? "home"} color={color} size={route.name === "create" ? 26 : 22} strokeWidth={focused ? 2.35 : 1.8} /> })}>
    <Tabs.Screen name="home" options={{ title: "Home" }} />
    <Tabs.Screen name="challenges" options={{ title: "Challenges" }} />
    <Tabs.Screen name="create" options={{ title: "Create" }} />
    <Tabs.Screen name="notifications" options={{ title: "Notifications", tabBarBadge: (unreadNotifications.data ?? 0) > 0 ? Math.min(unreadNotifications.data ?? 0, 99) : undefined, tabBarBadgeStyle: styles.badge }} />
    <Tabs.Screen name="profile" options={{ title: "Profile" }} />
  </Tabs>;
}

const styles = StyleSheet.create({ bar: { height: 82, paddingTop: 9, paddingBottom: 12, borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface }, label: { fontFamily: theme.type.body, fontWeight: "700", fontSize: 10 }, badge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: theme.colors.brandStrong, color: "#fff", fontFamily: theme.type.body, fontWeight: "900", fontSize: 8 } });
