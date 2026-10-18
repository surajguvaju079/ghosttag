import { ForbiddenException } from '@nestjs/common';
import type { Socket } from 'socket.io';
import { IdentityCredentialService } from 'src/common/auth/identity-credential.service';
import { RoomService } from 'src/room/room.service';
import { MessageGateway, publicSocketError } from './message.gateway';
import { MessageAccess, MessageService } from './message.service';

const message = {
  messageId: 'm_' + 'a'.repeat(32),
  code: 'GH-1234',
  text: 'hello',
  createdAt: new Date().toISOString(),
  author: {
    participantId: 'p_' + 'b'.repeat(32),
    ghostName: 'Quiet Raven',
    ghostAvatar: 'raven',
  },
};

describe('MessageGateway delivery authorization', () => {
  const access = {
    room: { code: message.code },
    membership: { publicId: message.author.participantId },
  } as MessageAccess;
  const messages = {
    access: jest.fn(
      (
        hash: string,
        code: unknown,
        action: (value: MessageAccess) => unknown,
      ) => Promise.resolve(action(access)),
    ),
    assertLive: jest.fn(),
    send: jest.fn(),
  };
  const credentials = {
    verify: jest.fn().mockResolvedValue({ userId: 'internal' }),
  };
  const gateway = new MessageGateway(
    messages as unknown as MessageService,
    credentials as unknown as IdentityCredentialService,
    {} as RoomService,
  );
  function socket(id: string) {
    return {
      id,
      connected: true,
      data: { credentialHash: id, userId: id },
      volatile: { emit: jest.fn() },
      emit: jest.fn(),
      disconnect: jest.fn(),
    };
  }
  const sender = socket('sender');
  const receiver = socket('receiver');
  beforeEach(() => {
    jest.clearAllMocks();
    gateway.handleConnection(sender as unknown as Socket);
    gateway.handleConnection(receiver as unknown as Socket);
    messages.access.mockImplementation((_hash, _code, action) =>
      Promise.resolve(action(access)),
    );
    messages.send.mockResolvedValue({ message, replayed: false });
  });
  afterEach(() => {
    gateway.handleDisconnect(sender as unknown as Socket);
    gateway.handleDisconnect(receiver as unknown as Socket);
  });
  it('checks recipients at delivery time and emits only to permitted subscriptions', async () => {
    await gateway.subscribe(receiver as unknown as Socket, {
      code: message.code,
    });
    messages.access.mockRejectedValueOnce(
      new ForbiddenException({
        code: 'ROOM_MEMBERSHIP_INACTIVE',
        message: 'Active membership required',
      }),
    );
    await gateway.send(sender as unknown as Socket, {});
    expect(receiver.volatile.emit).not.toHaveBeenCalled();
    expect(receiver.emit).toHaveBeenCalledWith(
      'room:invalidated',
      expect.objectContaining({ code: message.code }),
    );
    expect(sender.volatile.emit).not.toHaveBeenCalled();
  });
  it('does not broadcast a duplicate send retry', async () => {
    await gateway.subscribe(receiver as unknown as Socket, {
      code: message.code,
    });
    messages.send.mockResolvedValue({ message, replayed: true });
    await gateway.send(sender as unknown as Socket, {});
    expect(receiver.volatile.emit).not.toHaveBeenCalled();
  });
  it('checks access immediately before enqueueing under the authorization callback', async () => {
    await gateway.subscribe(receiver as unknown as Socket, {
      code: message.code,
    });
    await gateway.send(sender as unknown as Socket, {});
    expect(receiver.volatile.emit).toHaveBeenCalledWith(
      'message:created',
      message,
    );
    expect(messages.access).toHaveBeenLastCalledWith(
      'receiver',
      message.code,
      expect.any(Function),
    );
  });
  it('unsubscription stops subsequent delivery', async () => {
    await gateway.subscribe(receiver as unknown as Socket, {
      code: message.code,
    });
    await gateway.unsubscribe(receiver as unknown as Socket, {
      code: message.code,
    });
    await gateway.send(sender as unknown as Socket, {});
    expect(receiver.volatile.emit).not.toHaveBeenCalled();
  });
  it('cancels pending subscribe when unsubscribe wins the race', async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    messages.access.mockImplementationOnce(async (_hash, _code, action) => {
      await blocked;
      return action(access);
    });
    const pending = gateway.subscribe(receiver as unknown as Socket, {
      code: message.code,
    });
    await gateway.unsubscribe(receiver as unknown as Socket, {
      code: message.code,
    });
    release();
    expect(await pending).toMatchObject({
      ok: true,
      data: { subscribed: false },
    });
    await gateway.send(sender as unknown as Socket, {});
    expect(receiver.volatile.emit).not.toHaveBeenCalled();
  });

  it('removes the prior subscription if replacement authorization fails', async () => {
    await gateway.subscribe(receiver as unknown as Socket, {
      code: message.code,
    });
    messages.access.mockRejectedValueOnce(
      new ForbiddenException({
        code: 'ROOM_MEMBERSHIP_INACTIVE',
        message: 'Active membership required',
      }),
    );
    expect(
      await gateway.subscribe(receiver as unknown as Socket, {
        code: message.code,
      }),
    ).toMatchObject({ ok: false });
    await gateway.send(sender as unknown as Socket, {});
    expect(receiver.volatile.emit).not.toHaveBeenCalled();
    expect(receiver.emit).toHaveBeenCalledWith(
      'room:invalidated',
      expect.objectContaining({ code: message.code }),
    );
  });

  it('sanitizes unexpected errors', () => {
    expect(
      publicSocketError(new Error('private database information')),
    ).toEqual({
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    });
  });
});
