import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { LiveSessionRepository } from './live-session.repository';
import { LiveSessionService } from './live-session.service';

export interface LivestreamHealthJobData {
  readonly kind: 'sweep';
}

const HEALTH_CHECK_CONCURRENCY = 4;

@Processor('livestream-health')
export class LivestreamHealthProcessor extends WorkerHost {
  constructor(
    private readonly liveSessionRepository: LiveSessionRepository,
    private readonly liveSessionService: LiveSessionService,
  ) {
    super();
  }

  async process(job: Job<LivestreamHealthJobData>): Promise<void> {
    if (job.data.kind !== 'sweep') {
      return;
    }

    const sessions = await this.liveSessionRepository.listActiveLiveSessions();
    for (
      let index = 0;
      index < sessions.length;
      index += HEALTH_CHECK_CONCURRENCY
    ) {
      const batch = sessions.slice(index, index + HEALTH_CHECK_CONCURRENCY);
      await Promise.allSettled(
        batch.map((session) =>
          this.liveSessionService.checkSessionHealth(session.id),
        ),
      );
    }
  }
}
