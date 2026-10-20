import { useState } from "react";
import { Linking, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Banner, Button, Screen, Text, styles } from "../ui/primitives";
import { publicHttps } from "../api/release-policy";

export default function Safety() {
  const router = useRouter();
  const [error, setError] = useState(false);
  const policies = [
    ["Privacy policy", process.env.EXPO_PUBLIC_PRIVACY_URL],
    ["Terms of service", process.env.EXPO_PUBLIC_TERMS_URL],
    ["Community guidelines", process.env.EXPO_PUBLIC_COMMUNITY_URL],
  ];
  async function open(value?: string) {
    setError(false);
    try {
      await Linking.openURL(publicHttps(value).toString());
    } catch {
      setError(true);
    }
  }
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Safety & privacy</Text>
        <Text style={styles.muted}>
          Your ghost identity belongs to each room. Other participants can read
          and copy what you share. Avoid sharing personal or sensitive
          information.
        </Text>
        <View style={styles.card}>
          <Text style={styles.label}>REPORT A MESSAGE</Text>
          <Text>
            Use Report on a message, choose a reason, then confirm. Your report
            and reporter identity are not shown to other participants. A report
            does not automatically remove content.
          </Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>TEMPORARY ROOMS</Text>
          <Text>
            Rooms become inaccessible at their expiration time. Server cleanup
            runs afterward and can be delayed. Room cleanup does not delete your
            anonymous identity or credential.
          </Text>
          <Text>
            Start fresh replaces the credential on this device. It does not
            delete the previous identity or its server data. In-app identity
            deletion and participant blocking are not currently available.
          </Text>
        </View>
        {policies.map(([label, value]) => (
          <Button
            key={label}
            label={label || "Policy"}
            secondary
            onPress={() => void open(value)}
          />
        ))}
        {error && (
          <Banner>
            This policy link is unavailable. Please try again later.
          </Banner>
        )}
        <Button label="Back" secondary onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}
