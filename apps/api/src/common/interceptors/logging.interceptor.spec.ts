import { ExecutionContext, HttpException, Logger } from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';

describe('HTTP privacy logging', () => {
  afterEach(() => jest.restoreAllMocks());
  it('logs only route templates and safe request IDs', async () => {
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const request = {
      method: 'POST',
      route: { path: '/api/v1/rooms/:code/messages/:messageId/reports' },
      originalUrl: '/rooms/private-ghost?text=private-content',
      headers: {
        authorization: 'Bearer private-token',
        'x-request-id': 'private-request-content',
      },
      body: { text: 'private-body' },
    };
    const response = { statusCode: 202, setHeader: jest.fn() };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
    await firstValueFrom(
      new LoggingInterceptor().intercept(context, {
        handle: () => of({ accepted: true }),
      }),
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        'POST /api/v1/rooms/:code/messages/:messageId/reports 202',
      ),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-');
    expect(response.setHeader).toHaveBeenCalledWith(
      'x-request-id',
      'private-request-content',
    );
  });
  it('logs the HTTP error status without exception contents', async () => {
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          route: { path: '/api/v1/identity' },
          headers: {},
        }),
        getResponse: () => ({ statusCode: 200, setHeader: jest.fn() }),
      }),
    } as unknown as ExecutionContext;
    await expect(
      firstValueFrom(
        new LoggingInterceptor().intercept(context, {
          handle: () =>
            throwError(() => new HttpException('private error', 429)),
        }),
      ),
    ).rejects.toBeDefined();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/identity 429'),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain('private error');
  });
});
