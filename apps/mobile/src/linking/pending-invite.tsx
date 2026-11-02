import { useEffect, useSyncExternalStore } from "react";
import { useRouter, useRootNavigationState } from "expo-router";
import * as Linking from "expo-linking";
import {
  parseInvite,
  rememberInvite,
  takeInvite,
  subscribeInvite,
  pendingInvite,
} from "./invites";

// Lives outside session gating to capture cold/warm invitations while screening.
export function InviteListener() {
  useEffect(() => {
    let active = true;
    void Linking.getInitialURL()
      .then((value) => {
        if (active && value) {
          const invite = parseInvite(value);
          if (invite) rememberInvite(invite);
        }
      })
      .catch(() => {});
    const listener = Linking.addEventListener("url", ({ url }) => {
      const invite = parseInvite(url);
      if (invite) rememberInvite(invite);
    });
    return () => {
      active = false;
      listener.remove();
    };
  }, []);
  return null;
}
export function PendingInviteNavigation() {
  const router = useRouter();
  const navigation = useRootNavigationState();
  const pending = useSyncExternalStore(
    subscribeInvite,
    pendingInvite,
    pendingInvite,
  );
  useEffect(() => {
    if (!navigation?.key || !pending) return;
    const invite = takeInvite();
    if (invite)
      router.replace({ pathname: "/join/[code]/[inviteId]", params: invite });
  }, [router, navigation?.key, pending]);
  return null;
}
