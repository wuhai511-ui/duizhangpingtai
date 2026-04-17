import React, { useMemo, useState } from 'react';
import { Alert, Button, Card, Descriptions, Select, Space, Spin, Table, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { reconciliationApi } from '../../services/reconciliation';

const { Title, Text } = Typography;

function useBatchIdFromLocation(): string | null {
  const pathname = window.location.pathname;
  const match = pathname.match(/\/reconciliation\/batches\/([^/]+)/);
  return match?.[1] || null;
}

const RESULT_TYPE_OPTIONS = [
  { label: '全部', value: '' },
  { label: '匹配', value: 'MATCH' },
  { label: '滚动匹配', value: 'ROLLING' },
  { label: '长款', value: 'LONG' },
  { label: '短款', value: 'SHORT' },
  { label: '金额差异', value: 'AMOUNT_MISMATCH' },
];

const ReconciliationDetailPage: React.FC = () => {
  const batchId = useBatchIdFromLocation();
  const [resultType, setResultType] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

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
              <Descriptions.Item label="错误信息">{batchQuery.data.error_msg || '-'}</Descriptions.Item>
            </Descriptions>
          ) : (
            <Alert type="warning" showIcon message="批次不存在或尚未加载成功。" />
          )}
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
          scroll={{ x: 900 }}
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
