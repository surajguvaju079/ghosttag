import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { positiveInteger } from 'src/safety/rate-limit.service';
import { RetentionRepository } from './retention.repository';

@Injectable()
export class RetentionService {
  private readonly batchSize: number;
  private readonly chunks: number;
  private readonly graceMs: number;
  constructor(
    private readonly repository: RetentionRepository,
    config: ConfigService,
  ) {
    this.batchSize = positiveInteger(config, 'RETENTION_BATCH_SIZE', 100, 1000);
    this.chunks = positiveInteger(
      config,
      'RETENTION_CHUNKS_PER_SWEEP',
      10,
      100,
    );
    this.graceMs = positiveInteger(
      config,
      'RETENTION_GRACE_MS',
      3_600_000,
      604_800_000,
    );
  }
  async sweep() {
    const cutoff = new Date(Date.now() - this.graceMs);
    let completed = 0;
    while (
      completed < this.chunks &&
      (await this.repository.chunk(cutoff, this.batchSize))
    )
      completed++;
    return { chunks: completed };
  }
}
