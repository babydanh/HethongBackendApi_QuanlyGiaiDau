import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { LivestreamHealthJobData } from './livestream-health.processor';

@Injectable()
export class LivestreamHealthQueue implements OnModuleInit {
  constructor(
    @InjectQueue('livestream-health')
    private readonly queue: Queue<LivestreamHealthJobData>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      'health-sweep',
      { kind: 'sweep' },
      {
        jobId: 'livestream-health-sweep',
        repeat: { every: 30_000 },
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  }
}
