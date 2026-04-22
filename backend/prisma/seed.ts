/**
 * Seed script: bootstrap default merchant, user, and reconciliation rules.
 * Run: npx tsx prisma/seed.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding base data...');

  const merchant = await prisma.merchant.upsert({
    where: { merchant_no: 'DEFAULT' },
    update: {},
    create: {
      merchant_no: 'DEFAULT',
      name: 'Default Merchant',
      status: 1,
    },
  });
  console.log('Merchant ready:', merchant.merchant_no);

  const user = await prisma.user.upsert({
    where: { phone: '15801852984' },
    update: {},
    create: {
      phone: '15801852984',
      password: '123456',
      name: 'Test User',
      merchantId: null,
      status: 1,
    },
  });
  console.log('User ready:', user.phone);

  const defaultRules = [
    {
      name: '滚动匹配自动处理',
      description: 'ROLLING and rolling days <= 3 will be auto converted to MATCH',
      rule_type: 'AUTO_CONVERT' as const,
      condition_expr: JSON.stringify({
        result_types: ['ROLLING'],
        rolling_days_max: 3,
      }),
      action_expr: JSON.stringify({
        new_result_type: 'MATCH',
        new_process_status: 'AUTO_PROCESSED',
        note: 'Auto converted from rolling match',
        auto_close: true,
        resolution: 'AUTO_CONVERT',
      }),
      priority: 100,
    },
    {
      name: '金额容差自动调平',
      description: 'AMOUNT_MISMATCH within 1 cent tolerance will be auto adjusted',
      rule_type: 'AUTO_ADJUST' as const,
      condition_expr: JSON.stringify({
        result_types: ['AMOUNT_MISMATCH'],
        tolerance_cents: 1,
      }),
      action_expr: JSON.stringify({
        new_result_type: 'MATCH',
        new_process_status: 'AUTO_PROCESSED',
        note: 'Auto adjusted by tolerance rule',
        auto_close: true,
        resolution: 'AUTO_ADJUST',
      }),
      priority: 90,
    },
    {
      name: '重复流水号人工复核',
      description: 'LONG/SHORT entries with same serial in one batch require manual review',
      rule_type: 'AUTO_DEDUP' as const,
      condition_expr: JSON.stringify({
        result_types: ['LONG', 'SHORT'],
        same_serial_required: true,
        same_batch_only: true,
      }),
      action_expr: JSON.stringify({
        new_process_status: 'MANUAL_REVIEW',
        create_ticket: true,
        note: 'Possible duplicate serial number, manual review required',
      }),
      priority: 80,
    },
  ];

  for (const rule of defaultRules) {
    await prisma.reconRule.upsert({
      where: { name: rule.name },
      update: {
        description: rule.description,
        rule_type: rule.rule_type,
        condition_expr: rule.condition_expr,
        action_expr: rule.action_expr,
        priority: rule.priority,
        enabled: true,
      },
      create: {
        name: rule.name,
        description: rule.description,
        rule_type: rule.rule_type,
        condition_expr: rule.condition_expr,
        action_expr: rule.action_expr,
        priority: rule.priority,
        enabled: true,
      },
    });
  }

  console.log('Default recon rules upserted:', defaultRules.length);
}

main()
  .then(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    prisma.$disconnect();
    process.exit(1);
  });
