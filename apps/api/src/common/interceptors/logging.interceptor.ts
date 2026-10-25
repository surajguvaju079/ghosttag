import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');
  intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const requestId =
      request.headers['x-request-id']?.toString() ?? randomUUID();
    const logRequestId =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        requestId,
      )
        ? requestId
        : randomUUID();
    response.setHeader('x-request-id', requestId);
    const startedAt = Date.now();
    return next.handle().pipe(
      tap({
        next: () =>
          this.logRequest(
            request,
            response.statusCode,
            logRequestId,
            startedAt,
          ),
        error: (error: unknown) =>
          this.logRequest(
            request,
            error instanceof HttpException ? error.getStatus() : 500,
            logRequestId,
            startedAt,
          ),
      }),
    );
  }
  private logRequest(
    request: Request,
    status: number,
    requestId: string,
    startedAt: number,
  ): void {
    // Log route templates, never raw URLs/query strings, params, headers or bodies.
    const route = request.route as { path?: unknown } | undefined;
    const path = typeof route?.path === 'string' ? route.path : 'unmatched';
    this.logger.log(
      `${request.method} ${path} ${status} ${Date.now() - startedAt}ms requestId=${requestId}`,
    );
  }
}
