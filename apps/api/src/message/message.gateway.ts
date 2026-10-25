import { RateLimitService } from 'src/safety/rate-limit.service';
import {
  ForbiddenException,
  HttpException,
  OnModuleDestroy,
} from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { IdentityCredentialService } from 'src/common/auth/identity-credential.service';
import { RoomService } from 'src/room/room.service';
import { MessageAccess, MessageService } from './message.service';
import { payload, roomCode } from './message.validation';

interface Subscription {
  generation: symbol;
  roomId: string;
  membershipId: string;
}
interface ConnectionState {
  socket: Socket;
  hash: string;
  userId: string;
  network: string;
  rooms: Map<string, Subscription>;
  versions: Map<string, symbol>;
}

export function publicSocketError(error: unknown) {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (
      typeof response === 'object' &&
      'code' in response &&
      'message' in response &&
      typeof response.code === 'string' &&
      typeof response.message === 'string'
    ) {
      return {
        statusCode: error.getStatus(),
        code: response.code,
        message: response.message,
        ...('retryAfterMs' in response &&
        typeof response.retryAfterMs === 'number'
          ? { retryAfterMs: response.retryAfterMs }
          : {}),
      };
    }
  }
  return {
    statusCode: 500,
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Internal server error',
  };
}

@WebSocketGateway({
  namespace: '/rooms',
  transports: ['websocket'],
  maxHttpBufferSize: 16_384,
})
export class MessageGateway
  implements
    OnGatewayInit<Namespace>,
    OnGatewayConnection<Socket>,
    OnGatewayDisconnect<Socket>,
    OnModuleDestroy
{
  private readonly connections = new Map<string, ConnectionState>();
  private timer?: ReturnType<typeof setInterval>;
  private sweeping = false;
  private stopped = false;
  private removeLeaveListener?: () => void;

  constructor(
    private readonly messages: MessageService,
    private readonly credentials: IdentityCredentialService,
    private readonly rooms: RoomService,
    private readonly rates: RateLimitService,
  ) {}

  afterInit(server: Namespace) {
    this.removeLeaveListener = this.rooms.onLeave(({ userId, code }) => {
      for (const state of this.connections.values()) {
        if (state.userId !== userId) continue;
        state.versions.set(code, Symbol());
        const version = state.rooms.get(code);
        if (version)
          this.invalidate(state, code, version, {
            statusCode: 403,
            code: 'ROOM_MEMBERSHIP_INACTIVE',
            message: 'Active room membership is required',
          });
      }
    });
    server.use((socket, next) => {
      void (async () => {
        try {
          const network = socket.request.socket.remoteAddress ?? 'unknown';
          this.rates.consume('WS_CONNECT', undefined, network);
          const hash = this.credentials.hashToken(socket.handshake.auth.token);
          socket.handshake.auth = {};
          const credential = await this.credentials.verify(hash);
          this.rates.consume('WS_CONNECT', credential.userId);
          socket.data = { credentialHash: hash, userId: credential.userId };
          next();
        } catch (error) {
          socket.handshake.auth = {};
          const failure = Object.assign(new Error('Authentication failed'), {
            data: publicSocketError(error),
          });
          next(failure);
        }
      })();
    });
    this.timer = setInterval(() => {
      void this.sweep();
    }, 1000);
    this.timer.unref();
  }

  handleConnection(socket: Socket) {
    const data = socket.data as { credentialHash: string; userId: string };
    this.connections.set(socket.id, {
      socket,
      hash: data.credentialHash,
      userId: data.userId,
      network: socket.request?.socket.remoteAddress ?? 'unknown',
      rooms: new Map(),
      versions: new Map(),
    });
  }

  handleDisconnect(socket: Socket) {
    this.connections.delete(socket.id);
  }

  onModuleDestroy() {
    this.stopped = true;
    this.removeLeaveListener?.();
    if (this.timer) clearInterval(this.timer);
    this.connections.clear();
  }

  @SubscribeMessage('room:subscribe')
  subscribe(@ConnectedSocket() socket: Socket, @MessageBody() value: unknown) {
    return this.run(socket, async (state) => {
      this.rates.consume('WS_SUBSCRIBE', state.userId, state.network);
      const code = roomCode(payload(value, ['code']).code);
      const version = Symbol();
      const previous = state.rooms.get(code);
      state.rooms.delete(code);
      state.versions.set(code, version);
      try {
        return await this.messages.access(state.hash, code, (access) => {
          this.messages.assertLive(access);
          const subscribed =
            socket.connected && state.versions.get(code) === version;
          if (subscribed)
            state.rooms.set(code, {
              generation: version,
              roomId: access.room.id,
              membershipId: access.membership.id,
            });
          return {
            code,
            subscribed,
            participant: {
              participantId: access.membership.publicId,
              ghostName: access.membership.ghostName,
              ghostAvatar: access.membership.ghostAvatar,
              role: access.membership.role,
            },
          };
        });
      } catch (error) {
        // A failed replacement removed a formerly active subscription. Notify the
        // client, without invalidating a newer overlapping subscription.
        if (
          previous &&
          socket.connected &&
          state.versions.get(code) === version
        ) {
          socket.emit('room:invalidated', {
            code,
            error: publicSocketError(error),
          });
        }
        throw error;
      }
    });
  }

  @SubscribeMessage('room:unsubscribe')
  unsubscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() value: unknown,
  ) {
    return this.run(socket, async (state) => {
      const code = roomCode(payload(value, ['code']).code);
      // Clear immediately, even if credential checking is waiting on PostgreSQL.
      state.versions.set(code, Symbol());
      state.rooms.delete(code);
      await this.credentials.verify(state.hash);
      return { code, subscribed: false };
    });
  }

  @SubscribeMessage('message:send')
  send(@ConnectedSocket() socket: Socket, @MessageBody() value: unknown) {
    return this.run(socket, async (state) => {
      this.rates.consume('MESSAGE_SEND', state.userId, state.network);
      const result = await this.messages.send(state.hash, value);
      if (!result.replayed) await this.deliver(result.message);
      return result;
    });
  }

  private async run<T>(
    socket: Socket,
    action: (state: ConnectionState) => Promise<T>,
  ) {
    const state = this.connections.get(socket.id);
    if (!state || this.stopped)
      return {
        ok: false,
        error: {
          statusCode: 401,
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required',
        },
      };
    try {
      return { ok: true, data: await action(state) };
    } catch (error) {
      const failure = publicSocketError(error);
      if (failure.statusCode === 401) this.disconnect(state, failure);
      return { ok: false, error: failure };
    }
  }

  private async deliver(
    message: Awaited<ReturnType<MessageService['send']>>['message'],
  ) {
    await Promise.all(
      [...this.connections.values()].map(async (state) => {
        const version = state.rooms.get(message.code);
        if (!version) return;
        try {
          await this.messages.delivery(
            state.hash,
            message.code,
            message.messageId,
            (access, persisted) => {
              if (
                this.stopped ||
                !state.socket.connected ||
                state.rooms.get(message.code) !== version
              )
                return;
              this.assertSubscription(access, version);
              this.messages.assertLive(access);
              // Enqueue under the credential and room locks; never use unchecked room broadcasts.
              state.socket.volatile.emit('message:created', persisted);
            },
          );
        } catch (error) {
          this.invalidate(
            state,
            message.code,
            version,
            publicSocketError(error),
          );
        }
      }),
    );
  }

  async sweep() {
    if (this.sweeping || this.stopped) return;
    this.sweeping = true;
    try {
      await Promise.all(
        [...this.connections.values()].map(async (state) => {
          try {
            await this.credentials.verify(state.hash);
          } catch (error) {
            this.disconnect(state, publicSocketError(error));
            return;
          }
          for (const [code, version] of [...state.rooms]) {
            try {
              await this.messages.access(state.hash, code, (access) =>
                this.assertSubscription(access, version),
              );
            } catch (error) {
              this.invalidate(state, code, version, publicSocketError(error));
            }
          }
        }),
      );
    } finally {
      this.sweeping = false;
    }
  }

  private assertSubscription(
    access: MessageAccess,
    subscription: Subscription,
  ) {
    if (
      access.room.id !== subscription.roomId ||
      access.membership.id !== subscription.membershipId
    ) {
      throw new ForbiddenException({
        code: 'ROOM_MEMBERSHIP_INACTIVE',
        message: 'Subscribe again to this room',
      });
    }
  }

  private disconnect(
    state: ConnectionState,
    error: ReturnType<typeof publicSocketError>,
  ) {
    state.rooms.clear();
    if (!this.stopped && state.socket.connected) {
      state.socket.emit('session:invalidated', { error });
      state.socket.disconnect(true);
    }
    this.connections.delete(state.socket.id);
  }

  private invalidate(
    state: ConnectionState,
    code: string,
    version: Subscription,
    error: ReturnType<typeof publicSocketError>,
  ) {
    if (error.statusCode === 401) {
      this.disconnect(state, error);
      return;
    }
    if (state.rooms.get(code) !== version) return;
    state.rooms.delete(code);
    state.versions.set(code, Symbol());
    if (!this.stopped && state.socket.connected)
      state.socket.emit('room:invalidated', { code, error });
  }
}
