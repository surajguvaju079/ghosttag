import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { positiveInteger } from 'src/safety/rate-limit.service';
import { RetentionService } from './retention.service';

@Injectable()
export class RetentionRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionRunner.name);
  private readonly intervalMs: number;
  private readonly enabled: boolean;
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopped = false;
  constructor(
    private readonly retention: RetentionService,
    config: ConfigService,
  ) {
    this.intervalMs = positiveInteger(
      config,
      'RETENTION_INTERVAL_MS',
      60_000,
      86_400_000,
    );
    const setting = config.get<unknown>('RETENTION_ENABLED');
    if (setting !== undefined && setting !== 'true' && setting !== 'false')
      throw new Error('RETENTION_ENABLED must be true or false');
    this.enabled = setting !== 'false';
  }
  onModuleInit() {
    if (!this.enabled) return;
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
    this.timer.unref();
  }
  async onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
  tick(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.running) return this.running;
    this.running = this.retention
      .sweep()
      .then(() => undefined)
      .catch(() => {
        this.logger.warn(
          'Room retention sweep failed; a later sweep will retry.',
        );
      })
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }
}
