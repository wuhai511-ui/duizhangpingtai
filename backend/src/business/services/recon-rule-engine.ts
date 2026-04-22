import type { ReconciliationDetail } from '@prisma/client';
import type { ReconRuleDTO } from './rule.service.js';

interface EvalContext {
  detail: ReconciliationDetail;
  allDetails: ReconciliationDetail[];
}

export interface RuleDecision {
  ruleId: string;
  ruleName: string;
  updates: {
    finalResultType?: string;
    processStatus?: 'PENDING' | 'AUTO_PROCESSED' | 'MANUAL_REVIEW' | 'CLOSED';
    processNote?: string;
  };
  createTicket: boolean;
  autoCloseTicket: boolean;
  resolution?: 'AUTO_ADJUST' | 'AUTO_CONVERT' | 'MANUAL_CONFIRM' | 'MANUAL_ADJUST' | 'DUPLICATE_REMOVED' | 'IGNORED';
}

function absBigInt(v: bigint): bigint {
  return v >= 0n ? v : -v;
}

function parseDiff(detail: ReconciliationDetail): bigint {
  return detail.diff_amount ?? 0n;
}

function parseDate(raw?: string | null): Date | null {
  if (!raw) return null;
  const normalized = raw.includes('-') ? raw : raw.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24)));
}

export class ReconRuleEngine {
  evaluate(ctx: EvalContext, rules: ReconRuleDTO[]): RuleDecision | null {
    for (const rule of rules) {
      if (!rule.enabled) continue;
      if (!this.matchesRule(ctx, rule)) continue;

      return {
        ruleId: rule.id,
        ruleName: rule.name,
        updates: {
          finalResultType: rule.action.new_result_type,
          processStatus: rule.action.new_process_status,
          processNote: rule.action.note,
        },
        createTicket: Boolean(rule.action.create_ticket),
        autoCloseTicket: Boolean(rule.action.auto_close),
        resolution: rule.action.resolution,
      };
    }
    return null;
  }

  private matchesRule(ctx: EvalContext, rule: ReconRuleDTO): boolean {
    const { detail, allDetails } = ctx;
    const condition = rule.condition;

    if (condition.result_types && condition.result_types.length > 0 && !condition.result_types.includes(detail.result_type)) {
      return false;
    }

    if (typeof condition.tolerance_cents === 'number') {
      if (detail.result_type !== 'AMOUNT_MISMATCH') {
        return false;
      }
      const tolerance = BigInt(Math.max(0, condition.tolerance_cents));
      if (absBigInt(parseDiff(detail)) > tolerance) {
        return false;
      }
    }

    if (typeof condition.rolling_days_max === 'number') {
      if (detail.result_type !== 'ROLLING') {
        return false;
      }
      const bDate = parseDate(JSON.parse(detail.business_data || '{}').trans_date);
      const cDate = parseDate(JSON.parse(detail.channel_data || '{}').trans_date || detail.match_date);
      if (!bDate || !cDate) {
        return false;
      }
      if (daysBetween(bDate, cDate) > Math.max(0, condition.rolling_days_max)) {
        return false;
      }
    }

    if (condition.same_serial_required) {
      const sameSerial = allDetails.filter((item) => item.serial_no === detail.serial_no && item.id !== detail.id);
      if (sameSerial.length === 0) {
        return false;
      }
      if (condition.same_batch_only) {
        const hasLongShortPair = sameSerial.some((item) => {
          return (
            (detail.result_type === 'LONG' && item.result_type === 'SHORT') ||
            (detail.result_type === 'SHORT' && item.result_type === 'LONG')
          );
        });
        if (!hasLongShortPair) {
          return false;
        }
      }
    }

    return true;
  }
}
