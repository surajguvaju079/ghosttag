import { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSession } from "../auth/provider";
import { Text, styles } from "../ui/primitives";

export function DailyTopic() {
  const { api, token } = useSession();
  const [topic, setTopic] = useState<string>();
  const day = useRef<string | undefined>(undefined);
  useFocusEffect(useCallback(() => {
    let active = true;
    async function refresh() {
      try {
        const result = await api.today(token);
        if (active) { day.current = result.date; setTopic(result.topic); }
      } catch { if (active) setTopic(undefined); }
    }
    void refresh();
    const timer = setInterval(() => {
      if (new Date().toISOString().slice(0, 10) !== day.current) void refresh();
    }, 60_000);
    return () => { active = false; clearInterval(timer); };
  }, [api, token]));
  if (!topic) return null;
  return <View style={styles.card}>
    <Text style={styles.label}>TODAY&apos;S QUESTION</Text>
    <Text style={{ fontSize: 18, fontWeight: "600" }}>{topic}</Text>
    <Text style={styles.muted}>A small place to start, if you need one.</Text>
  </View>;
}
