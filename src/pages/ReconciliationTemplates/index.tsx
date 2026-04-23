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
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { reconciliationApi } from '../../services/reconciliation';
import type { ReconBatchType, ReconTemplateConfig, ReconTemplateConfigItem } from '../../types';

const { Title, Text } = Typography;

const BATCH_TYPE_OPTIONS = [
  { label: '业务订单 vs JY', value: 'ORDER_VS_JY' },
  { label: 'JY vs JS', value: 'JY_VS_JS' },
] as const;

const MATCH_MODE_OPTIONS = [
  { label: '精确匹配', value: 'exact' },
  { label: '前缀匹配', value: 'prefix' },
  { label: '后缀匹配', value: 'suffix' },
  { label: '包含匹配', value: 'contains' },
] as const;

const AMOUNT_TRANSFORM_OPTIONS = [
  { label: '自动', value: 'auto' },
  { label: '分(原值)', value: 'fen_identity' },
  { label: '元转分', value: 'yuan_to_fen' },
];

const FIELD_MAPPING_TRANSFORM_OPTIONS = [
  { label: '不转换', value: 'identity' },
  { label: '去空格', value: 'trim' },
  { label: '转大写', value: 'upper' },
  { label: '转小写', value: 'lower' },
  { label: '元转分', value: 'yuan_to_fen' },
  { label: '分(原值)', value: 'fen_identity' },
];

const ORDER_VS_JY_BUSINESS_FIELDS = [
  'orig_serial_no',
  'order_no',
  'pay_serial_no',
  'order_amount',
  'trans_date',
  'channel_fee',
];

const ORDER_VS_JY_CHANNEL_FIELDS = [
  'merchant_order_no',
  'lakala_serial',
  'amount',
  'fee',
  'settle_amount',
  'trans_date',
  'pay_order_no',
  'pay_channel',
];

const JY_VS_JS_BUSINESS_FIELDS = [
  'lakala_serial',
  'merchant_order_no',
  'amount',
  'fee',
  'settle_amount',
  'trans_date',
];

const JY_VS_JS_CHANNEL_FIELDS = [
  'lakala_serial',
  'amount',
  'fee',
  'settle_amount',
  'settle_date',
];

function getFieldOptions(batchType: ReconBatchType) {
  if (batchType === 'JY_VS_JS') {
    return {
      business: JY_VS_JS_BUSINESS_FIELDS,
      channel: JY_VS_JS_CHANNEL_FIELDS,
    };
  }
  return {
    business: ORDER_VS_JY_BUSINESS_FIELDS,
    channel: ORDER_VS_JY_CHANNEL_FIELDS,
  };
}

function buildDefaultTemplate(batchType: ReconBatchType): ReconTemplateConfig {
  if (batchType === 'JY_VS_JS') {
    return {
      id: '',
      name: '新对账模板',
      batch_type: 'JY_VS_JS',
      description: '',
      business_source: { table: 'JyTransaction', file_type: 'JY' },
      channel_source: { table: 'JsSettlement', file_type: 'JS' },
      primary_keys: [{ mode: 'exact', business_field: 'lakala_serial', channel_field: 'lakala_serial', weight: 100 }],
      auxiliary_fields: [],
      amount_check: {
        business_field: 'settle_amount',
        channel_field: 'settle_amount',
        tolerance: 0,
        strict: true,
        business_transform: 'fen_identity',
        channel_transform: 'fen_identity',
      },
      date_check: {
        business_field: 'trans_date',
        channel_field: 'settle_date',
        rolling_days: 3,
        allow_empty_date: false,
      },
      field_mappings: { business: [], channel: [] },
    };
  }
  return {
    id: '',
    name: '新对账模板',
    batch_type: 'ORDER_VS_JY',
    description: '',
    business_source: { table: 'BusinessOrder', file_type: 'BUSINESS_ORDER' },
    channel_source: { table: 'JyTransaction', file_type: 'JY' },
    primary_keys: [{ mode: 'exact', business_field: 'orig_serial_no', channel_field: 'merchant_order_no', weight: 100 }],
    auxiliary_fields: [{ business_field: 'pay_serial_no', channel_field: 'lakala_serial', required: false, mode: 'exact' }],
    amount_check: {
      business_field: 'order_amount',
      channel_field: 'amount',
      tolerance: 0,
      strict: true,
      business_transform: 'fen_identity',
      channel_transform: 'fen_identity',
    },
    date_check: {
      business_field: 'trans_date',
      channel_field: 'trans_date',
      rolling_days: 3,
      allow_empty_date: true,
    },
    field_mappings: { business: [], channel: [] },
  };
}

const ReconciliationTemplatesPage: React.FC = () => {
  const [batchType, setBatchType] = useState<ReconBatchType>('ORDER_VS_JY');
  const [editing, setEditing] = useState<ReconTemplateConfigItem | null>(null);
  const [open, setOpen] = useState(false);
  const [isDefault, setIsDefault] = useState(true);
  const [form] = Form.useForm<any>();

  const listQuery = useQuery({
    queryKey: ['recon-template-configs', batchType],
    queryFn: () => reconciliationApi.listTemplateConfigs(batchType),
  });

  const createMutation = useMutation({
    mutationFn: (payload: { template: ReconTemplateConfig; is_default?: boolean }) =>
      reconciliationApi.createTemplateConfig(payload),
    onSuccess: () => {
      message.success('模板创建成功');
      setOpen(false);
      listQuery.refetch();
    },
    onError: (e: any) => message.error(e?.message || '模板创建失败'),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; template: ReconTemplateConfig; is_default?: boolean }) =>
      reconciliationApi.updateTemplateConfig(payload.id, {
        template: payload.template,
        is_default: payload.is_default,
      }),
    onSuccess: () => {
      message.success('模板更新成功');
      setOpen(false);
      listQuery.refetch();
    },
    onError: (e: any) => message.error(e?.message || '模板更新失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => reconciliationApi.deleteTemplateConfig(id),
    onSuccess: () => {
      message.success('模板删除成功');
      listQuery.refetch();
    },
    onError: (e: any) => message.error(e?.message || '模板删除失败'),
  });

  const rows = useMemo(() => listQuery.data || [], [listQuery.data]);

  const openCreate = () => {
    setEditing(null);
    form.setFieldsValue(buildDefaultTemplate(batchType) as any);
    setIsDefault(true);
    setOpen(true);
  };

  const openEdit = (item: ReconTemplateConfigItem) => {
    setEditing(item);
    form.setFieldsValue({
      ...item.template,
      field_mappings: {
        business: item.template.field_mappings?.business || [],
        channel: item.template.field_mappings?.channel || [],
      },
    } as any);
    setIsDefault(item.is_default);
    setOpen(true);
  };

  const openClone = (item: ReconTemplateConfigItem) => {
    setEditing(null);
    form.setFieldsValue({
      ...item.template,
      name: `${item.template.name}_自定义`,
      field_mappings: {
        business: item.template.field_mappings?.business || [],
        channel: item.template.field_mappings?.channel || [],
      },
    } as any);
    setIsDefault(item.is_default);
    setOpen(true);
  };

  const onSave = async () => {
    const values = (await form.validateFields()) as ReconTemplateConfig;
    const payload = { template: values, is_default: isDefault };
    if (editing) {
      updateMutation.mutate({ id: editing.id, ...payload });
      return;
    }
    createMutation.mutate(payload);
  };

  const modalBatchType = Form.useWatch('batch_type', form) || batchType;
  const modalFieldOptions = getFieldOptions(modalBatchType);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Space direction="vertical" size={8}>
          <Title level={4} style={{ margin: 0 }}>
            账单模板配置
          </Title>
          <Text type="secondary">
            支持配置主键、金额/日期、字段映射（上传表头或源字段到数据库字段）和转换逻辑。
          </Text>
        </Space>
      </Card>

      <Card
        title="模板列表"
        extra={(
          <Space>
            <Select
              value={batchType}
              onChange={(value) => setBatchType(value)}
              options={BATCH_TYPE_OPTIONS as any}
              style={{ width: 180 }}
            />
            <Button type="primary" onClick={openCreate}>新建模板</Button>
          </Space>
        )}
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
              render: (_: unknown, row: ReconTemplateConfigItem) => (
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
              width: 280,
              render: (_: unknown, row: ReconTemplateConfigItem) =>
                row.template.primary_keys.map((pk) => `${pk.business_field} -> ${pk.channel_field}`).join(' ; '),
            },
            {
              title: '金额字段',
              width: 280,
              render: (_: unknown, row: ReconTemplateConfigItem) =>
                `${row.template.amount_check.business_field} -> ${row.template.amount_check.channel_field} (容差${row.template.amount_check.tolerance || 0})`,
            },
            {
              title: '字段映射',
              width: 120,
              render: (_: unknown, row: ReconTemplateConfigItem) => {
                const b = row.template.field_mappings?.business?.length || 0;
                const c = row.template.field_mappings?.channel?.length || 0;
                return `${b}/${c}`;
              },
            },
            {
              title: '操作',
              width: 220,
              render: (_: unknown, row: ReconTemplateConfigItem) => (
                <Space>
                  {row.readonly ? (
                    <Button type="link" size="small" onClick={() => openClone(row)}>
                      复制并编辑
                    </Button>
                  ) : (
                    <>
                      <Button type="link" size="small" onClick={() => openEdit(row)}>
                        编辑
                      </Button>
                      <Popconfirm
                        title="确认删除该模板？"
                        onConfirm={() => deleteMutation.mutate(row.id)}
                      >
                        <Button type="link" size="small" danger>删除</Button>
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
        width={1120}
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
                      <Select
                        showSearch
                        style={{ width: 180 }}
                        options={modalFieldOptions.business.map((item) => ({ label: item, value: item }))}
                        placeholder="业务字段"
                      />
                    </Form.Item>
                    <Form.Item name={[field.name, 'channel_field']} rules={[{ required: true }]}>
                      <Select
                        showSearch
                        style={{ width: 180 }}
                        options={modalFieldOptions.channel.map((item) => ({ label: item, value: item }))}
                        placeholder="渠道字段"
                      />
                    </Form.Item>
                    <Form.Item name={[field.name, 'mode']} initialValue="exact">
                      <Select options={MATCH_MODE_OPTIONS as any} style={{ width: 120 }} />
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
                      <Select
                        showSearch
                        style={{ width: 180 }}
                        options={modalFieldOptions.business.map((item) => ({ label: item, value: item }))}
                        placeholder="业务辅助字段"
                      />
                    </Form.Item>
                    <Form.Item name={[field.name, 'channel_field']}>
                      <Select
                        showSearch
                        style={{ width: 180 }}
                        options={modalFieldOptions.channel.map((item) => ({ label: item, value: item }))}
                        placeholder="渠道辅助字段"
                      />
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
                <Select
                  style={{ width: 180 }}
                  options={modalFieldOptions.business.map((item) => ({ label: item, value: item }))}
                />
              </Form.Item>
              <Form.Item name={['amount_check', 'channel_field']} label="渠道金额字段" rules={[{ required: true }]}>
                <Select
                  style={{ width: 180 }}
                  options={modalFieldOptions.channel.map((item) => ({ label: item, value: item }))}
                />
              </Form.Item>
              <Form.Item name={['amount_check', 'business_transform']} label="业务金额转换" initialValue="fen_identity">
                <Select options={AMOUNT_TRANSFORM_OPTIONS} style={{ width: 130 }} />
              </Form.Item>
              <Form.Item name={['amount_check', 'channel_transform']} label="渠道金额转换" initialValue="fen_identity">
                <Select options={AMOUNT_TRANSFORM_OPTIONS} style={{ width: 130 }} />
              </Form.Item>
              <Form.Item name={['amount_check', 'tolerance']} label="金额容差(分)">
                <InputNumber min={0} />
              </Form.Item>
              <Form.Item name={['date_check', 'business_field']} label="业务日期字段" rules={[{ required: true }]}>
                <Select
                  style={{ width: 180 }}
                  options={modalFieldOptions.business.map((item) => ({ label: item, value: item }))}
                />
              </Form.Item>
              <Form.Item name={['date_check', 'channel_field']} label="渠道日期字段" rules={[{ required: true }]}>
                <Select
                  style={{ width: 180 }}
                  options={modalFieldOptions.channel.map((item) => ({ label: item, value: item }))}
                />
              </Form.Item>
              <Form.Item name={['date_check', 'rolling_days']} label="滚动天数">
                <InputNumber min={0} />
              </Form.Item>
              <Form.Item name={['date_check', 'allow_empty_date']} label="允许空日期" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Space>
          </Card>

          <Card size="small" title="字段映射编辑器（上传表头/源字段 -> 数据库字段）" style={{ marginTop: 12 }}>
            <Tabs
              items={[
                {
                  key: 'business',
                  label: '业务侧映射',
                  children: (
                    <Form.List name={['field_mappings', 'business']}>
                      {(fields, { add, remove }) => (
                        <>
                          {fields.map((field) => (
                            <Space key={field.key} align="start" style={{ display: 'flex', marginBottom: 8 }}>
                              <Form.Item
                                name={[field.name, 'source_field']}
                                rules={[{ required: true, message: '请输入源字段/上传表头' }]}
                              >
                                <Input style={{ width: 260 }} placeholder="源字段/上传表头，例如：父单号" />
                              </Form.Item>
                              <Form.Item
                                name={[field.name, 'target_field']}
                                rules={[{ required: true, message: '请选择目标数据库字段' }]}
                              >
                                <Select
                                  showSearch
                                  style={{ width: 220 }}
                                  options={modalFieldOptions.business.map((item) => ({ label: item, value: item }))}
                                  placeholder="目标数据库字段"
                                />
                              </Form.Item>
                              <Form.Item name={[field.name, 'transform']} initialValue="identity">
                                <Select
                                  style={{ width: 140 }}
                                  options={FIELD_MAPPING_TRANSFORM_OPTIONS}
                                  placeholder="转换逻辑"
                                />
                              </Form.Item>
                              <Button onClick={() => remove(field.name)}>删除</Button>
                            </Space>
                          ))}
                          <Button onClick={() => add({ transform: 'identity' })}>新增业务映射</Button>
                        </>
                      )}
                    </Form.List>
                  ),
                },
                {
                  key: 'channel',
                  label: '渠道侧映射',
                  children: (
                    <Form.List name={['field_mappings', 'channel']}>
                      {(fields, { add, remove }) => (
                        <>
                          {fields.map((field) => (
                            <Space key={field.key} align="start" style={{ display: 'flex', marginBottom: 8 }}>
                              <Form.Item
                                name={[field.name, 'source_field']}
                                rules={[{ required: true, message: '请输入源字段/上传表头' }]}
                              >
                                <Input style={{ width: 260 }} placeholder="源字段/上传表头，例如：商户订单号" />
                              </Form.Item>
                              <Form.Item
                                name={[field.name, 'target_field']}
                                rules={[{ required: true, message: '请选择目标数据库字段' }]}
                              >
                                <Select
                                  showSearch
                                  style={{ width: 220 }}
                                  options={modalFieldOptions.channel.map((item) => ({ label: item, value: item }))}
                                  placeholder="目标数据库字段"
                                />
                              </Form.Item>
                              <Form.Item name={[field.name, 'transform']} initialValue="identity">
                                <Select
                                  style={{ width: 140 }}
                                  options={FIELD_MAPPING_TRANSFORM_OPTIONS}
                                  placeholder="转换逻辑"
                                />
                              </Form.Item>
                              <Button onClick={() => remove(field.name)}>删除</Button>
                            </Space>
                          ))}
                          <Button onClick={() => add({ transform: 'identity' })}>新增渠道映射</Button>
                        </>
                      )}
                    </Form.List>
                  ),
                },
              ]}
            />
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
