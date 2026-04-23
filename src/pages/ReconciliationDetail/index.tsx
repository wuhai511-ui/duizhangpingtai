import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { reconciliationApi } from '../../services/reconciliation';

const { Title, Text } = Typography;

function useBatchIdFromLocation(): string | null {
  const pathname = window.location.pathname;
  const match = pathname.match(/\/reconciliation\/batches\/([^/]+)/);
  return match?.[1] || null;
}

const RESULT_TYPE_OPTIONS = [
  { label: '全部结果', value: '' },
  { label: '匹配', value: 'MATCH' },
  { label: '滚动匹配', value: 'ROLLING' },
  { label: '长款', value: 'LONG' },
  { label: '短款', value: 'SHORT' },
  { label: '金额差异', value: 'AMOUNT_MISMATCH' },
];

const ORDER_VS_JY_BUSINESS_KEY_OPTIONS = [
  { label: 'order_no（订单号）', value: 'order_no' },
  { label: 'orig_serial_no（父单号）', value: 'orig_serial_no' },
  { label: 'pay_serial_no（支付流水号）', value: 'pay_serial_no' },
];

const ORDER_VS_JY_CHANNEL_KEY_OPTIONS = [
  { label: 'merchant_order_no（商户订单号）', value: 'merchant_order_no' },
  { label: 'lakala_serial（渠道流水号）', value: 'lakala_serial' },
  { label: 'pay_order_no（支付端订单号）', value: 'pay_order_no' },
  { label: 'external_serial（外部流水号）', value: 'external_serial' },
  { label: 'sys_ref_no（系统参考号）', value: 'sys_ref_no' },
];

const MATCH_MODE_OPTIONS = [
  { label: 'exact', value: 'exact' },
  { label: 'contains', value: 'contains' },
  { label: 'prefix', value: 'prefix' },
  { label: 'suffix', value: 'suffix' },
];

const ReconciliationDetailPage: React.FC = () => {
  const batchId = useBatchIdFromLocation();
  const [resultType, setResultType] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [businessField, setBusinessField] = useState('order_no');
  const [channelField, setChannelField] = useState('merchant_order_no');
  const [matchMode, setMatchMode] = useState<'exact' | 'contains' | 'prefix' | 'suffix'>('exact');

  const batchQuery = useQuery({
    queryKey: ['reconciliation-batch', batchId],
    queryFn: () => reconciliationApi.getBatch(batchId as string),
    enabled: Boolean(batchId),
  });

  const detailsQuery = useQuery({
    queryKey: ['reconciliation-batch-details', batchId, page, pageSize, resultType],
    queryFn: () =>
      reconciliationApi.getBatchDetails(batchId as string, {
        page,
        pageSize,
        result_type: resultType || undefined,
      }),
    enabled: Boolean(batchId),
  });

  useEffect(() => {
    const cfg = batchQuery.data?.match_key_config;
    if (cfg?.business_field) setBusinessField(cfg.business_field);
    if (cfg?.channel_field) setChannelField(cfg.channel_field);
    if (cfg?.mode && ['exact', 'contains', 'prefix', 'suffix'].includes(cfg.mode)) {
      setMatchMode(cfg.mode as 'exact' | 'contains' | 'prefix' | 'suffix');
    }
  }, [batchQuery.data?.match_key_config]);

  const updateMatchKeyMutation = useMutation({
    mutationFn: () =>
      reconciliationApi.updateBatchMatchKey(batchId as string, {
        business_field: businessField,
        channel_field: channelField,
        mode: matchMode,
        rerun: true,
      }),
    onSuccess: () => {
      message.success('主键已更新并重跑完成');
      void batchQuery.refetch();
      void detailsQuery.refetch();
      setPage(1);
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message || error?.message || '修改主键失败';
      message.error(msg);
    },
  });

  const columns = useMemo(
    () => [
      { title: '流水号', dataIndex: 'serial_no', key: 'serial_no', width: 220 },
      {
        title: '结果类型',
        dataIndex: 'result_type',
        key: 'result_type',
        width: 140,
        render: (value: string) => <Tag>{value}</Tag>,
      },
      { title: '业务金额', dataIndex: 'business_amount', key: 'business_amount', width: 120 },
      { title: '渠道金额', dataIndex: 'channel_amount', key: 'channel_amount', width: 120 },
      { title: '差异金额', dataIndex: 'diff_amount', key: 'diff_amount', width: 120 },
      { title: '匹配日期', dataIndex: 'match_date', key: 'match_date', width: 140 },
      { title: '匹配主键', dataIndex: 'match_key', key: 'match_key', width: 220 },
      { title: '匹配方式', dataIndex: 'match_mode', key: 'match_mode', width: 140 },
    ],
    [],
  );

  if (!batchId) {
    return <Alert type="error" showIcon message="缺少批次 ID，无法查看对账详情。" />;
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <div>
              <Title level={4} style={{ marginBottom: 4 }}>
                对账详情
              </Title>
              <Text type="secondary">批次 ID：{batchId}</Text>
            </div>
            <Button onClick={() => window.history.back()}>返回</Button>
          </Space>

          {batchQuery.isLoading ? (
            <Spin />
          ) : batchQuery.data ? (
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="批次号">{batchQuery.data.batch_no}</Descriptions.Item>
              <Descriptions.Item label="对账类型">{batchQuery.data.batch_type}</Descriptions.Item>
              <Descriptions.Item label="对账日期">{batchQuery.data.check_date || '-'}</Descriptions.Item>
              <Descriptions.Item label="状态">{batchQuery.data.status}</Descriptions.Item>
              <Descriptions.Item label="总记录数">{batchQuery.data.record_count}</Descriptions.Item>
              <Descriptions.Item label="总金额">{batchQuery.data.total_amount}</Descriptions.Item>
              <Descriptions.Item label="匹配">{batchQuery.data.match_count ?? 0}</Descriptions.Item>
              <Descriptions.Item label="滚动匹配">{batchQuery.data.rolling_count ?? 0}</Descriptions.Item>
              <Descriptions.Item label="长款">{batchQuery.data.long_count ?? 0}</Descriptions.Item>
              <Descriptions.Item label="短款">{batchQuery.data.short_count ?? 0}</Descriptions.Item>
              <Descriptions.Item label="金额差异">{batchQuery.data.amount_diff_count ?? 0}</Descriptions.Item>
              <Descriptions.Item label="本次匹配主键">
                {batchQuery.data.match_key_config
                  ? `${batchQuery.data.match_key_config.business_field} vs ${batchQuery.data.match_key_config.channel_field}`
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="主键匹配方式">
                {batchQuery.data.match_key_config?.mode || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="错误信息">{batchQuery.data.error_msg || '-'}</Descriptions.Item>
            </Descriptions>
          ) : (
            <Alert type="warning" showIcon message="批次不存在或尚未加载成功。" />
          )}

          {batchQuery.data?.batch_type === 'ORDER_VS_JY' ? (
            <Card size="small" title="修改对账主键并重跑">
              <Space wrap>
                <Select
                  style={{ width: 220 }}
                  value={businessField}
                  onChange={setBusinessField}
                  options={ORDER_VS_JY_BUSINESS_KEY_OPTIONS}
                />
                <Select
                  style={{ width: 260 }}
                  value={channelField}
                  onChange={setChannelField}
                  options={ORDER_VS_JY_CHANNEL_KEY_OPTIONS}
                />
                <Select
                  style={{ width: 140 }}
                  value={matchMode}
                  onChange={(value) => setMatchMode(value as 'exact' | 'contains' | 'prefix' | 'suffix')}
                  options={MATCH_MODE_OPTIONS}
                />
                <Button
                  type="primary"
                  loading={updateMatchKeyMutation.isPending}
                  onClick={() => updateMatchKeyMutation.mutate()}
                >
                  保存并重跑
                </Button>
              </Space>
            </Card>
          ) : null}
        </Space>
      </Card>

      <Card
        title="对账明细"
        extra={
          <Select
            value={resultType}
            onChange={(value) => {
              setResultType(value);
              setPage(1);
            }}
            options={RESULT_TYPE_OPTIONS}
            style={{ width: 180 }}
          />
        }
      >
        <Table
          rowKey="id"
          loading={detailsQuery.isLoading}
          columns={columns}
          dataSource={detailsQuery.data?.list || []}
          scroll={{ x: 1200 }}
          pagination={{
            current: page,
            pageSize,
            total: detailsQuery.data?.pagination?.total || 0,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage);
              setPageSize(nextPageSize);
            },
          }}
        />
      </Card>
    </Space>
  );
};

export default ReconciliationDetailPage;
