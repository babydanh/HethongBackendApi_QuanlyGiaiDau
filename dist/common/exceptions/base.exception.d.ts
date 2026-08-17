import { HttpException, HttpStatus } from '@nestjs/common';
export declare class BaseException extends HttpException {
    readonly code: string;
    readonly details: unknown;
    constructor(message: string, code: string, status: HttpStatus, details?: unknown);
}
