/**
 * Erro base do dominio.
 * Todas as exceptions lancadas pelo Core devem extender esta classe.
 */
export class DomainError extends Error {
    cause;
    occurredAt = new Date();
    constructor(message, cause) {
        super(message);
        this.cause = cause;
        this.name = this.constructor.name;
    }
}
export class ValidationError extends DomainError {
    code = 'VALIDATION_ERROR';
}
export class NotFoundError extends DomainError {
    code = 'NOT_FOUND';
    constructor(resource, id) {
        super(`${resource} not found: ${id}`);
    }
}
export class ApprovalRequiredError extends DomainError {
    action;
    reason;
    code = 'APPROVAL_REQUIRED';
    constructor(action, reason) {
        super(`Approval required: ${action} - ${reason}`);
        this.action = action;
        this.reason = reason;
    }
}
export class ProviderError extends DomainError {
    code = 'PROVIDER_ERROR';
}
export class QuotaExceededError extends DomainError {
    code = 'QUOTA_EXCEEDED';
}
