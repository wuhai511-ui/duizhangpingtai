import React, { useState } from 'react';
import { Alert, Button, Card, message, Select, Space, Table, Tag, Typography } from 'antd';
import { useQuery, useMutation } from '@tanstack/react-query';
import { reconciliationApi } from '../../services/reconciliation';
import type { ReconciliationBatch } from '../../types';

const { Title, Text } = Typography;

const BATCH_TYPE_OPTIONS = [
  { label: '全部类型', value: '' },
  { label: '业务订单 vs JY', value: 'ORDER_VS_JY' },
  { label: 'JY vs JS', value: 'JY_VS_JS' },
];

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '待处理', value: '0' },
  { label: '处理中', value: '1' },
  { label: '完成', value: '2' },
  { label: '失败', value: '3' },
];

function openBatchDetail(id: string) {
  window.location.href = `/reconciliation-batch.html?batch_id=${encodeURIComponent(id)}`;
}

function formatStatus(value: number): { label: string; color: string } {
  switch (value) {
    case 0:
      return { label: '待处理', color: 'default' };
    case 1:
      return { label: '处理中', color: 'processing' };
    case 2:
      return { label: '完成', color: 'success' };
    case 3:
      return { label: '失败', color: 'error' };
    default:
      return { label: String(value), color: 'default' };
  }
}

const ReconciliationPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState('');
  const [batchType, setBatchType] = useState('');

  const batchesQuery = useQuery({
    queryKey: ['reconciliation-batches', page, pageSize, status, batchType],
    queryFn: () =>
      reconciliationApi.listBatches({
        page,
        pageSize,
        status: status ? Number(status) : undefined,
        batchType: batchType || undefined,
      }),
  });

  const rerunMutation = useMutation({
    mutationFn: ({ id, templateId }: { id: string; templateId?: string }) =>
      reconciliationApi.rerunBatch(id, templateId),
    onSuccess: () => {
      message.success('重新对账已完成');
      batchesQuery.refetch();
    },
    onError: (error: any) => {
      message.error('重新对账失败: ' + error.message);
    },
  });

  const handleRerun = (record: ReconciliationBatch) => {
    rerunMutation.mutate({ id: record.id });
  };

  const columns = [
    {
      title: '批次号',
      dataIndex: 'batch_no',
      key: 'batch_no',
      width: 220,
      render: (value: string) => <Text strong>{value}</Text>,
    },
    {
      title: '对账类型',
      dataIndex: 'batch_type',
      key: 'batch_type',
      width: 140,
      render: (value: string) => <Tag color="blue">{value}</Tag>,
    },
    {
      title: '对账日期',
      dataIndex: 'check_date',
      key: 'check_date',
      width: 130,
    },
    {
      title: '记录数',
      dataIndex: 'record_count',
      key: 'record_count',
      width: 100,
    },
    {
      title: '匹配',
      dataIndex: 'match_count',
      key: 'match_count',
      width: 80,
      render: (value: number | null | undefined) => value ?? 0,
    },
    {
      title: '长款',
      dataIndex: 'long_count',
      key: 'long_count',
      width: 80,
      render: (value: number | null | undefined) => value ?? 0,
    },
    {
      title: '短款',
      dataIndex: 'short_count',
      key: 'short_count',
      width: 80,
      render: (value: number | null | undefined) => value ?? 0,
    },
    {
      title: '金额差异',
      dataIndex: 'amount_diff_count',
      key: 'amount_diff_count',
      width: 100,
      render: (value: number | null | undefined) => value ?? 0,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (value: number) => {
        const statusMeta = formatStatus(value);
        return <Tag color={statusMeta.color}>{statusMeta.label}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right' as const,
      render: (_: unknown, record: ReconciliationBatch) => (
        <Space>
          <Button
            type="link"
            size="small"
            onClick={() => handleRerun(record)}
            loading={rerunMutation.isPending}
          >
            重新对账
          </Button>
          <Button type="link" size="small" onClick={() => openBatchDetail(record.id)}>
            查看明细
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div>
            <Title level={4} style={{ marginBottom: 4 }}>
              对账管理
            </Title>
            <Text type="secondary">集中查看对账批次结果，并从这里进入独立的对账详情页。</Text>
          </div>
          <Alert
            type="info"
            showIcon
            message="AI 对话中的对账结果和这里的批次列表，共用同一个详情页入口。"
          />
        </Space>
      </Card>

      <Card
        title="批次列表"
        extra={
          <Space wrap>
            <Select
              value={batchType}
              onChange={(value) => {
                setBatchType(value);
                setPage(1);
              }}
              options={BATCH_TYPE_OPTIONS}
              style={{ width: 180 }}
            />
            <Select
              value={status}
              onChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
              options={STATUS_OPTIONS}
              style={{ width: 150 }}
            />
          </Space>
        }
      >
        <Table
          rowKey="id"
          loading={batchesQuery.isLoading}
          columns={columns}
          dataSource={batchesQuery.data?.list || []}
          scroll={{ x: 1200 }}
          pagination={{
            current: page,
            pageSize,
            total: batchesQuery.data?.pagination?.total || 0,
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

export default ReconciliationPage;
