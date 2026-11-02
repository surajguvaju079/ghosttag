import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { View } from "react-native";
import { useSession } from "../auth/provider";
import { Button, Text, styles } from "../ui/primitives";
export function MatchingHomeEntry() {
  const { api, token } = useSession();
  const router = useRouter();
  const [resume, setResume] = useState(false);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void api
        .matchingState(token)
        .then((state) => {
          if (active) setResume(state.status === "MATCHED");
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, [api, token]),
  );
  return (
    <View style={styles.card}>
      <Text style={{ fontSize: 21, fontWeight: "700" }}>
        Want a little company?
      </Text>
      <Text style={styles.muted}>
        A relaxed, private conversation. Start with 15 minutes.
      </Text>
      <Button
        label={resume ? "Resume conversation" : "Find someone to talk to"}
        onPress={() => router.push("/find-company")}
      />
    </View>
  );
}
