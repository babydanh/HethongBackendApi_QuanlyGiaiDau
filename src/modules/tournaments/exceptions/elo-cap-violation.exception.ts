import { HttpStatus } from '@nestjs/common';
import { BaseException } from '../../../common/exceptions/base.exception';

export class EloCapViolationException extends BaseException {
  constructor(message: string, details?: unknown) {
    super(
      message || 'Điểm ELO của người chơi không hợp lệ với yêu cầu của giải đấu.',
      'ELO_CAP_VIOLATION',
      HttpStatus.BAD_REQUEST,
      details,
    );
  }
}
