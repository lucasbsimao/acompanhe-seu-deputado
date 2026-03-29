export enum EtlErrorCode {
  USER_CANCELLED = 'USER_CANCELLED',
  DATABASE_ERROR = 'DATABASE_ERROR',
  PIPELINE_ERROR = 'PIPELINE_ERROR',
  HTTP_ERROR = 'HTTP_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
}

export class EtlError extends Error {
  public readonly code: EtlErrorCode;
  public readonly timestamp: Date;
  public readonly context?: Record<string, unknown>;

  constructor(
    code: EtlErrorCode,
    message: string,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'EtlError';
    this.code = code;
    this.timestamp = new Date();
    this.context = context;

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      timestamp: this.timestamp.toISOString(),
      context: this.context,
      stack: this.stack,
    };
  }
}

export class UserCancelledError extends EtlError {
  constructor(message = 'Operation cancelled by user') {
    super(EtlErrorCode.USER_CANCELLED, message);
    this.name = 'UserCancelledError';
  }
}

export class DatabaseError extends EtlError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(EtlErrorCode.DATABASE_ERROR, message, context);
    this.name = 'DatabaseError';
  }
}

export class PipelineError extends EtlError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(EtlErrorCode.PIPELINE_ERROR, message, context);
    this.name = 'PipelineError';
  }
}

export class HttpError extends EtlError {
  public readonly statusCode?: number;

  constructor(message: string, statusCode?: number, context?: Record<string, unknown>) {
    super(EtlErrorCode.HTTP_ERROR, message, context);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

export class ValidationError extends EtlError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(EtlErrorCode.VALIDATION_ERROR, message, context);
    this.name = 'ValidationError';
  }
}

export class ConfigurationError extends EtlError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(EtlErrorCode.CONFIGURATION_ERROR, message, context);
    this.name = 'ConfigurationError';
  }
}
