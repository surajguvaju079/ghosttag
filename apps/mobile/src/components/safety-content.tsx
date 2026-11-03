import { useState } from "react";
import { Linking, ScrollView, View } from "react-native";
import { Banner, Button, Screen, Text, styles } from "../ui/primitives";
import { publicHttps } from "../api/release-policy";

export default function Safety({
  bottomInset = false,
  onClose,
}: {
  bottomInset?: boolean;
  onClose?: () => void;
}) {
  const [error, setError] = useState(false);
  const policies = [
    ["Privacy policy", process.env.EXPO_PUBLIC_PRIVACY_URL],
    ["Child safety standards", process.env.EXPO_PUBLIC_CHILD_SAFETY_URL],
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
    <Screen bottomInset={bottomInset}>
      <ScrollView contentContainerStyle={styles.content}>
        {onClose && <Button label="Back" secondary onPress={onClose} />}
        <Text style={styles.title}>Safety & privacy</Text>
        <Text style={styles.muted}>
          Your ghost identity belongs to each room. Other participants can read
          and copy what you share. Avoid sharing personal or sensitive
          information.
        </Text>
        <View style={styles.card}>
          <Text style={styles.label}>AGE ELIGIBILITY</Text>
          <Text>
            GhostTag is for people aged 18 and over. Screening uses a declared
            birthday; it does not verify someone’s age. We retain the
            eligibility result, assessment method, time, and policy version, not
            the birthday. Other participants cannot see your age assessment.
          </Text>
          <Text>
            Screening does not guarantee that other people are adults.
          </Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>CHILD SAFETY</Text>
          <Text>
            Child sexual abuse and exploitation (CSAE), child sexual abuse
            material (CSAM), grooming, and sexualization of minors are
            prohibited. Use Report on a message and choose Child safety for
            urgent concerns. A report does not guarantee a response.
          </Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>REPORT A MESSAGE OR PERSON</Text>
          <Text>
            Use Report on a message or participant, choose a reason, then
            confirm. Your report and reporter identity are not shown to other
            participants. A report does not automatically remove content.
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
            delete the previous identity or its server data. You can block a
            person in a private match or group room. Blocks prevent future
            matching and shared group rooms. You can clear your blocks in
            Settings. In-app identity deletion is not currently
            available.
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
      </ScrollView>
    </Screen>
  );
}
