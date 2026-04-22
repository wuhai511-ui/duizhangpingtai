import type { PrismaClient } from '@prisma/client';
import { ReconProcessLogService } from './recon-process-log.service.js';

type TicketStatus = 'OPEN' | 'PROCESSING' | 'RESOLVED' | 'CLOSED';
type TicketSeverity = 'LOW' | 'MEDIUM' | 'HIGH';
type TicketResolution =
  | 'MANUAL_CONFIRM'
  | 'MANUAL_ADJUST'
  | 'DUPLICATE_REMOVED'
  | 'IGNORED'
  | 'AUTO_ADJUST'
  | 'AUTO_CONVERT';

interface ListTicketsQuery {
  batch_id?: string;
  status?: TicketStatus;
  exception_type?: string;
  severity?: TicketSeverity;
  assignee_id?: string;
  page: number;
  page_size: number;
}

const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ['PROCESSING'],
  PROCESSING: ['RESOLVED', 'CLOSED'],
  RESOLVED: ['OPEN'],
  CLOSED: ['OPEN'],
};

function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export class TicketService {
  private readonly logService: ReconProcessLogService;

  constructor(private readonly prisma: PrismaClient) {
    this.logService = new ReconProcessLogService(prisma);
  }

  async list(query: ListTicketsQuery) {
    const where: Record<string, unknown> = {};
    if (query.batch_id) where.batch_id = query.batch_id;
    if (query.status) where.status = query.status;
    if (query.exception_type) where.exception_type = query.exception_type;
    if (query.severity) where.severity = query.severity;
    if (query.assignee_id) where.assignee_id = query.assignee_id;

    const [total, list] = await Promise.all([
      this.prisma.exceptionTicket.count({ where }),
      this.prisma.exceptionTicket.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (query.page - 1) * query.page_size,
        take: query.page_size,
      }),
    ]);

    return { total, list };
  }

  async detail(id: string) {
    const ticket = await this.prisma.exceptionTicket.findUnique({
      where: { id },
      include: {
        detail: true,
        batch: true,
      },
    });

    if (!ticket) {
      throw new Error('Ticket not found');
    }

    const logs = await this.logService.listByTicket(id);
    return { ticket, logs };
  }

  async patch(
    id: string,
    input: {
      status?: TicketStatus;
      assignee_id?: string | null;
      resolution_note?: string | null;
      severity?: TicketSeverity;
    },
    operator?: string,
  ) {
    const ticket = await this.prisma.exceptionTicket.findUnique({ where: { id } });
    if (!ticket) {
      throw new Error('Ticket not found');
    }

    const currentStatus = ticket.status as TicketStatus;
    if (input.status && input.status !== currentStatus && !canTransition(currentStatus, input.status)) {
      throw new Error(`Invalid status transition: ${currentStatus} -> ${input.status}`);
    }

    const updated = await this.prisma.exceptionTicket.update({
      where: { id },
      data: {
        status: input.status,
        assignee_id: input.assignee_id,
        resolution_note: input.resolution_note,
        severity: input.severity,
      },
    });

    await this.logService.create({
      batchId: updated.batch_id,
      detailId: updated.detail_id,
      ticketId: updated.id,
      action: 'STATE_CHANGED',
      actionData: {
        operator,
        before_status: ticket.status,
        after_status: updated.status,
        assignee_id: updated.assignee_id,
      },
    });

    return updated;
  }

  async resolve(
    id: string,
    input: {
      resolution: TicketResolution;
      resolution_note?: string;
      final_status?: 'RESOLVED' | 'CLOSED';
    },
    operator?: string,
  ) {
    const ticket = await this.prisma.exceptionTicket.findUnique({ where: { id } });
    if (!ticket) {
      throw new Error('Ticket not found');
    }

    const finalStatus = input.final_status ?? 'RESOLVED';
    if (!['OPEN', 'PROCESSING'].includes(ticket.status)) {
      throw new Error('Only OPEN/PROCESSING tickets can be resolved');
    }

    const updated = await this.prisma.exceptionTicket.update({
      where: { id },
      data: {
        status: finalStatus,
        resolution: input.resolution,
        resolution_note: input.resolution_note,
        resolved_by: operator ?? 'system',
        resolved_at: new Date(),
        closed_at: finalStatus === 'CLOSED' ? new Date() : null,
      },
    });

    await this.prisma.reconciliationDetail.update({
      where: { id: updated.detail_id },
      data: {
        process_status: finalStatus === 'CLOSED' ? 'CLOSED' : 'MANUAL_REVIEW',
        process_note: input.resolution_note ?? updated.resolution,
      },
    });

    await this.logService.create({
      batchId: updated.batch_id,
      detailId: updated.detail_id,
      ticketId: updated.id,
      action: 'MANUAL_RESOLVED',
      actionData: {
        operator,
        resolution: input.resolution,
        final_status: finalStatus,
      },
    });

    return updated;
  }

  async reopen(id: string, operator?: string) {
    const ticket = await this.prisma.exceptionTicket.findUnique({ where: { id } });
    if (!ticket) {
      throw new Error('Ticket not found');
    }

    if (!['RESOLVED', 'CLOSED'].includes(ticket.status)) {
      throw new Error('Only RESOLVED/CLOSED tickets can be reopened');
    }

    const updated = await this.prisma.exceptionTicket.update({
      where: { id },
      data: {
        status: 'OPEN',
        resolution: null,
        resolved_by: null,
        resolved_at: null,
        closed_at: null,
      },
    });

    await this.prisma.reconciliationDetail.update({
      where: { id: updated.detail_id },
      data: {
        process_status: 'MANUAL_REVIEW',
        process_note: 'Ticket reopened',
      },
    });

    await this.logService.create({
      batchId: updated.batch_id,
      detailId: updated.detail_id,
      ticketId: updated.id,
      action: 'STATE_CHANGED',
      actionData: {
        operator,
        before_status: ticket.status,
        after_status: 'OPEN',
      },
    });

    return updated;
  }
}
