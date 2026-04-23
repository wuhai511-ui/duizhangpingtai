import React, { useMemo, useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { reconciliationApi } from '../../services/reconciliation';
import type { ReconTemplateConfig, ReconTemplateConfigItem } from '../../types';

const { Title, Text } = Typography;

const BATCH_TYPE_OPTIONS = [
  { label: '业务订单 vs JY', value: 'ORDER_VS_JY' },
  { label: 'JY vs JS', value: 'JY_VS_JS' },
] as const;

const MATCH_MODE_OPTIONS = [
  { label: '精确匹配', value: 'exact' },
  { label: '前缀', value: 'prefix' },
  { label: '后缀', value: 'suffix' },
  { label: '包含', value: 'contains' },
];

function buildDefaultTemplate(): ReconTemplateConfig {
  return {
    id: '',
    name: '新对账模板',
    batch_type: 'ORDER_VS_JY',
    description: '',
    business_source: { table: 'BusinessOrder', file_type: 'BUSINESS_ORDER' },
    channel_source: { table: 'JyTransaction', file_type: 'JY' },
    primary_keys: [
      {
        mode: 'exact',
        business_field: 'order_no',
        channel_field: 'merchant_order_no',
        weight: 100,
      },
    ],
    auxiliary_fields: [
      {
        business_field: 'pay_serial_no',
        channel_field: 'lakala_serial',
        required: false,
        mode: 'exact',
      },
    ],
    amount_check: {
      business_field: 'order_amount',
      channel_field: 'amount',
      tolerance: 0,
      strict: true,
    },
    date_check: {
      business_field: 'trans_date',
      channel_field: 'trans_date',
      rolling_days: 3,
      allow_empty_date: true,
    },
  };
}

const ReconciliationTemplatesPage: React.FC = () => {
  const [batchType, setBatchType] = useState<'ORDER_VS_JY' | 'JY_VS_JS'>('ORDER_VS_JY');
  const [editing, setEditing] = useState<ReconTemplateConfigItem | null>(null);
  const [open, setOpen] = useState(false);
  const [isDefault, setIsDefault] = useState(true);
  const [form] = Form.useForm();

  const listQuery = useQuery({
    queryKey: ['recon-template-configs', batchType],
    queryFn: () => reconciliationApi.listTemplateConfigs(batchType),
  });

  const createMutation = useMutation({
    mutationFn: (payload: { template: ReconTemplateConfig; is_default?: boolean }) =>
      reconciliationApi.createTemplateConfig(payload),
    onSuccess: () => {
      message.success('模板已创建');
      setOpen(false);
      listQuery.refetch();
    },
    onError: (e: any) => message.error(e?.message || '创建失败'),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; template: ReconTemplateConfig; is_default?: boolean }) =>
      reconciliationApi.updateTemplateConfig(payload.id, {
        template: payload.template,
        is_default: payload.is_default,
      }),
    onSuccess: () => {
      message.success('模板已更新');
      setOpen(false);
      listQuery.refetch();
    },
    onError: (e: any) => message.error(e?.message || '更新失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => reconciliationApi.deleteTemplateConfig(id),
    onSuccess: () => {
      message.success('模板已删除');
      listQuery.refetch();
    },
    onError: (e: any) => message.error(e?.message || '删除失败'),
  });

  const rows = useMemo(() => listQuery.data || [], [listQuery.data]);

  const openCreate = () => {
    setEditing(null);
    const template = buildDefaultTemplate();
    template.batch_type = batchType;
    form.setFieldsValue(template as any);
    setIsDefault(true);
    setOpen(true);
  };

  const openEdit = (item: ReconTemplateConfigItem) => {
    setEditing(item);
    form.setFieldsValue(item.template as any);
    setIsDefault(item.is_default);
    setOpen(true);
  };

  const onSave = async () => {
    const values = (await form.validateFields()) as ReconTemplateConfig;
    const payload = {
      template: values,
      is_default: isDefault,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Space direction="vertical" size={8}>
          <Title level={4} style={{ margin: 0 }}>
            账单模板配置
          </Title>
          <Text type="secondary">可配置对账主键、金额字段、日期字段及辅助字段，并可设置默认模板。</Text>
        </Space>
      </Card>

      <Card
        title="模板列表"
        extra={
          <Space>
            <Select
              value={batchType}
              onChange={(value) => setBatchType(value)}
              options={BATCH_TYPE_OPTIONS as any}
              style={{ width: 180 }}
            />
            <Button type="primary" onClick={openCreate}>
              新建模板
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          loading={listQuery.isLoading}
          dataSource={rows}
          pagination={false}
          columns={[
            {
              title: '名称',
              dataIndex: ['template', 'name'],
              render: (_: any, row: ReconTemplateConfigItem) => (
                <Space>
                  <Text strong>{row.template.name}</Text>
                  {row.is_default ? <Tag color="green">默认</Tag> : null}
                  {row.source === 'builtin' ? <Tag>内置</Tag> : <Tag color="blue">自定义</Tag>}
                </Space>
              ),
            },
            { title: '批次类型', dataIndex: ['template', 'batch_type'], width: 160 },
            {
              title: '主键',
              width: 320,
              render: (_: any, row: ReconTemplateConfigItem) =>
                row.template.primary_keys
                  .map((pk) => `${pk.business_field} -> ${pk.channel_field}`)
                  .join(' ; '),
            },
            {
              title: '金额字段',
              width: 220,
              render: (_: any, row: ReconTemplateConfigItem) =>
                `${row.template.amount_check.business_field} -> ${row.template.amount_check.channel_field} (容差${row.template.amount_check.tolerance || 0})`,
            },
            {
              title: '操作',
              width: 180,
              render: (_: any, row: ReconTemplateConfigItem) => (
                <Space>
                  {!row.readonly && (
                    <>
                      <Button type="link" size="small" onClick={() => openEdit(row)}>
                        编辑
                      </Button>
                      <Popconfirm
                        title="确认删除该模板？"
                        onConfirm={() => deleteMutation.mutate(row.id)}
                      >
                        <Button type="link" danger size="small">
                          删除
                        </Button>
                      </Popconfirm>
                    </>
                  )}
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title={editing ? '编辑模板' : '新建模板'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={onSave}
        width={900}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form layout="vertical" form={form}>
          <Form.Item name="name" label="模板名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="batch_type" label="批次类型" rules={[{ required: true }]}>
            <Select options={BATCH_TYPE_OPTIONS as any} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input />
          </Form.Item>
          <Form.List name="primary_keys">
            {(fields, { add, remove }) => (
              <Card size="small" title="主键字段">
                {fields.map((field) => (
                  <Space key={field.key} align="start" style={{ display: 'flex', marginBottom: 8 }}>
                    <Form.Item name={[field.name, 'business_field']} rules={[{ required: true }]}>
                      <Input placeholder="业务字段，如 order_no" />
                    </Form.Item>
                    <Form.Item name={[field.name, 'channel_field']} rules={[{ required: true }]}>
                      <Input placeholder="渠道字段，如 merchant_order_no" />
                    </Form.Item>
                    <Form.Item name={[field.name, 'mode']} initialValue="exact">
                      <Select options={MATCH_MODE_OPTIONS} style={{ width: 110 }} />
                    </Form.Item>
                    <Form.Item name={[field.name, 'weight']} initialValue={100}>
                      <InputNumber min={1} max={999} />
                    </Form.Item>
                    <Button onClick={() => remove(field.name)}>删除</Button>
                  </Space>
                ))}
                <Button onClick={() => add({ mode: 'exact', weight: 100 })}>新增主键</Button>
              </Card>
            )}
          </Form.List>

          <Form.List name="auxiliary_fields">
            {(fields, { add, remove }) => (
              <Card size="small" title="辅助字段" style={{ marginTop: 12 }}>
                {fields.map((field) => (
                  <Space key={field.key} align="start" style={{ display: 'flex', marginBottom: 8 }}>
                    <Form.Item name={[field.name, 'business_field']}>
                      <Input placeholder="业务辅助字段" />
                    </Form.Item>
                    <Form.Item name={[field.name, 'channel_field']}>
                      <Input placeholder="渠道辅助字段" />
                    </Form.Item>
                    <Form.Item name={[field.name, 'required']} valuePropName="checked" initialValue={false}>
                      <Switch checkedChildren="必需" unCheckedChildren="可选" />
                    </Form.Item>
                    <Form.Item name={[field.name, 'mode']} initialValue="exact">
                      <Select options={[{ label: '精确', value: 'exact' }, { label: '包含', value: 'contains' }]} style={{ width: 100 }} />
                    </Form.Item>
                    <Button onClick={() => remove(field.name)}>删除</Button>
                  </Space>
                ))}
                <Button onClick={() => add({ required: false, mode: 'exact' })}>新增辅助字段</Button>
              </Card>
            )}
          </Form.List>

          <Card size="small" title="金额与日期字段" style={{ marginTop: 12 }}>
            <Space wrap>
              <Form.Item name={['amount_check', 'business_field']} label="业务金额字段" rules={[{ required: true }]}>
                <Input placeholder="order_amount" />
              </Form.Item>
              <Form.Item name={['amount_check', 'channel_field']} label="渠道金额字段" rules={[{ required: true }]}>
                <Input placeholder="amount" />
              </Form.Item>
              <Form.Item name={['amount_check', 'tolerance']} label="金额容差(分)">
                <InputNumber min={0} />
              </Form.Item>
              <Form.Item name={['date_check', 'business_field']} label="业务日期字段" rules={[{ required: true }]}>
                <Input placeholder="trans_date" />
              </Form.Item>
              <Form.Item name={['date_check', 'channel_field']} label="渠道日期字段" rules={[{ required: true }]}>
                <Input placeholder="trans_date" />
              </Form.Item>
              <Form.Item name={['date_check', 'rolling_days']} label="滚动天数">
                <InputNumber min={0} />
              </Form.Item>
              <Form.Item name={['date_check', 'allow_empty_date']} label="允许空日期" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Space>
          </Card>

          <Form.Item label="设为默认模板" style={{ marginTop: 12 }}>
            <Switch checked={isDefault} onChange={setIsDefault} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
};

export default ReconciliationTemplatesPage;
