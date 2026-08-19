import { IsIn } from 'class-validator';

export class UpdateCommunityReportStatusDto {
  @IsIn(['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED'])
  status!: 'OPEN' | 'REVIEWING' | 'RESOLVED' | 'DISMISSED';
}
