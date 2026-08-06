import { IsArray, ArrayNotEmpty, IsString, IsOptional, IsUUID } from 'class-validator';

/**
 * Body cho POST /tournaments/:id/mock-participants.
 * - names: mảng tên VĐVảo, bắt buộc, mỗi phần tử là chuỗi.
 * - divisionId: optional, phải là UUID hợp lệ (ngăn chuỗi rỗng/'' -> Postgres
 *   22P02 invalid input syntax for type uuid -> 500).
 */
export class SeedMockParticipantsDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'names không được rỗng' })
  @IsString({ each: true, message: 'Mỗi tên VĐV phải là chuỗi' })
  names: string[];

  @IsOptional()
  @IsUUID('4', { message: 'divisionId phải là UUID hợp lệ' })
  divisionId?: string;
}
