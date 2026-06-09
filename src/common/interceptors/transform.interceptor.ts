import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  data: T;
  message?: string;
  statusCode: number;
  meta?: Record<string, unknown>;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  Response<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    return next.handle().pipe(
      map((data: unknown) => {
        const typedData = data as Record<string, unknown>;
        const responseData = typedData?.data !== undefined ? typedData.data : data;
        const message = typeof typedData?.message === 'string' ? typedData.message : 'Success';
        const meta = typedData?.meta as Record<string, unknown> | undefined;

        return {
          statusCode: context.switchToHttp().getResponse().statusCode,
          message,
          data: responseData as T,
          meta,
        };
      }),
    );
  }
}
