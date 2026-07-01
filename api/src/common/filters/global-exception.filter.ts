import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ClientErrorBody {
  statusCode: number;
  message: string;
  timestamp: string;
  path: string;
}

/**
 * OWASP A05:2021 (Security Misconfiguration) - an unhandled exception that
 * reaches the client with its raw message/stack can leak SQL fragments,
 * file paths, library versions and other reconnaissance data an attacker
 * can use to fingerprint the stack and craft further attacks.
 *
 * This filter is the single place that decides what error information ever
 * reaches a client. Every exception in the app - HttpException or not -
 * is caught here, logged in full internally (for incident response), and
 * translated into a minimal, generic body before it leaves the process.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, message } = this.resolveStatusAndMessage(exception);

    // Full detail (stack trace, original message) is logged server-side only.
    this.logger.error(
      `${request.method} ${request.url} -> ${statusCode}: ${
        exception instanceof Error ? exception.message : String(exception)
      }`,
      exception instanceof Error ? exception.stack : undefined,
    );

    const body: ClientErrorBody = {
      statusCode,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(statusCode).json(body);
  }

  private resolveStatusAndMessage(exception: unknown): { statusCode: number; message: string } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();

      // class-validator / ValidationPipe errors arrive as
      // { message: string[], error: string, statusCode: number }.
      if (typeof response === 'object' && response !== null && 'message' in response) {
        const rawMessage = (response as { message: unknown }).message;
        const message = Array.isArray(rawMessage) ? rawMessage.join('; ') : String(rawMessage);
        return { statusCode: status, message };
      }

      return { statusCode: status, message: exception.message };
    }

    // Anything that isn't a deliberately-thrown HttpException (e.g. a
    // Prisma error, a null-reference bug) is an internal failure - never
    // forward its message, always return a generic 500.
    return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' };
  }
}
