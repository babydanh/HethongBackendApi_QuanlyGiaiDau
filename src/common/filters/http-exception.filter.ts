import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { BaseException } from '../exceptions/base.exception';

@Catch(Error)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: Error, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = exception.message || 'Internal Server Error';
    let code = 'INTERNAL_SERVER_ERROR';
    let details: unknown = null;

    if (exception instanceof BaseException) {
      status = exception.getStatus();
      const res = exception.getResponse() as Record<string, unknown>;
      message = res.message as string;
      code = res.code as string;
      details = res.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resObj = exceptionResponse as Record<string, unknown>;
        message = (resObj.message as string) || message;
        code = (resObj.error as string) || 'HTTP_EXCEPTION';
        details = resObj.details || null;
      }
    } else {
      console.error('[Unhandled Exception]:', exception);
    }

    response.status(status).json({
      statusCode: status,
      code,
      message,
      details,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
