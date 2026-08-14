import type { ServiceError, ServiceErrorCode, ServiceResult } from "@/domain/common";

export function serviceError(
  code: ServiceErrorCode,
  message: string,
  retryable = false,
  fieldErrors?: Record<string, string[]>,
): ServiceError {
  return { code, message, retryable, fieldErrors };
}

export function failure<T>(error: ServiceError): ServiceResult<T> {
  return { ok: false, error };
}

export function success<T>(data: T): ServiceResult<T> {
  return { ok: true, data };
}

export class ServiceFailure extends Error {
  readonly serviceError: ServiceError;

  constructor(error: ServiceError) {
    super(error.message);
    this.name = "ServiceFailure";
    this.serviceError = error;
  }
}

export function abortWith(error: ServiceError): never {
  throw new ServiceFailure(error);
}

export function internalError(): ServiceError {
  return serviceError("INTERNAL_ERROR", "Something went wrong. Please try again.", true);
}
