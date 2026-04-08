import React, { useState } from 'react';
import { Table, Card, Tag, Button, DatePicker, Space, Progress, Modal, Descriptions, Upload, message } from 'antd';
import { SyncOutlined, EyeOutlined, UploadOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import dayjs from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fileApi } from '../../services/file';

const Reconciliation: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState(dayjs().subtract(1, 'day').format('YYYY-MM-DD'));
  const [detailVisible, setDetailVisible] = useState(false);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const queryClient = useQueryClient();

  // 查询文件列表
  const { data: files = [], isLoading } = useQuery({
    queryKey: ['files', selectedDate],
    queryFn: () => fileApi.list({ pageSize: 100 }),
  });

  // 文件上传
  const uploadMutation = useMutation({
    mutationFn: (file: File) => fileApi.upload(file),
    onSuccess: (data) => {
      message.success(`文件上传成功，解析出 ${data.records} 条记录`);
      setUploadModalVisible(false);
      queryClient.invalidateQueries({ queryKey: ['files'] });
    },
    onError: (error) => {
      message.error(`上传失败：${(error as Error).message}`);
    },
  });

  const uploadProps: UploadProps = {
    beforeUpload: (file) => {
      const isValidType = ['text/plain', 'text/csv', 'application/octet-stream'].includes(file.type) ||
        file.name.endsWith('.txt') || file.name.endsWith('.csv') || file.name.endsWith('.dat');

      if (!isValidType) {
        message.error('只支持 .txt, .csv, .dat 格式的文件');
        return false;
      }

      uploadMutation.mutate(file);
      return false;
    },
    showUploadList: false,
    accept: '.txt,.csv,.dat',
  };

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

  // 文件列表表格列
  const fileColumns = [
    { title: '文件名', dataIndex: 'filename', key: 'filename' },
    {
      title: '文件类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => {
        const typeMap: Record<string, { label: string; color: string }> = {
          JY: { label: '交易明细', color: 'blue' },
          JS: { label: '结算明细', color: 'green' },
          SEP: { label: '代付明细', color: 'purple' },
        };
        const config = typeMap[type] || { label: type, color: 'default' };
        return <Tag color={config.color}>{config.label}</Tag>;
      },
    },
    { title: '记录数', dataIndex: 'records', key: 'records' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'processed' ? 'success' : 'processing'}>{status}</Tag>
      ),
    },
    {
      title: '上传时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (time: string) => dayjs(time).format('YYYY-MM-DD HH:mm:ss'),
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
          <Button icon={<UploadOutlined />} onClick={() => setUploadModalVisible(true)}>
            上传对账文件
          </Button>
        </Space>
      </Card>

      {/* 已上传文件列表 */}
      {files.length > 0 && (
        <Card title="已上传文件" style={{ marginBottom: 16 }}>
          <Table
            columns={fileColumns}
            dataSource={files.map((f, i) => ({ ...f, key: f.id || i }))}
            loading={isLoading}
            pagination={false}
            size="small"
          />
        </Card>
      )}

      <Card title="对账批次">
        <Table columns={columns} dataSource={mockData} pagination={false} />
      </Card>

      {/* 文件上传弹窗 */}
      <Modal
        title="上传对账文件"
        open={uploadModalVisible}
        onCancel={() => setUploadModalVisible(false)}
        footer={null}
        width={500}
      >
        <div style={{ padding: '24px 0' }}>
          <Upload.Dragger {...uploadProps} disabled={uploadMutation.isPending}>
            <p className="ant-upload-drag-icon">
              <UploadOutlined style={{ fontSize: 48, color: '#1890ff' }} />
            </p>
            <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
            <p className="ant-upload-hint">
              支持格式：.txt, .csv, .dat<br />
              文件类型：JY（交易明细）、JS（结算明细）、SEP（代付明细）
            </p>
          </Upload.Dragger>
          {uploadMutation.isPending && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Tag color="processing">正在上传并解析文件...</Tag>
            </div>
          )}
        </div>
      </Modal>

      {/* 对账详情弹窗 */}
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
