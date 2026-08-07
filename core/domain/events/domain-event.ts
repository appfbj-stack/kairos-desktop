/**
 * Domain event base.
 * Eventos sao fatos que aconteceram no passado.
 */

export abstract class DomainEvent {
  readonly occurredAt: Date = new Date();
  abstract readonly eventName: string;
  abstract readonly aggregateId: string;
}
