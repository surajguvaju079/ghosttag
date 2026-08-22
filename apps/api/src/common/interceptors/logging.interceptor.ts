import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Observable, tap } from "rxjs";
import { Request, Response } from "express"



@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');
  intercept(context: ExecutionContext, next: CallHandler<any>): Observable<any> | Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const requestId = request.headers['x-request-id']?.toString() ?? randomUUID()
    response.setHeader('x-request-id', requestId)
    const startedAt = Date.now()
    return next.handle().pipe(
      tap({
        next: () => {
          this.logRequest(request, response, requestId, startedAt)
        },
        error: () => {
          this.logRequest(request, response, requestId, startedAt)
        }
      })
    )
  }
  private logRequest(request: Request, response: Response, requestId: string, startedAt: number): void {
    const duration = Date.now() - startedAt
    this.logger.log(`${request.method} ${request.originalUrl} ${response.statusCode} ${duration}ms requestId=${requestId}`)
  }
}
