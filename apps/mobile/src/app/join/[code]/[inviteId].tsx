import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { useSession } from "../../../auth/provider";
import { validInvite } from "../../../linking/invites";
import { ApiError, friendlyError } from "../../../api/client";
import { Banner, Button, Screen, Text, styles } from "../../../ui/primitives";
export default function JoinInvite() {
  const params = useLocalSearchParams<{ code: string; inviteId: string }>();
  const { api, token } = useSession();
  const router = useRouter();
  const invite = validInvite(
    typeof params.code === "string" ? params.code : "",
    typeof params.inviteId === "string" ? params.inviteId : "",
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  async function join() {
    if (
      !invite ||
      busy ||
      (error instanceof ApiError && Date.now() < error.retryAt)
    )
      return;
    setBusy(true);
    setError(undefined);
    try {
      const code = await api.joinInvite(token, invite.code, invite.inviteId);
      router.replace({ pathname: "/room/[code]", params: { code } });
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <View style={styles.center}>
        <Text style={styles.title}>
          {invite ? "You’re invited" : "That link looks off"}
        </Text>
        {invite && (
          <>
            <Text style={styles.muted}>
              Join room {invite.code}. Its availability and access will be
              checked before you enter.
            </Text>
            <Button label="Join room" busy={busy} onPress={() => void join()} />
          </>
        )}
        {error !== undefined && <Banner>{friendlyError(error)}</Banner>}
        <Button
          label="Back to Home"
          secondary
          onPress={() => router.replace("/")}
        />
      </View>
    </Screen>
  );
}
