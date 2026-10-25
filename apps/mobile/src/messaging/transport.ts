import { io } from "socket.io-client";
import { ApiError } from "../api/client";
import type { Ack } from "../api/contracts";
export interface Transport {
  on(event: string, listener: (data?: any) => void): void;
  request<T>(event: string, payload: object): Promise<T>;
  connect(): void;
  disconnect(): void;
}
export function socketTransport(origin: string, token: string): Transport {
  // Our controller schedules reconnects, including server-provided rate-limit delays.
  const socket = io(`${origin}/rooms`, {
    auth: { token },
    transports: ["websocket"],
    autoConnect: false,
    reconnection: false,
    timeout: 12000,
  });
  return {
    on: (event, listener) => {
      socket.on(event, listener);
    },
    connect: () => {
      socket.connect();
    },
    disconnect: () => {
      socket.removeAllListeners();
      socket.disconnect();
    },
    request: <T>(event: string, payload: object) =>
      new Promise<T>((resolve, reject) => {
        socket
          .timeout(12000)
          .emit(event, payload, (error: Error | null, result: Ack<T>) => {
            if (error || !result)
              reject(
                new ApiError({
                  statusCode: 0,
                  code: "ACK_TIMEOUT",
                  message: "Acknowledgement timed out",
                }),
              );
            else if (!result.ok) reject(new ApiError(result.error));
            else resolve(result.data);
          });
      }),
  };
}
