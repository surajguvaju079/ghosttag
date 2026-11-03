import { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSession } from "../../auth/provider";
import { friendlyError } from "../../api/client";
import Safety from "../../components/safety-content";
import { Banner, Button, Screen, Text, styles } from "../../ui/primitives";

export default function Settings() {
  const { api, token } = useSession();
  const [safety, setSafety] = useState(false);
  const [blockedCount, setBlockedCount] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void api
        .matchingState(token)
        .then((state) => {
          if (active) setBlockedCount(state.blockedCount);
        })
        .catch((failure) => {
          if (active) setError(failure);
        });
      return () => {
        active = false;
      };
    }, [api, token]),
  );
  if (safety)
    return <Safety bottomInset={false} onClose={() => setSafety(false)} />;
  async function clearBlocks() {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const state = await api.clearMatchBlocks(token);
      setBlockedCount(state.blockedCount);
      setConfirm(false);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen bottomInset={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.muted}>
          Your anonymous identity and privacy controls.
        </Text>
        {error !== undefined && <Banner>{friendlyError(error)}</Banner>}
        <View style={styles.card}>
          <Text style={styles.label}>SAFETY & PRIVACY</Text>
          <Text style={styles.muted}>
            How rooms disappear, how to report, and what others can see.
          </Text>
          <Button
            label="Open safety & privacy"
            secondary
            onPress={() => setSafety(true)}
          />
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>BLOCKED PEOPLE</Text>
          <Text>
            {blockedCount === null
              ? "Loading blocks…"
              : `${blockedCount} blocked ${blockedCount === 1 ? "person" : "people"}`}
          </Text>
          <Text style={styles.muted}>
            Blocks keep you apart in matching and group rooms for this anonymous
            identity.
          </Text>
          {blockedCount !== null &&
            blockedCount > 0 &&
            (confirm ? (
              <>
                <Text>
                  Clear all blocks? These people may be matched or share group
                  rooms with you again. You won’t automatically rejoin rooms.
                </Text>
                <Button
                  label="Confirm clear all blocks"
                  danger
                  busy={busy}
                  onPress={() => void clearBlocks()}
                />
                <Button
                  label="Keep blocks"
                  secondary
                  onPress={() => setConfirm(false)}
                />
              </>
            ) : (
              <Button
                label="Clear all blocks"
                secondary
                onPress={() => setConfirm(true)}
              />
            ))}
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>TEMPORARY IDENTITY</Text>
          <Text style={styles.muted}>
            Your room names and messages disappear with their rooms. Your
            anonymous credential and blocks persist until your identity changes
            or is removed.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
