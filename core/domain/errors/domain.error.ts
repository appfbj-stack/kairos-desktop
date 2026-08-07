/**
 * Erro base do dominio.
 * Todas as exceptions lancadas pelo Core devem extender esta classe.
 */

export abstract class DomainError extends Error {
  abstract readonly code: string;
  readonly occurredAt: Date = new Date();

  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR';
}

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`);
  }
}

export class ApprovalRequiredError extends DomainError {
  readonly code = 'APPROVAL_REQUIRED';
  constructor(
    public readonly action: string,
    public readonly reason: string,
  ) {
    super(`Approval required: ${action} - ${reason}`);
  }
}

export class ProviderError extends DomainError {
  readonly code = 'PROVIDER_ERROR';
}

export class QuotaExceededError extends DomainError {
  readonly code = 'QUOTA_EXCEEDED';
}
