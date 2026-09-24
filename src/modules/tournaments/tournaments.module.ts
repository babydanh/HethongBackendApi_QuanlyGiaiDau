import { forwardRef, Module } from '@nestjs/common';
import { TournamentsService } from './tournaments.service';
import { TournamentsController } from './tournaments.controller';
import { TournamentsRepository } from './tournaments.repository';
import { BracketGeneratorService } from './bracket-generator.service';
import { TournamentSchedulerService } from './tournament-scheduler.service';
import { DatabaseModule } from '../../database/database.module';
import { SeriesModule } from '../series/series.module';
import { RedisModule } from '../../providers/redis/redis.module';
import { RegistrationLockService } from './registration-lock.service';
import { StorageModule } from '../../providers/storage/storage.module';
import { AuthModule } from '../auth/auth.module';
import { CommunitiesModule } from '../communities/communities.module';
import { MatchesModule } from '../matches/matches.module';
import { MailModule } from '../../providers/mail/mail.module';
import { VenuesModule } from '../venues/venues.module';
import { TournamentAccessService } from './services/tournament-access.service';
import { TournamentVenueService } from './services/tournament-venue.service';
import { TournamentMediaService } from './services/tournament-media.service';
import { TournamentDiscoveryService } from './services/tournament-discovery.service';
import { TournamentLifecycleService } from './services/tournament-lifecycle.service';
import { TournamentFeePolicyService } from './services/tournament-fee-policy.service';
import { TournamentStaffService } from './services/tournament-staff.service';
import { TournamentRefereeService } from './services/tournament-referee.service';
import { TournamentFollowService } from './services/tournament-follow.service';
import { TournamentResultsService } from './services/tournament-results.service';
import { TournamentDivisionService } from './services/tournament-division.service';

import { TournamentParticipantAdminService } from './services/tournament-participant-admin.service';
import { TournamentImportService } from './services/tournament-import.service';
import { TournamentBracketService } from './services/tournament-bracket.service';
import { TournamentRealtimeService } from './services/tournament-realtime.service';
import { TournamentRegistrationService } from './services/tournament-registration.service';
import { TournamentLiteService } from './services/tournament-lite.service';
import { TournamentFootballRosterService } from './services/tournament-football-roster.service';
import { TournamentPaymentRepository } from './repositories/tournament-payment.repository';
import { TournamentAdminRepository } from './repositories/tournament-admin.repository';
import { TournamentCatalogRepository } from './repositories/tournament-catalog.repository';
import { TournamentDivisionRepository } from './repositories/tournament-division.repository';
import { TournamentResultsRepository } from './repositories/tournament-results.repository';
import { TournamentBracketRepository } from './repositories/tournament-bracket.repository';
import { TournamentRatingRepository } from './repositories/tournament-rating.repository';
import { TournamentLiteRepository } from './repositories/tournament-lite.repository';
import { TournamentImportRepository } from './repositories/tournament-import.repository';
import { TournamentOperationsRepository } from './repositories/tournament-operations.repository';
import { TournamentParticipantRepository } from './repositories/tournament-participant.repository';
import { TournamentRegistrationRepository } from './repositories/tournament-registration.repository';
@Module({
  imports: [
    DatabaseModule,
    SeriesModule,
    RedisModule,
    StorageModule,
    AuthModule,
    CommunitiesModule,
    forwardRef(() => MatchesModule),
    MailModule,
    VenuesModule,
  ],
  controllers: [TournamentsController],
  providers: [
    TournamentsService,
    TournamentsRepository,
    TournamentPaymentRepository,
    TournamentAdminRepository,
    TournamentCatalogRepository,
    TournamentDivisionRepository,
    TournamentResultsRepository,
    TournamentBracketRepository,
    TournamentRatingRepository,
    TournamentLiteRepository,
    TournamentImportRepository,
    TournamentOperationsRepository,
    TournamentParticipantRepository,
    TournamentRegistrationRepository,
    TournamentAccessService,
    TournamentVenueService,
    TournamentMediaService,
    TournamentDiscoveryService,
    TournamentLifecycleService,
    TournamentFeePolicyService,
    TournamentStaffService,
    TournamentRefereeService,
    TournamentFollowService,
    TournamentResultsService,
    TournamentDivisionService,
    TournamentParticipantAdminService,
    TournamentImportService,
    TournamentBracketService,
    TournamentRealtimeService,
    TournamentRegistrationService,
    TournamentLiteService,
    TournamentFootballRosterService,
    BracketGeneratorService,
    TournamentSchedulerService,
    RegistrationLockService,
  ],
  exports: [
    TournamentsService,
    BracketGeneratorService,
    RegistrationLockService,
    TournamentsRepository,
  ],
})
export class TournamentsModule {}
