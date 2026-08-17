"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpExceptionFilter = void 0;
const common_1 = require("@nestjs/common");
const base_exception_1 = require("../exceptions/base.exception");
let HttpExceptionFilter = class HttpExceptionFilter {
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        let status = common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        let message = exception.message || 'Internal Server Error';
        let code = 'INTERNAL_SERVER_ERROR';
        let details = null;
        if (exception instanceof base_exception_1.BaseException) {
            status = exception.getStatus();
            const res = exception.getResponse();
            message = res.message;
            code = res.code;
            details = res.details;
        }
        else if (exception instanceof common_1.HttpException) {
            status = exception.getStatus();
            const exceptionResponse = exception.getResponse();
            if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
                const resObj = exceptionResponse;
                if (Array.isArray(resObj.message)) {
                    const translatedMessages = resObj.message.map((msg) => {
                        let tMsg = msg;
                        if (tMsg.includes('property') && tMsg.includes('should not exist')) {
                            const prop = tMsg.match(/property\s+(\w+)\s+should not exist/);
                            tMsg = prop ? `Thuộc tính "${prop[1]}" không được phép tồn tại` : 'Thuộc tính không hợp lệ';
                        }
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
                }
                else {
                    message = resObj.message || message;
                }
                code = resObj.error || 'HTTP_EXCEPTION';
                details = details || resObj.details || null;
            }
        }
        else {
            console.error('[Unhandled Exception]:', exception);
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
};
exports.HttpExceptionFilter = HttpExceptionFilter;
exports.HttpExceptionFilter = HttpExceptionFilter = __decorate([
    (0, common_1.Catch)(Error)
], HttpExceptionFilter);
//# sourceMappingURL=http-exception.filter.js.map