import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { RetentionRunner } from './retention.runner';
import { RetentionService } from './retention.service';
import { RetentionRepository } from './retention.repository';

describe('Retention scheduling and recovery', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  it('runs on startup and again after restarting the runner', async () => {
    const retention = { sweep: jest.fn().mockResolvedValue({ chunks: 0 }) };
    const first = new RetentionRunner(
      retention as unknown as RetentionService,
      new ConfigService(),
    );
    first.onModuleInit();
    await first.tick();
    expect(retention.sweep).toHaveBeenCalledTimes(1);
    await first.onModuleDestroy();
    const restarted = new RetentionRunner(
      retention as unknown as RetentionService,
      new ConfigService(),
    );
    restarted.onModuleInit();
    await restarted.tick();
    expect(retention.sweep).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(retention.sweep).toHaveBeenCalledTimes(3);
    await restarted.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(retention.sweep).toHaveBeenCalledTimes(3);
  });
  it('retries failed sweeps without logging content or exception details', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const retention = {
      sweep: jest
        .fn()
        .mockRejectedValueOnce(new Error('private data'))
        .mockResolvedValue({ chunks: 0 }),
    };
    const runner = new RetentionRunner(
      retention as unknown as RetentionService,
      new ConfigService(),
    );
    await runner.tick();
    await runner.tick();
    expect(retention.sweep).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      'Room retention sweep failed; a later sweep will retry.',
    );
    await runner.onModuleDestroy();
  });
  it('does not overlap sweeps', async () => {
    let release!: () => void;
    const retention = {
      sweep: jest.fn(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      ),
    };
    const runner = new RetentionRunner(
      retention as unknown as RetentionService,
      new ConfigService(),
    );
    const pending = runner.tick();
    const overlapping = runner.tick();
    expect(retention.sweep).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([pending, overlapping]);
    await runner.onModuleDestroy();
  });
  it('limits work per sweep and reevaluates the persisted timestamp cutoff each time', async () => {
    const repository = { chunk: jest.fn().mockResolvedValue(true) };
    const config = new ConfigService({
      RETENTION_BATCH_SIZE: 2,
      RETENTION_CHUNKS_PER_SWEEP: 3,
      RETENTION_GRACE_MS: 1000,
    });
    const service = new RetentionService(
      repository as unknown as RetentionRepository,
      config,
    );
    const now = Date.now();
    await expect(service.sweep()).resolves.toEqual({ chunks: 3 });
    expect(repository.chunk).toHaveBeenCalledTimes(3);
    expect(repository.chunk).toHaveBeenCalledWith(new Date(now - 1000), 2);
  });
});
