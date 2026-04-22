import type { PrismaClient, ReconRule } from '@prisma/client';

export interface RuleCondition {
  result_types?: string[];
  tolerance_cents?: number;
  rolling_days_max?: number;
  same_serial_required?: boolean;
  same_batch_only?: boolean;
}

export interface RuleAction {
  new_result_type?: string;
  new_process_status?: 'PENDING' | 'AUTO_PROCESSED' | 'MANUAL_REVIEW' | 'CLOSED';
  create_ticket?: boolean;
  auto_close?: boolean;
  resolution?: 'AUTO_ADJUST' | 'AUTO_CONVERT' | 'MANUAL_CONFIRM' | 'MANUAL_ADJUST' | 'DUPLICATE_REMOVED' | 'IGNORED';
  note?: string;
}

export interface ReconRuleDTO {
  id: string;
  name: string;
  description: string | null;
  rule_type: ReconRule['rule_type'];
  condition: RuleCondition;
  action: RuleAction;
  priority: number;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

function safeParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toDTO(rule: ReconRule): ReconRuleDTO {
  return {
    id: rule.id,
    name: rule.name,
    description: rule.description,
    rule_type: rule.rule_type,
    condition: safeParse<RuleCondition>(rule.condition_expr, {}),
    action: safeParse<RuleAction>(rule.action_expr, {}),
    priority: rule.priority,
    enabled: rule.enabled,
    created_at: rule.created_at,
    updated_at: rule.updated_at,
  };
}

export class RuleService {
  constructor(private readonly prisma: PrismaClient) {}

  async listAll() {
    const rules = await this.prisma.reconRule.findMany({ orderBy: [{ priority: 'desc' }, { created_at: 'asc' }] });
    return rules.map(toDTO);
  }

  async listEnabled() {
    const rules = await this.prisma.reconRule.findMany({
      where: { enabled: true },
      orderBy: [{ priority: 'desc' }, { created_at: 'asc' }],
    });
    return rules.map(toDTO);
  }

  async create(input: {
    name: string;
    description?: string;
    rule_type: ReconRule['rule_type'];
    condition: RuleCondition;
    action: RuleAction;
    priority?: number;
    enabled?: boolean;
  }) {
    const created = await this.prisma.reconRule.create({
      data: {
        name: input.name,
        description: input.description,
        rule_type: input.rule_type,
        condition_expr: JSON.stringify(input.condition),
        action_expr: JSON.stringify(input.action),
        priority: input.priority ?? 0,
        enabled: input.enabled ?? true,
      },
    });
    return toDTO(created);
  }

  async update(
    id: string,
    input: {
      name?: string;
      description?: string | null;
      condition?: RuleCondition;
      action?: RuleAction;
      priority?: number;
      enabled?: boolean;
    },
  ) {
    const updated = await this.prisma.reconRule.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        condition_expr: input.condition ? JSON.stringify(input.condition) : undefined,
        action_expr: input.action ? JSON.stringify(input.action) : undefined,
        priority: input.priority,
        enabled: input.enabled,
      },
    });
    return toDTO(updated);
  }

  async remove(id: string) {
    await this.prisma.reconRule.delete({ where: { id } });
  }

  async toggle(id: string) {
    const existing = await this.prisma.reconRule.findUnique({ where: { id } });
    if (!existing) {
      throw new Error('Rule not found');
    }
    const updated = await this.prisma.reconRule.update({
      where: { id },
      data: { enabled: !existing.enabled },
    });
    return toDTO(updated);
  }
}
