import { EventEmitter } from 'node:events';

export interface MatchedEvent {
  batchId: string;
  detailId: string;
  serialNo: string;
  matchMode: 'RULE' | 'DEFAULT';
  finalResultType: string;
}

export interface TicketCreatedEvent {
  batchId: string;
  detailId: string;
  ticketId: string;
  serialNo: string;
  exceptionType: string;
}

export const reconEvents = new EventEmitter();
