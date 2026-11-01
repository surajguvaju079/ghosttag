import { asApiError, type ApiClient } from "../api/client";
import type { JoinedRoom } from "../api/contracts";

export type JoinedRoomsState = {
  rooms: JoinedRoom[];
  loading: boolean;
  loaded: boolean;
  error?: unknown;
  workingCode?: string;
  retryAt: number;
};

// One instance per authenticated screen/session; stale responses never update it.
export class JoinedRoomsController {
  state: JoinedRoomsState = {
    rooms: [],
    loading: false,
    loaded: false,
    retryAt: 0,
  };
  private generation = 0;
  private listeners = new Set<() => void>();
  constructor(
    private api: Pick<ApiClient, "rooms" | "joinRoom">,
    private token: string,
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.state;
  private patch(update: Partial<JoinedRoomsState>) {
    this.state = { ...this.state, ...update };
    this.listeners.forEach((listener) => listener());
  }
  async refresh() {
    if (
      this.state.loading ||
      this.state.workingCode ||
      Date.now() < this.state.retryAt
    )
      return;
    const generation = this.generation;
    this.patch({ loading: true, error: undefined });
    try {
      const { rooms } = await this.api.rooms(this.token);
      if (generation === this.generation) this.patch({ rooms, loaded: true });
    } catch (error) {
      if (generation === this.generation)
        this.patch({ error, retryAt: asApiError(error).retryAt });
    } finally {
      if (generation === this.generation) this.patch({ loading: false });
    }
  }
  async rejoin(room: JoinedRoom): Promise<boolean> {
    if (this.state.workingCode || Date.now() < this.state.retryAt) return false;
    const generation = ++this.generation;
    this.patch({ loading: false, workingCode: room.code, error: undefined });
    try {
      await this.api.joinRoom(this.token, room.code);
      if (generation !== this.generation) return false;
      this.patch({
        rooms: this.state.rooms.map((item) =>
          item.code === room.code
            ? { ...item, membershipStatus: "ACTIVE" }
            : item,
        ),
      });
      return true;
    } catch (error) {
      if (generation === this.generation) {
        const failure = asApiError(error);
        const gone = ["ROOM_EXPIRED", "ROOM_NOT_FOUND"].includes(
          failure.failure.code,
        );
        this.patch({
          error,
          retryAt: failure.retryAt,
          ...(gone
            ? {
                rooms: this.state.rooms.filter(
                  (item) => item.code !== room.code,
                ),
              }
            : {}),
        });
      }
      return false;
    } finally {
      if (generation === this.generation)
        this.patch({ workingCode: undefined });
    }
  }
  cancel() {
    this.generation++;
    this.patch({ loading: false, workingCode: undefined });
  }
}

export function visibleRooms(rooms: JoinedRoom[], now: number) {
  return rooms.filter((room) => Date.parse(room.expiresAt) > now);
}
export function inviteMessage(code: string) {
  return `Join me on GhostTag! Room code: ${code}. Open GhostTag and enter this code.`;
}
