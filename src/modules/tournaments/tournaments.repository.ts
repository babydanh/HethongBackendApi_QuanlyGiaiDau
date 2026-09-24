import { Injectable } from '@nestjs/common';
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

@Injectable()
export class TournamentsRepository {
  constructor(
    private readonly tournamentPaymentRepository: TournamentPaymentRepository,
    private readonly tournamentAdminRepository: TournamentAdminRepository,
    private readonly tournamentCatalogRepository: TournamentCatalogRepository,
    private readonly tournamentDivisionRepository: TournamentDivisionRepository,
    private readonly tournamentResultsRepository: TournamentResultsRepository,
    private readonly tournamentBracketRepository: TournamentBracketRepository,
    private readonly tournamentRatingRepository: TournamentRatingRepository,
    private readonly tournamentLiteRepository: TournamentLiteRepository,
    private readonly tournamentImportRepository: TournamentImportRepository,
    private readonly tournamentOperationsRepository: TournamentOperationsRepository,
    private readonly tournamentParticipantRepository: TournamentParticipantRepository,
    private readonly tournamentRegistrationRepository: TournamentRegistrationRepository,
  ) {}

  countPaidPayments(tournamentId: string) {
    return this.tournamentPaymentRepository.countPaidPayments(tournamentId);
  }

  sumCompletedRegistrationPlatformFees(tournamentId: string) {
    return this.tournamentPaymentRepository.sumCompletedRegistrationPlatformFees(
      tournamentId,
    );
  }

  countPendingRefunds(tournamentId: string) {
    return this.tournamentPaymentRepository.countPendingRefunds(tournamentId);
  }

  isFullyRefunded(tournamentId: string) {
    return this.tournamentPaymentRepository.isFullyRefunded(tournamentId);
  }

  findCompletedParticipantPayment(participantId: string) {
    return this.tournamentPaymentRepository.findCompletedParticipantPayment(
      participantId,
    );
  }

  markParticipantPaid(participantId: string) {
    return this.tournamentPaymentRepository.markParticipantPaid(participantId);
  }
  findReferees(...args: Parameters<TournamentAdminRepository['findReferees']>) {
    return this.tournamentAdminRepository.findReferees(...args);
  }

  addStaffMember(
    ...args: Parameters<TournamentAdminRepository['addStaffMember']>
  ) {
    return this.tournamentAdminRepository.addStaffMember(...args);
  }

  removeStaffMember(
    ...args: Parameters<TournamentAdminRepository['removeStaffMember']>
  ) {
    return this.tournamentAdminRepository.removeStaffMember(...args);
  }

  isCoOrganizer(
    ...args: Parameters<TournamentAdminRepository['isCoOrganizer']>
  ) {
    return this.tournamentAdminRepository.isCoOrganizer(...args);
  }

  findStaffByTournament(
    ...args: Parameters<TournamentAdminRepository['findStaffByTournament']>
  ) {
    return this.tournamentAdminRepository.findStaffByTournament(...args);
  }

  addReferee(...args: Parameters<TournamentAdminRepository['addReferee']>) {
    return this.tournamentAdminRepository.addReferee(...args);
  }

  findRefereeById(
    ...args: Parameters<TournamentAdminRepository['findRefereeById']>
  ) {
    return this.tournamentAdminRepository.findRefereeById(...args);
  }

  findRefereeByTournamentAndUser(
    ...args: Parameters<
      TournamentAdminRepository['findRefereeByTournamentAndUser']
    >
  ) {
    return this.tournamentAdminRepository.findRefereeByTournamentAndUser(
      ...args,
    );
  }

  updateRefereeStatus(
    ...args: Parameters<TournamentAdminRepository['updateRefereeStatus']>
  ) {
    return this.tournamentAdminRepository.updateRefereeStatus(...args);
  }

  removeRefereeInvite(
    ...args: Parameters<TournamentAdminRepository['removeRefereeInvite']>
  ) {
    return this.tournamentAdminRepository.removeRefereeInvite(...args);
  }

  followTournament(
    ...args: Parameters<TournamentAdminRepository['followTournament']>
  ) {
    return this.tournamentAdminRepository.followTournament(...args);
  }

  unfollowTournament(
    ...args: Parameters<TournamentAdminRepository['unfollowTournament']>
  ) {
    return this.tournamentAdminRepository.unfollowTournament(...args);
  }

  getFollowedTournamentIds(
    ...args: Parameters<TournamentAdminRepository['getFollowedTournamentIds']>
  ) {
    return this.tournamentAdminRepository.getFollowedTournamentIds(...args);
  }

  getFollowerUserIds(
    ...args: Parameters<TournamentAdminRepository['getFollowerUserIds']>
  ) {
    return this.tournamentAdminRepository.getFollowerUserIds(...args);
  }

  getFollowedTournaments(
    ...args: Parameters<TournamentAdminRepository['getFollowedTournaments']>
  ) {
    return this.tournamentAdminRepository.getFollowedTournaments(...args);
  }
  findAll(...args: Parameters<TournamentCatalogRepository['findAll']>) {
    return this.tournamentCatalogRepository.findAll(...args);
  }

  generateUniqueInviteCode(
    ...args: Parameters<TournamentCatalogRepository['generateUniqueInviteCode']>
  ) {
    return this.tournamentCatalogRepository.generateUniqueInviteCode(...args);
  }

  findById(...args: Parameters<TournamentCatalogRepository['findById']>) {
    return this.tournamentCatalogRepository.findById(...args);
  }

  create(...args: Parameters<TournamentCatalogRepository['create']>) {
    return this.tournamentCatalogRepository.create(...args);
  }

  update(...args: Parameters<TournamentCatalogRepository['update']>) {
    return this.tournamentCatalogRepository.update(...args);
  }

  softDelete(...args: Parameters<TournamentCatalogRepository['softDelete']>) {
    return this.tournamentCatalogRepository.softDelete(...args);
  }

  archive(...args: Parameters<TournamentCatalogRepository['archive']>) {
    return this.tournamentCatalogRepository.archive(...args);
  }

  updateStatus(
    ...args: Parameters<TournamentCatalogRepository['updateStatus']>
  ) {
    return this.tournamentCatalogRepository.updateStatus(...args);
  }

  findByInviteCode(
    ...args: Parameters<TournamentCatalogRepository['findByInviteCode']>
  ) {
    return this.tournamentCatalogRepository.findByInviteCode(...args);
  }

  countActiveTournamentsByUser(
    ...args: Parameters<
      TournamentCatalogRepository['countActiveTournamentsByUser']
    >
  ) {
    return this.tournamentCatalogRepository.countActiveTournamentsByUser(
      ...args,
    );
  }

  countCreatedTournaments(
    ...args: Parameters<TournamentCatalogRepository['countCreatedTournaments']>
  ) {
    return this.tournamentCatalogRepository.countCreatedTournaments(...args);
  }

  findMyTournaments(
    ...args: Parameters<TournamentCatalogRepository['findMyTournaments']>
  ) {
    return this.tournamentCatalogRepository.findMyTournaments(...args);
  }

  findMyManagementTournaments(
    ...args: Parameters<
      TournamentCatalogRepository['findMyManagementTournaments']
    >
  ) {
    return this.tournamentCatalogRepository.findMyManagementTournaments(
      ...args,
    );
  }

  findMyWorkspace(
    ...args: Parameters<TournamentCatalogRepository['findMyWorkspace']>
  ) {
    return this.tournamentCatalogRepository.findMyWorkspace(...args);
  }

  findCategory(
    ...args: Parameters<TournamentCatalogRepository['findCategory']>
  ) {
    return this.tournamentCatalogRepository.findCategory(...args);
  }

  findByIdVenue(
    ...args: Parameters<TournamentCatalogRepository['findByIdVenue']>
  ) {
    return this.tournamentCatalogRepository.findByIdVenue(...args);
  }

  findCategoryBySlug(
    ...args: Parameters<TournamentCatalogRepository['findCategoryBySlug']>
  ) {
    return this.tournamentCatalogRepository.findCategoryBySlug(...args);
  }

  regenerateInviteCode(
    ...args: Parameters<TournamentCatalogRepository['regenerateInviteCode']>
  ) {
    return this.tournamentCatalogRepository.regenerateInviteCode(...args);
  }

  createParent(
    ...args: Parameters<TournamentCatalogRepository['createParent']>
  ) {
    return this.tournamentCatalogRepository.createParent(...args);
  }

  updateParent(
    ...args: Parameters<TournamentCatalogRepository['updateParent']>
  ) {
    return this.tournamentCatalogRepository.updateParent(...args);
  }

  findParentById(
    ...args: Parameters<TournamentCatalogRepository['findParentById']>
  ) {
    return this.tournamentCatalogRepository.findParentById(...args);
  }

  findByParentId(
    ...args: Parameters<TournamentCatalogRepository['findByParentId']>
  ) {
    return this.tournamentCatalogRepository.findByParentId(...args);
  }

  findParentsByUser(
    ...args: Parameters<TournamentCatalogRepository['findParentsByUser']>
  ) {
    return this.tournamentCatalogRepository.findParentsByUser(...args);
  }

  softDeleteParent(
    ...args: Parameters<TournamentCatalogRepository['softDeleteParent']>
  ) {
    return this.tournamentCatalogRepository.softDeleteParent(...args);
  }

  getParentWithAggregation(
    ...args: Parameters<TournamentCatalogRepository['getParentWithAggregation']>
  ) {
    return this.tournamentCatalogRepository.getParentWithAggregation(...args);
  }
  getDivisionsByTournament(
    ...args: Parameters<
      TournamentDivisionRepository['getDivisionsByTournament']
    >
  ) {
    return this.tournamentDivisionRepository.getDivisionsByTournament(...args);
  }

  findDivisionById(
    ...args: Parameters<TournamentDivisionRepository['findDivisionById']>
  ) {
    return this.tournamentDivisionRepository.findDivisionById(...args);
  }

  countDivisionParticipants(
    ...args: Parameters<
      TournamentDivisionRepository['countDivisionParticipants']
    >
  ) {
    return this.tournamentDivisionRepository.countDivisionParticipants(...args);
  }

  createDivision(
    ...args: Parameters<TournamentDivisionRepository['createDivision']>
  ) {
    return this.tournamentDivisionRepository.createDivision(...args);
  }

  updateDivision(
    ...args: Parameters<TournamentDivisionRepository['updateDivision']>
  ) {
    return this.tournamentDivisionRepository.updateDivision(...args);
  }

  deleteDivision(
    ...args: Parameters<TournamentDivisionRepository['deleteDivision']>
  ) {
    return this.tournamentDivisionRepository.deleteDivision(...args);
  }

  updateDivisionConfig(
    ...args: Parameters<TournamentDivisionRepository['updateDivisionConfig']>
  ) {
    return this.tournamentDivisionRepository.updateDivisionConfig(...args);
  }

  getParticipantsByDivision(
    ...args: Parameters<
      TournamentDivisionRepository['getParticipantsByDivision']
    >
  ) {
    return this.tournamentDivisionRepository.getParticipantsByDivision(...args);
  }
  findGroupStandings(
    ...args: Parameters<TournamentResultsRepository['findGroupStandings']>
  ) {
    return this.tournamentResultsRepository.findGroupStandings(...args);
  }

  findTournamentResultMatches(
    ...args: Parameters<
      TournamentResultsRepository['findTournamentResultMatches']
    >
  ) {
    return this.tournamentResultsRepository.findTournamentResultMatches(
      ...args,
    );
  }

  findPublicTournamentResultMembers(
    ...args: Parameters<
      TournamentResultsRepository['findPublicTournamentResultMembers']
    >
  ) {
    return this.tournamentResultsRepository.findPublicTournamentResultMembers(
      ...args,
    );
  }
  findBracket(...args: Parameters<TournamentBracketRepository['findBracket']>) {
    return this.tournamentBracketRepository.findBracket(...args);
  }

  updateBracketSlots(
    ...args: Parameters<TournamentBracketRepository['updateBracketSlots']>
  ) {
    return this.tournamentBracketRepository.updateBracketSlots(...args);
  }

  findStageById(
    ...args: Parameters<TournamentBracketRepository['findStageById']>
  ) {
    return this.tournamentBracketRepository.findStageById(...args);
  }

  updateStage(...args: Parameters<TournamentBracketRepository['updateStage']>) {
    return this.tournamentBracketRepository.updateStage(...args);
  }

  findGroupById(
    ...args: Parameters<TournamentBracketRepository['findGroupById']>
  ) {
    return this.tournamentBracketRepository.findGroupById(...args);
  }

  updateGroup(...args: Parameters<TournamentBracketRepository['updateGroup']>) {
    return this.tournamentBracketRepository.updateGroup(...args);
  }

  findParticipantsForSeeding(
    ...args: Parameters<
      TournamentBracketRepository['findParticipantsForSeeding']
    >
  ) {
    return this.tournamentBracketRepository.findParticipantsForSeeding(...args);
  }

  updateSeeds(...args: Parameters<TournamentBracketRepository['updateSeeds']>) {
    return this.tournamentBracketRepository.updateSeeds(...args);
  }

  cancelScheduledMatchesInStage(
    ...args: Parameters<
      TournamentBracketRepository['cancelScheduledMatchesInStage']
    >
  ) {
    return this.tournamentBracketRepository.cancelScheduledMatchesInStage(
      ...args,
    );
  }

  getGroupByStageId(
    ...args: Parameters<TournamentBracketRepository['getGroupByStageId']>
  ) {
    return this.tournamentBracketRepository.getGroupByStageId(...args);
  }

  createPlayoffMatch(
    ...args: Parameters<TournamentBracketRepository['createPlayoffMatch']>
  ) {
    return this.tournamentBracketRepository.createPlayoffMatch(...args);
  }

  getMaxRoundAndMatchOrder(
    ...args: Parameters<TournamentBracketRepository['getMaxRoundAndMatchOrder']>
  ) {
    return this.tournamentBracketRepository.getMaxRoundAndMatchOrder(...args);
  }

  getUserElo(...args: Parameters<TournamentRatingRepository['getUserElo']>) {
    return this.tournamentRatingRepository.getUserElo(...args);
  }

  getUserEloInTx(
    ...args: Parameters<TournamentRatingRepository['getUserEloInTx']>
  ) {
    return this.tournamentRatingRepository.getUserEloInTx(...args);
  }
  findLeaderByParticipantId(
    ...args: Parameters<
      TournamentParticipantRepository['findLeaderByParticipantId']
    >
  ) {
    return this.tournamentParticipantRepository.findLeaderByParticipantId(
      ...args,
    );
  }

  countLiteActiveRosterUsers(
    ...args: Parameters<TournamentLiteRepository['countLiteActiveRosterUsers']>
  ) {
    return this.tournamentLiteRepository.countLiteActiveRosterUsers(...args);
  }

  findLiteParticipantsWithRosters(
    ...args: Parameters<
      TournamentLiteRepository['findLiteParticipantsWithRosters']
    >
  ) {
    return this.tournamentLiteRepository.findLiteParticipantsWithRosters(
      ...args,
    );
  }

  findLitePendingPartnerParticipants(
    ...args: Parameters<
      TournamentLiteRepository['findLitePendingPartnerParticipants']
    >
  ) {
    return this.tournamentLiteRepository.findLitePendingPartnerParticipants(
      ...args,
    );
  }

  hasNonDeletedStagesOrMatches(
    ...args: Parameters<
      TournamentLiteRepository['hasNonDeletedStagesOrMatches']
    >
  ) {
    return this.tournamentLiteRepository.hasNonDeletedStagesOrMatches(...args);
  }

  pairLiteParticipantsInTx(
    ...args: Parameters<TournamentLiteRepository['pairLiteParticipantsInTx']>
  ) {
    return this.tournamentLiteRepository.pairLiteParticipantsInTx(...args);
  }

  unpairParticipantInTx(
    ...args: Parameters<TournamentLiteRepository['unpairParticipantInTx']>
  ) {
    return this.tournamentLiteRepository.unpairParticipantInTx(...args);
  }

  lockTournamentAndPair(
    ...args: Parameters<TournamentLiteRepository['lockTournamentAndPair']>
  ) {
    return this.tournamentLiteRepository.lockTournamentAndPair(...args);
  }

  lockTournamentAndUnpair(
    ...args: Parameters<TournamentLiteRepository['lockTournamentAndUnpair']>
  ) {
    return this.tournamentLiteRepository.lockTournamentAndUnpair(...args);
  }

  generateLitePairsTx(
    ...args: Parameters<TournamentLiteRepository['generateLitePairsTx']>
  ) {
    return this.tournamentLiteRepository.generateLitePairsTx(...args);
  }
  importParticipants(
    ...args: Parameters<TournamentImportRepository['importParticipants']>
  ) {
    return this.tournamentImportRepository.importParticipants(...args);
  }
  findOpsAuditLogs(
    ...args: Parameters<TournamentOperationsRepository['findOpsAuditLogs']>
  ) {
    return this.tournamentOperationsRepository.findOpsAuditLogs(...args);
  }

  cancelTournament(
    ...args: Parameters<TournamentOperationsRepository['cancelTournament']>
  ) {
    return this.tournamentOperationsRepository.cancelTournament(...args);
  }

  getFeesConfig(
    ...args: Parameters<TournamentOperationsRepository['getFeesConfig']>
  ) {
    return this.tournamentOperationsRepository.getFeesConfig(...args);
  }
  countActiveParticipants(
    ...args: Parameters<
      TournamentParticipantRepository['countActiveParticipants']
    >
  ) {
    return this.tournamentParticipantRepository.countActiveParticipants(
      ...args,
    );
  }

  findParticipantByTournamentAndUser(
    ...args: Parameters<
      TournamentParticipantRepository['findParticipantByTournamentAndUser']
    >
  ) {
    return this.tournamentParticipantRepository.findParticipantByTournamentAndUser(
      ...args,
    );
  }

  countParticipants(
    ...args: Parameters<TournamentParticipantRepository['countParticipants']>
  ) {
    return this.tournamentParticipantRepository.countParticipants(...args);
  }

  findCommunitySports(
    ...args: Parameters<TournamentParticipantRepository['findCommunitySports']>
  ) {
    return this.tournamentParticipantRepository.findCommunitySports(...args);
  }

  findFootballTeamForRegistration(
    ...args: Parameters<
      TournamentParticipantRepository['findFootballTeamForRegistration']
    >
  ) {
    return this.tournamentParticipantRepository.findFootballTeamForRegistration(
      ...args,
    );
  }

  findCommunityById(
    ...args: Parameters<TournamentParticipantRepository['findCommunityById']>
  ) {
    return this.tournamentParticipantRepository.findCommunityById(...args);
  }

  findCommunityMember(
    ...args: Parameters<TournamentParticipantRepository['findCommunityMember']>
  ) {
    return this.tournamentParticipantRepository.findCommunityMember(...args);
  }

  addCommunityMember(
    ...args: Parameters<TournamentParticipantRepository['addCommunityMember']>
  ) {
    return this.tournamentParticipantRepository.addCommunityMember(...args);
  }

  findUserProfile(
    ...args: Parameters<TournamentParticipantRepository['findUserProfile']>
  ) {
    return this.tournamentParticipantRepository.findUserProfile(...args);
  }

  findParticipants(
    ...args: Parameters<TournamentParticipantRepository['findParticipants']>
  ) {
    return this.tournamentParticipantRepository.findParticipants(...args);
  }

  findPublicParticipants(
    ...args: Parameters<
      TournamentParticipantRepository['findPublicParticipants']
    >
  ) {
    return this.tournamentParticipantRepository.findPublicParticipants(...args);
  }

  seedMockParticipants(
    ...args: Parameters<TournamentParticipantRepository['seedMockParticipants']>
  ) {
    return this.tournamentParticipantRepository.seedMockParticipants(...args);
  }

  clearMockParticipants(
    ...args: Parameters<
      TournamentParticipantRepository['clearMockParticipants']
    >
  ) {
    return this.tournamentParticipantRepository.clearMockParticipants(...args);
  }

  deleteMockParticipant(
    ...args: Parameters<
      TournamentParticipantRepository['deleteMockParticipant']
    >
  ) {
    return this.tournamentParticipantRepository.deleteMockParticipant(...args);
  }

  updateParticipantStatus(
    ...args: Parameters<
      TournamentParticipantRepository['updateParticipantStatus']
    >
  ) {
    return this.tournamentParticipantRepository.updateParticipantStatus(
      ...args,
    );
  }

  assignNextAvailableSeed(
    ...args: Parameters<
      TournamentParticipantRepository['assignNextAvailableSeed']
    >
  ) {
    return this.tournamentParticipantRepository.assignNextAvailableSeed(
      ...args,
    );
  }

  lockParticipantRoster(
    ...args: Parameters<
      TournamentParticipantRepository['lockParticipantRoster']
    >
  ) {
    return this.tournamentParticipantRepository.lockParticipantRoster(...args);
  }

  unlockParticipantRoster(
    ...args: Parameters<
      TournamentParticipantRepository['unlockParticipantRoster']
    >
  ) {
    return this.tournamentParticipantRepository.unlockParticipantRoster(
      ...args,
    );
  }

  findFootballEntryForParticipant(
    ...args: Parameters<
      TournamentParticipantRepository['findFootballEntryForParticipant']
    >
  ) {
    return this.tournamentParticipantRepository.findFootballEntryForParticipant(
      ...args,
    );
  }

  getFootballEntryRoster(
    ...args: Parameters<
      TournamentParticipantRepository['getFootballEntryRoster']
    >
  ) {
    return this.tournamentParticipantRepository.getFootballEntryRoster(...args);
  }

  respondFootballRoster(
    ...args: Parameters<
      TournamentParticipantRepository['respondFootballRoster']
    >
  ) {
    return this.tournamentParticipantRepository.respondFootballRoster(...args);
  }

  updateFootballRoster(
    ...args: Parameters<TournamentParticipantRepository['updateFootballRoster']>
  ) {
    return this.tournamentParticipantRepository.updateFootballRoster(...args);
  }

  lockFootballEntry(
    ...args: Parameters<TournamentParticipantRepository['lockFootballEntry']>
  ) {
    return this.tournamentParticipantRepository.lockFootballEntry(...args);
  }

  findParticipantById(
    ...args: Parameters<TournamentParticipantRepository['findParticipantById']>
  ) {
    return this.tournamentParticipantRepository.findParticipantById(...args);
  }

  isUserParticipant(
    ...args: Parameters<TournamentParticipantRepository['isUserParticipant']>
  ) {
    return this.tournamentParticipantRepository.isUserParticipant(...args);
  }

  getParticipantRosters(
    ...args: Parameters<
      TournamentParticipantRepository['getParticipantRosters']
    >
  ) {
    return this.tournamentParticipantRepository.getParticipantRosters(...args);
  }

  addRoster(...args: Parameters<TournamentParticipantRepository['addRoster']>) {
    return this.tournamentParticipantRepository.addRoster(...args);
  }

  removeRoster(
    ...args: Parameters<TournamentParticipantRepository['removeRoster']>
  ) {
    return this.tournamentParticipantRepository.removeRoster(...args);
  }

  findUserByEmailOrPhone(
    ...args: Parameters<
      TournamentParticipantRepository['findUserByEmailOrPhone']
    >
  ) {
    return this.tournamentParticipantRepository.findUserByEmailOrPhone(...args);
  }

  assignReservedSlot(
    ...args: Parameters<TournamentParticipantRepository['assignReservedSlot']>
  ) {
    return this.tournamentParticipantRepository.assignReservedSlot(...args);
  }

  findUserByEmail(
    ...args: Parameters<TournamentParticipantRepository['findUserByEmail']>
  ) {
    return this.tournamentParticipantRepository.findUserByEmail(...args);
  }

  findUserBasicById(
    ...args: Parameters<TournamentParticipantRepository['findUserBasicById']>
  ) {
    return this.tournamentParticipantRepository.findUserBasicById(...args);
  }
  reopenRegistration(
    ...args: Parameters<TournamentRegistrationRepository['reopenRegistration']>
  ) {
    return this.tournamentRegistrationRepository.reopenRegistration(...args);
  }

  registerParticipant(
    ...args: Parameters<TournamentRegistrationRepository['registerParticipant']>
  ) {
    return this.tournamentRegistrationRepository.registerParticipant(...args);
  }

  acceptPartnerInvite(
    ...args: Parameters<TournamentRegistrationRepository['acceptPartnerInvite']>
  ) {
    return this.tournamentRegistrationRepository.acceptPartnerInvite(...args);
  }

  rejectPartnerInvite(
    ...args: Parameters<TournamentRegistrationRepository['rejectPartnerInvite']>
  ) {
    return this.tournamentRegistrationRepository.rejectPartnerInvite(...args);
  }

  joinTeam(...args: Parameters<TournamentRegistrationRepository['joinTeam']>) {
    return this.tournamentRegistrationRepository.joinTeam(...args);
  }

  withdraw(...args: Parameters<TournamentRegistrationRepository['withdraw']>) {
    return this.tournamentRegistrationRepository.withdraw(...args);
  }

  kickParticipant(
    ...args: Parameters<TournamentRegistrationRepository['kickParticipant']>
  ) {
    return this.tournamentRegistrationRepository.kickParticipant(...args);
  }

  myRegistration(
    ...args: Parameters<TournamentRegistrationRepository['myRegistration']>
  ) {
    return this.tournamentRegistrationRepository.myRegistration(...args);
  }

  cancelPendingRegistrationsIfFull(
    ...args: Parameters<
      TournamentRegistrationRepository['cancelPendingRegistrationsIfFull']
    >
  ) {
    return this.tournamentRegistrationRepository.cancelPendingRegistrationsIfFull(
      ...args,
    );
  }

  processPendingRegistrationsTimeout(
    ...args: Parameters<
      TournamentRegistrationRepository['processPendingRegistrationsTimeout']
    >
  ) {
    return this.tournamentRegistrationRepository.processPendingRegistrationsTimeout(
      ...args,
    );
  }

  // ──────── Finalize stage ────────

  // ──────── Playoff methods ────────

  // ─── Tournament Follow ──────────────────────────────────────

  // ──────── Lite pairing helpers ────────
}
