import { HttpStatus } from '@nestjs/common';
import { BaseException } from '../../../common/exceptions/base.exception';

export class ExclusionRuleException extends BaseException {
  constructor(message?: string) {
    super(
      message || 'Bạn đã nhận Vé Thẳng và bị khóa không được đăng ký tiếp chặng giải đấu này.',
      'EXCLUSION_RULE_VIOLATION',
      HttpStatus.BAD_REQUEST,
    );
  }
}
