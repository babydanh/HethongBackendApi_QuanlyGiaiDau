import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
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
        if (Array.isArray(resObj.message)) {
          const translatedMessages = resObj.message.map((msg: string) => {
            let tMsg = msg;
            
            // Dịch lỗi 'property X should not exist'
            if (tMsg.includes('property') && tMsg.includes('should not exist')) {
              const prop = tMsg.match(/property\s+(\w+)\s+should not exist/);
              tMsg = prop ? `Thuộc tính "${prop[1]}" không được phép tồn tại` : 'Thuộc tính không hợp lệ';
            }
            
            // Dịch lỗi 'X must be one of the following values: Y'
            if (tMsg.includes('must be one of the following values:')) {
              tMsg = tMsg
                .replace('purpose must be one of the following values:', 'Mục đích thanh toán phải là một trong các giá trị:')
                .replace('REGISTRATION_FEE', 'Lệ phí đăng ký')
                .replace('TOURNAMENT_PUBLISH_FEE', 'Lệ phí công bố giải đấu')
                .replace('PLATFORM_FEE', 'Lệ phí nền tảng')
                .replace('SINGLE_ELIMINATION', 'Loại trực tiếp đơn')
                .replace('DOUBLE_ELIMINATION', 'Loại trực tiếp kép')
                .replace('ROUND_ROBIN', 'Vòng tròn tính điểm')
                .replace('GROUP_STAGE_KNOCKOUT', 'Vòng bảng + Loại trực tiếp');
            }

            // Dịch một số lỗi cơ bản khác
            tMsg = tMsg
              .replace('must be a string', 'phải là một chuỗi ký tự')
              .replace('must be a number', 'phải là một số')
              .replace('must be an UUID', 'phải là mã định danh dạng UUID hợp lệ')
              .replace('must be a boolean', 'phải là kiểu đúng/sai')
              .replace('should not be empty', 'không được để trống')
              .replace('must be a valid date', 'phải là ngày tháng hợp lệ')
              .replace('must be a valid email', 'phải là địa chỉ email hợp lệ');

            return tMsg;
          });

          message = translatedMessages.join('; ');
          details = resObj.message;
        } else {
          message = (resObj.message as string) || message;
        }
        code = (resObj.error as string) || 'HTTP_EXCEPTION';
        details = details || resObj.details || null;
      }
    } else {
      console.error('[Unhandled Exception]:', exception);
      // Che giấu chi tiết câu lệnh SQL/Internal error khỏi phía client để thân thiện và an toàn hơn
      message = 'Đã có lỗi hệ thống xảy ra. Vui lòng thử lại sau hoặc liên hệ ban quản trị.';
      code = 'INTERNAL_SERVER_ERROR';
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
