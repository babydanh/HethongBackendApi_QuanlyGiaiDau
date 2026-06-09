import { HttpException, HttpStatus } from '@nestjs/common';

export class BaseException extends HttpException {
  public readonly code: string;
  public readonly details: any;

  constructor(
    message: string,
    code: string,
    status: HttpStatus,
    details?: any,
  ) {
    super(
      {
        message,
        code,
        details,
      },
      status,
    );
    this.code = code;
    this.details = details;
    this.name = this.constructor.name;
  }
}
