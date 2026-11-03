import { Tabs } from "expo-router";
import { Text } from "react-native";
import { palette } from "../../ui/primitives";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: "#B99AFF",
        tabBarInactiveTintColor: palette.muted,
        tabBarStyle: {
          backgroundColor: palette.bg,
          borderTopColor: palette.line,
        },
        sceneStyle: { backgroundColor: palette.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 24 }}>⌂</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="my-rooms"
        options={{
          title: "My Rooms",
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 24 }}>☷</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: "Discover",
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 24 }}>✦</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 24 }}>⚙</Text>
          ),
        }}
      />
      <Tabs.Screen name="safety" options={{ href: null }} />
    </Tabs>
  );
}
