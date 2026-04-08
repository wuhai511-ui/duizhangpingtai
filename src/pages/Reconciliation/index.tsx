import React, { useState } from 'react';
import { Table, Card, Tag, Button, DatePicker, Space, Progress, Modal, Descriptions } from 'antd';
import { SyncOutlined, EyeOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const Reconciliation: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState(dayjs().subtract(1, 'day').format('YYYY-MM-DD'));
  const [detailVisible, setDetailVisible] = useState(false);

  const mockData = [
    {
      key: '1',
      batch_id: 'BATCH20260407001',
      check_date: '2026-04-07',
      file_type: 'JY',
      record_count: 156,
      match_count: 153,
      mismatch_count: 3,
      status: 1,
    },
    {
      key: '2',
      batch_id: 'BATCH20260407002',
      check_date: '2026-04-07',
      file_type: 'JS',
      record_count: 148,
      match_count: 148,
      mismatch_count: 0,
      status: 1,
    },
    {
      key: '3',
      batch_id: 'BATCH20260407003',
      check_date: '2026-04-07',
      file_type: 'SEP',
      record_count: 89,
      match_count: 87,
      mismatch_count: 2,
      status: 1,
    },
  ];

  const columns = [
    { title: '批次号', dataIndex: 'batch_id', key: 'batch_id' },
    { title: '对账日期', dataIndex: 'check_date', key: 'check_date' },
    { title: '文件类型', dataIndex: 'file_type', key: 'file_type' },
    { title: '记录数', dataIndex: 'record_count', key: 'record_count' },
    { title: '匹配数', dataIndex: 'match_count', key: 'match_count' },
    {
      title: '差异',
      dataIndex: 'mismatch_count',
      key: 'mismatch_count',
      render: (v: number) => <Tag color={v > 0 ? 'orange' : 'green'}>{v}</Tag>,
    },
    {
      title: '匹配率',
      key: 'match_rate',
      render: (_: unknown, record: { record_count: number; match_count: number }) => {
        const rate = record.record_count > 0 ? (record.match_count / record.record_count) * 100 : 0;
        return <Progress percent={rate} size="small" status={rate === 100 ? 'success' : 'normal'} />;
      },
    },
    {
      title: '操作',
      key: 'action',
      render: () => (
        <Space>
          <Button type="link" icon={<EyeOutlined />} onClick={() => setDetailVisible(true)}>
            详情
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Space>
          <span>对账日期：</span>
          <DatePicker
            value={dayjs(selectedDate)}
            onChange={(date) => setSelectedDate(date?.format('YYYY-MM-DD') || '')}
          />
          <Button type="primary" icon={<SyncOutlined />}>
            执行对账
          </Button>
        </Space>
      </Card>

      <Table columns={columns} dataSource={mockData} pagination={false} />

      <Modal
        title="对账详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={800}
      >
        <Descriptions column={2} bordered>
          <Descriptions.Item label="批次号">BATCH20260407001</Descriptions.Item>
          <Descriptions.Item label="对账日期">2026-04-07</Descriptions.Item>
          <Descriptions.Item label="文件类型">JY（交易明细）</Descriptions.Item>
          <Descriptions.Item label="记录数">156</Descriptions.Item>
          <Descriptions.Item label="匹配数">153</Descriptions.Item>
          <Descriptions.Item label="差异数">3</Descriptions.Item>
        </Descriptions>
      </Modal>
    </div>
  );
};

export default Reconciliation;
