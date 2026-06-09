import { HttpStatus } from '@nestjs/common';
import { BaseException } from '../../../common/exceptions/base.exception';

export class InvalidCredentialsException extends BaseException {
  constructor() {
    super(
      'Mật khẩu hoặc email không chính xác.',
      'INVALID_CREDENTIALS',
      HttpStatus.UNAUTHORIZED,
    );
  }
}
