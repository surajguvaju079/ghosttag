/// <reference types="node" />
import { pathToFileURL } from "node:url";
import { io } from "socket.io-client";
import { configuration } from "../src/api/client";

// Read-only probe: no identity creation, room writes, credentials, or private content.
export async function checkLocal(apiUrl: string, socketUrl?: string) {
  const config = configuration(apiUrl, socketUrl);
  const response = await fetch(`${config.apiUrl}/health`, {
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  const health = await response.json();
  if (
    !response.ok ||
    health.status !== "ok" ||
    health.services?.database !== "ok"
  )
    throw new Error("API health or PostgreSQL check failed");
  await new Promise<void>((resolve, reject) => {
    const socket = io(`${config.socketUrl}/rooms`, {
      transports: ["websocket"],
      autoConnect: false,
      reconnection: false,
      timeout: 5000,
    });
    const timer = setTimeout(
      () => finish(new Error("Socket.IO namespace check timed out")),
      6000,
    );
    function finish(error?: Error) {
      clearTimeout(timer);
      socket.removeAllListeners();
      socket.disconnect();
      if (error) reject(error);
      else resolve();
    }
    socket.on("connect", () =>
      finish(new Error("Unauthenticated socket was unexpectedly accepted")),
    );
    socket.on("connect_error", (error) => {
      if (
        error.data?.statusCode === 401 &&
        error.data?.code === "AUTHENTICATION_REQUIRED"
      )
        finish();
      else
        finish(
          new Error(
            error.data?.statusCode === 429
              ? "Socket check rate limited; wait before retrying"
              : "Could not verify the authenticated /rooms namespace",
          ),
        );
    });
    socket.connect();
  });
  return config;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const apiUrl = process.argv[2] || process.env.EXPO_PUBLIC_API_URL;
  if (!apiUrl) {
    console.error(
      "Usage: pnpm --filter @ghosttag/mobile check:local <http://reachable-host:port/api/v1> [socket-origin]",
    );
    process.exitCode = 1;
  } else {
    checkLocal(apiUrl, process.argv[3] || process.env.EXPO_PUBLIC_SOCKET_URL)
      .then((config) => {
        console.log(`PASS API + PostgreSQL: ${config.apiUrl}/health`);
        console.log(
          `PASS Socket.IO: ${config.socketUrl}/rooms rejects missing credentials`,
        );
        console.log(
          "Host-side connectivity verified. Repeat the health check from each device; this does not prove phone routing or native UI behavior.",
        );
      })
      .catch(() => {
        console.error(
          "FAIL Local API/database or Socket.IO check. Verify the API process, port, URL, database, firewall and proxy configuration. No credential was created.",
        );
        process.exitCode = 1;
      });
  }
}
