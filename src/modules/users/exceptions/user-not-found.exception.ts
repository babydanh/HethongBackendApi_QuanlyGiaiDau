import { HttpStatus } from '@nestjs/common';
import { BaseException } from '../../../common/exceptions/base.exception';

export class UserNotFoundException extends BaseException {
  constructor(identifier?: string) {
    const message = identifier
      ? `Không tìm thấy người dùng có thông tin: ${identifier}`
      : 'Không tìm thấy người dùng.';
      
    super(
      message,
      'USER_NOT_FOUND',
      HttpStatus.NOT_FOUND,
      identifier ? { identifier } : undefined,
    );
  }
}
