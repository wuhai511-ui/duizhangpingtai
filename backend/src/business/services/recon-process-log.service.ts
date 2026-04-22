import type { PrismaClient } from '@prisma/client';

export interface CreateProcessLogInput {
  batchId: string;
  action: string;
  actionData: Record<string, unknown>;
  detailId?: string;
  ticketId?: string;
  ruleId?: string;
}

export class ReconProcessLogService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateProcessLogInput) {
    return this.prisma.reconProcessLog.create({
      data: {
        batch_id: input.batchId,
        detail_id: input.detailId,
        ticket_id: input.ticketId,
        rule_id: input.ruleId,
        action: input.action,
        action_data: JSON.stringify(input.actionData),
      },
    });
  }

  async listByTicket(ticketId: string) {
    return this.prisma.reconProcessLog.findMany({
      where: { ticket_id: ticketId },
      orderBy: { created_at: 'desc' },
    });
  }
}
