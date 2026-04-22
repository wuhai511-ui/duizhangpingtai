import type { PrismaClient, ReconciliationDetail } from '@prisma/client';
import { reconEvents, type MatchedEvent, type TicketCreatedEvent } from './recon-events.js';
import { ReconProcessLogService } from './recon-process-log.service.js';
import { ReconRuleEngine } from './recon-rule-engine.js';
import { RuleService } from './rule.service.js';

let listenersBound = false;

function toExceptionType(resultType: string): 'LONG' | 'SHORT' | 'AMOUNT_MISMATCH' | 'DUPLICATE' | 'ROLLING' {
  if (resultType === 'LONG') return 'LONG';
  if (resultType === 'SHORT') return 'SHORT';
  if (resultType === 'AMOUNT_MISMATCH') return 'AMOUNT_MISMATCH';
  if (resultType === 'ROLLING') return 'ROLLING';
  return 'DUPLICATE';
}

function stringifySafe(value: unknown): string {
  return JSON.stringify(value, (_key, val) => (typeof val === 'bigint' ? val.toString() : val));
}

function shouldSkipForIdempotency(detail: ReconciliationDetail, force: boolean): boolean {
  if (force) return false;
  return detail.process_status !== 'PENDING';
}

export class ReconPostProcessor {
  private readonly ruleService: RuleService;
  private readonly ruleEngine: ReconRuleEngine;
  private readonly logService: ReconProcessLogService;

  constructor(private readonly prisma: PrismaClient) {
    this.ruleService = new RuleService(prisma);
    this.ruleEngine = new ReconRuleEngine();
    this.logService = new ReconProcessLogService(prisma);
    this.bindEventListeners();
  }

  private bindEventListeners() {
    if (listenersBound) {
      return;
    }

    const handler = (serviceName: 'proof' | 'split' | 'settlement') => async (event: MatchedEvent) => {
      await this.logService.create({
        batchId: event.batchId,
        detailId: event.detailId,
        action: 'EVENT_PUBLISHED',
        actionData: {
          service: serviceName,
          event: 'MatchedEvent',
          serial_no: event.serialNo,
        },
      });
    };

    reconEvents.on('matched', handler('proof'));
    reconEvents.on('matched', handler('split'));
    reconEvents.on('matched', handler('settlement'));

    reconEvents.on('ticket_created', async (event: TicketCreatedEvent) => {
      await this.logService.create({
        batchId: event.batchId,
        detailId: event.detailId,
        ticketId: event.ticketId,
        action: 'EVENT_PUBLISHED',
        actionData: {
          service: 'ticket_notification',
          event: 'TicketCreatedEvent',
          serial_no: event.serialNo,
          exception_type: event.exceptionType,
        },
      });
    });

    listenersBound = true;
  }

  async processBatch(batchId: string, options?: { force?: boolean }) {
    const force = options?.force ?? false;
    const batch = await this.prisma.reconciliationBatch.findUnique({
      where: { id: batchId },
      include: {
        details: true,
      },
    });

    if (!batch) {
      throw new Error('Batch not found');
    }

    if (batch.status !== 2) {
      throw new Error('Batch must be completed before post-process');
    }

    if (!force && batch.post_process_status === 'DONE') {
      return {
        skipped: true,
        reason: 'already_post_processed',
        batch_id: batchId,
      };
    }

    await this.prisma.reconciliationBatch.update({
      where: { id: batchId },
      data: { post_process_status: 'RUNNING' },
    });

    await this.logService.create({
      batchId,
      action: 'POST_PROCESS_STARTED',
      actionData: { force },
    });

    try {
      const rules = await this.ruleService.listEnabled();
      let processedCount = 0;
      let ticketCreatedCount = 0;
      let autoProcessedCount = 0;

      for (const detail of batch.details) {
        if (shouldSkipForIdempotency(detail, force)) {
          continue;
        }

        const decision = this.ruleEngine.evaluate({ detail, allDetails: batch.details }, rules);
        if (!decision) {
          continue;
        }

        const nextFinalResultType = decision.updates.finalResultType ?? detail.final_result_type ?? detail.result_type;
        const nextProcessStatus = decision.updates.processStatus ?? detail.process_status;
        const nextProcessNote = decision.updates.processNote ?? detail.process_note;

        await this.prisma.reconciliationDetail.update({
          where: { id: detail.id },
          data: {
            final_result_type: nextFinalResultType,
            process_status: nextProcessStatus,
            process_note: nextProcessNote,
          },
        });

        await this.logService.create({
          batchId,
          detailId: detail.id,
          ruleId: decision.ruleId,
          action: 'RULE_APPLIED',
          actionData: {
            rule_name: decision.ruleName,
            serial_no: detail.serial_no,
            final_result_type: nextFinalResultType,
            process_status: nextProcessStatus,
          },
        });

        if (decision.createTicket) {
          const existing = await this.prisma.exceptionTicket.findUnique({
            where: { detail_id: detail.id },
          });

          if (!existing) {
            const ticket = await this.prisma.exceptionTicket.create({
              data: {
                batch_id: batchId,
                detail_id: detail.id,
                serial_no: detail.serial_no,
                exception_type: toExceptionType(detail.result_type),
                exception_data: stringifySafe({
                  business_data: detail.business_data,
                  channel_data: detail.channel_data,
                  diff_amount: detail.diff_amount,
                }),
                status: decision.autoCloseTicket ? 'CLOSED' : 'OPEN',
                severity: detail.result_type === 'AMOUNT_MISMATCH' ? 'LOW' : 'MEDIUM',
                resolution: decision.autoCloseTicket ? (decision.resolution || 'AUTO_ADJUST') : null,
                resolved_by: decision.autoCloseTicket ? 'system' : null,
                resolved_at: decision.autoCloseTicket ? new Date() : null,
                closed_at: decision.autoCloseTicket ? new Date() : null,
                resolution_note: decision.autoCloseTicket ? (decision.updates.processNote ?? 'Auto processed by rule') : null,
              },
            });

            ticketCreatedCount += 1;

            await this.logService.create({
              batchId,
              detailId: detail.id,
              ticketId: ticket.id,
              ruleId: decision.ruleId,
              action: 'TICKET_CREATED',
              actionData: {
                rule_name: decision.ruleName,
                serial_no: detail.serial_no,
                status: ticket.status,
              },
            });

            reconEvents.emit('ticket_created', {
              batchId,
              detailId: detail.id,
              ticketId: ticket.id,
              serialNo: detail.serial_no,
              exceptionType: detail.result_type,
            } satisfies TicketCreatedEvent);
          }
        }

        if (nextProcessStatus === 'AUTO_PROCESSED' || nextProcessStatus === 'CLOSED') {
          autoProcessedCount += 1;
        }

        if (nextFinalResultType === 'MATCH') {
          reconEvents.emit('matched', {
            batchId,
            detailId: detail.id,
            serialNo: detail.serial_no,
            matchMode: 'RULE',
            finalResultType: nextFinalResultType,
          } satisfies MatchedEvent);
        }

        processedCount += 1;
      }

      await this.prisma.reconciliationBatch.update({
        where: { id: batchId },
        data: {
          post_process_status: 'DONE',
          post_processed_at: new Date(),
        },
      });

      await this.logService.create({
        batchId,
        action: 'POST_PROCESS_COMPLETED',
        actionData: {
          processed_count: processedCount,
          auto_processed_count: autoProcessedCount,
          ticket_created_count: ticketCreatedCount,
        },
      });

      return {
        skipped: false,
        batch_id: batchId,
        processed_count: processedCount,
        auto_processed_count: autoProcessedCount,
        ticket_created_count: ticketCreatedCount,
      };
    } catch (error) {
      await this.prisma.reconciliationBatch.update({
        where: { id: batchId },
        data: {
          post_process_status: 'FAILED',
        },
      });

      await this.logService.create({
        batchId,
        action: 'POST_PROCESS_FAILED',
        actionData: {
          error: (error as Error).message,
        },
      });

      throw error;
    }
  }
}
