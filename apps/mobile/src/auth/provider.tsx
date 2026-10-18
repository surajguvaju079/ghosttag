import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ApiClient, configuration, friendlyError } from "../api/client";
import { browserPreview, credentialStore } from "./credential-store";
import { Session } from "./session";
import { Button, Screen, Text, styles, palette } from "../ui/primitives";
import { ActivityIndicator, AppState, View } from "react-native";

function createRuntime() {
  try {
    const config = configuration(
      process.env.EXPO_PUBLIC_API_URL,
      process.env.EXPO_PUBLIC_SOCKET_URL,
    );
    let session: Session;
    const api = new ApiClient(config.apiUrl, fetch, (token) =>
      session.invalidateCredential(token),
    );
    session = new Session(credentialStore, api);
    return { api, session, socketUrl: config.socketUrl };
  } catch {
    return null;
  }
}
type Runtime = NonNullable<ReturnType<typeof createRuntime>>;
const Context = createContext<(Runtime & { token: string }) | null>(null);
export function useSession() {
  const context = useContext(Context);
  if (!context) throw new Error("Session provider unavailable");
  return context;
}
export function SessionProvider({ children }: { children: ReactNode }) {
  const [runtime] = useState(createRuntime);
  return runtime ? (
    <SessionGate runtime={runtime}>{children}</SessionGate>
  ) : (
    <Screen>
      <View style={styles.center}>
        <Text style={styles.title}>One quick setup.</Text>
        <Text style={styles.muted}>
          Set EXPO_PUBLIC_API_URL to your reachable API URL, including /api/v1.
          Restart Expo after changing environment variables.
        </Text>
      </View>
    </Screen>
  );
}
function SessionGate({
  runtime,
  children,
}: {
  runtime: Runtime;
  children: ReactNode;
}) {
  const state = useSyncExternalStore(
    runtime.session.subscribe,
    runtime.session.snapshot,
    runtime.session.snapshot,
  );
  const [resetting, setResetting] = useState(false);
  useEffect(() => {
    void runtime.session.bootstrap();
    const listener = AppState.addEventListener("change", (next) => {
      if (next === "active") void runtime.session.revalidate();
    });
    return () => listener.remove();
  }, [runtime]);
  if (state.status !== "ready" || !state.token)
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.logo}>
            GhostTag<Text style={{ color: palette.purple }}>✦</Text>
          </Text>
          <Text style={styles.title}>
            {state.status === "invalid"
              ? "A fresh start?"
              : state.status === "error"
                ? "Couldn’t connect."
                : "Finding your ghost…"}
          </Text>
          {state.status === "loading" ? (
            <ActivityIndicator color={palette.purple} />
          ) : (
            <>
              <Text style={styles.muted}>
                {state.status === "invalid"
                  ? "This anonymous session is no longer available. Starting fresh creates a new ghost and will not restore your previous room memberships."
                  : friendlyError(state.error)}
              </Text>
              <Button
                label={state.status === "invalid" ? "Start fresh" : "Try again"}
                busy={resetting}
                onPress={() => {
                  if (state.status === "invalid") {
                    setResetting(true);
                    void runtime.session
                      .startFresh()
                      .finally(() => setResetting(false));
                  } else void runtime.session.bootstrap();
                }}
              />
            </>
          )}
          {browserPreview && (
            <Text style={styles.caption}>
              Browser preview • your session lasts until this page reloads.
            </Text>
          )}
        </View>
      </Screen>
    );
  return (
    <Context.Provider value={{ ...runtime, token: state.token }}>
      {children}
    </Context.Provider>
  );
}
