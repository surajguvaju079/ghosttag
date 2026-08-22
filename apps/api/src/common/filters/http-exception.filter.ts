import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import { Request, Response } from 'express'
interface ErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  path: string;
  timestamp: string;
  details?: unknown;
  requestId: string;
}


@Catch()
export class HttpExceptionFilter implements ExceptionFilter {

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : undefined;

    const message = this.getMessage(exceptionResponse);
    const code = this.getCode(status, exceptionResponse);
    const requestId = request.headers['x-request-id']?.toString() ?? 'unknown';
    const errorResponse: ErrorResponse = {
      statusCode: status,
      code,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
      requestId
    }
    response.status(status).json(errorResponse)

  }


  private getMessage(exceptionResponse: unknown): string {
    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }

    if (
      exceptionResponse &&
      typeof exceptionResponse === 'object' &&
      'message' in exceptionResponse
    ) {
      const message = exceptionResponse.message;

      if (Array.isArray(message)) {
        return 'Validation failed';
      }

      if (typeof message === 'string') {
        return message;
      }
    }

    return 'Internal server error';
  }



  private getCode(
    status: number,
    exceptionResponse: unknown,
  ): string {
    if (
      exceptionResponse &&
      typeof exceptionResponse === 'object' &&
      'code' in exceptionResponse &&
      typeof exceptionResponse.code === 'string'
    ) {
      return exceptionResponse.code;
    }

    if (status === HttpStatus.BAD_REQUEST) {
      return 'BAD_REQUEST';
    }

    if (status === HttpStatus.UNAUTHORIZED) {
      return 'UNAUTHORIZED';
    }

    if (status === HttpStatus.FORBIDDEN) {
      return 'FORBIDDEN';
    }

    if (status === HttpStatus.NOT_FOUND) {
      return 'NOT_FOUND';
    }

    if (status === HttpStatus.CONFLICT) {
      return 'CONFLICT';
    }

    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      return 'RATE_LIMITED';
    }


    if (status >= 500) {
      return 'INTERNAL_SERVER_ERROR';
    }

    return 'REQUEST_ERROR';
  }


}
