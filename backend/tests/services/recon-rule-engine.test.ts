import { describe, it, expect } from 'vitest';
import type { ReconciliationDetail } from '@prisma/client';
import { ReconRuleEngine } from '../../src/business/services/recon-rule-engine.js';
import type { ReconRuleDTO } from '../../src/business/services/rule.service.js';

function makeDetail(overrides: Partial<ReconciliationDetail>): ReconciliationDetail {
  return {
    id: 'd1',
    batch_id: 'b1',
    serial_no: 'SER001',
    business_data: JSON.stringify({ trans_date: '2026-04-21' }),
    channel_data: JSON.stringify({ trans_date: '2026-04-22' }),
    result_type: 'ROLLING',
    final_result_type: null,
    business_amount: 100n,
    channel_amount: 100n,
    diff_amount: 0n,
    match_date: '2026-04-22',
    process_status: 'PENDING',
    process_note: null,
    remark: null,
    created_at: new Date(),
    ...overrides,
  };
}

describe('ReconRuleEngine', () => {
  const engine = new ReconRuleEngine();

  it('matches rolling auto-convert rule', () => {
    const detail = makeDetail({ result_type: 'ROLLING' });
    const rules: ReconRuleDTO[] = [
      {
        id: 'r1',
        name: 'rolling',
        description: null,
        rule_type: 'AUTO_CONVERT',
        condition: { result_types: ['ROLLING'], rolling_days_max: 3 },
        action: { new_result_type: 'MATCH', new_process_status: 'AUTO_PROCESSED' },
        priority: 100,
        enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    const decision = engine.evaluate({ detail, allDetails: [detail] }, rules);
    expect(decision?.updates.finalResultType).toBe('MATCH');
    expect(decision?.updates.processStatus).toBe('AUTO_PROCESSED');
  });

  it('matches amount tolerance rule within 1 cent', () => {
    const detail = makeDetail({
      result_type: 'AMOUNT_MISMATCH',
      diff_amount: 1n,
      business_amount: 100n,
      channel_amount: 99n,
    });

    const rules: ReconRuleDTO[] = [
      {
        id: 'r2',
        name: 'tolerance',
        description: null,
        rule_type: 'AUTO_ADJUST',
        condition: { result_types: ['AMOUNT_MISMATCH'], tolerance_cents: 1 },
        action: { new_result_type: 'MATCH', new_process_status: 'AUTO_PROCESSED' },
        priority: 90,
        enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    const decision = engine.evaluate({ detail, allDetails: [detail] }, rules);
    expect(decision).toBeTruthy();
    expect(decision?.updates.finalResultType).toBe('MATCH');
  });

  it('creates manual review decision for duplicate long/short serial', () => {
    const longDetail = makeDetail({ id: 'd-long', result_type: 'LONG', serial_no: 'SER-DUP' });
    const shortDetail = makeDetail({ id: 'd-short', result_type: 'SHORT', serial_no: 'SER-DUP' });

    const rules: ReconRuleDTO[] = [
      {
        id: 'r3',
        name: 'dedup',
        description: null,
        rule_type: 'AUTO_DEDUP',
        condition: {
          result_types: ['LONG', 'SHORT'],
          same_serial_required: true,
          same_batch_only: true,
        },
        action: { new_process_status: 'MANUAL_REVIEW', create_ticket: true },
        priority: 80,
        enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    const decision = engine.evaluate({ detail: longDetail, allDetails: [longDetail, shortDetail] }, rules);
    expect(decision?.updates.processStatus).toBe('MANUAL_REVIEW');
    expect(decision?.createTicket).toBe(true);
  });
});
