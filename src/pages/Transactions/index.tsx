import React, { useState } from 'react';
import { Table, Card, Form, Row, Col, DatePicker, Select, Input, Button, Space, Drawer, Descriptions } from 'antd';
import { SearchOutlined, ExportOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { transactionApi } from '../../services/transaction';
import type { Transaction } from '../../types';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

const Transactions: React.FC = () => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState<Record<string, unknown>>({});
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [form] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['transactions', page, pageSize, filters],
    queryFn: () => transactionApi.list({ page, pageSize, ...filters }),
  });

  const handleSearch = () => {
    const values = form.getFieldsValue();
    const newFilters: Record<string, unknown> = {};

    if (values.dateRange) {
      newFilters.startDate = values.dateRange[0].format('YYYY-MM-DD');
      newFilters.endDate = values.dateRange[1].format('YYYY-MM-DD');
    }
    if (values.transType) {
      newFilters.transType = values.transType;
    }
    if (values.search) {
      newFilters.search = values.search;
    }

    setFilters(newFilters);
    setPage(1);
  };

  const columns = [
    {
      title: '交易日期',
      dataIndex: 'trans_date',
      key: 'trans_date',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
    },
    { title: '交易时间', dataIndex: 'trans_time', key: 'trans_time' },
    { title: '流水号', dataIndex: 'lakala_serial', key: 'lakala_serial' },
    { title: '交易类型', dataIndex: 'trans_type', key: 'trans_type' },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      render: (v: number) => `¥${(v / 100).toFixed(2)}`,
    },
    {
      title: '手续费',
      dataIndex: 'fee',
      key: 'fee',
      render: (v: number) => `¥${(v / 100).toFixed(2)}`,
    },
    { title: '支付渠道', dataIndex: 'pay_channel', key: 'pay_channel' },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: Transaction) => (
        <Button type="link" onClick={() => setSelectedTransaction(record)}>
          详情
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Form form={form} layout="inline">
          <Row gutter={16}>
            <Col>
              <Form.Item name="dateRange" label="日期范围">
                <RangePicker />
              </Form.Item>
            </Col>
            <Col>
              <Form.Item name="transType" label="交易类型">
                <Select
                  allowClear
                  style={{ width: 120 }}
                  options={[
                    { value: 'CONSUMPTION', label: '消费' },
                    { value: 'REFUND', label: '退款' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col>
              <Form.Item name="search" label="搜索">
                <Input placeholder="流水号/订单号" style={{ width: 150 }} />
              </Form.Item>
            </Col>
            <Col>
              <Space>
                <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
                  查询
                </Button>
                <Button icon={<ExportOutlined />}>导出</Button>
              </Space>
            </Col>
          </Row>
        </Form>
      </Card>

      <Table
        columns={columns}
        dataSource={data?.list || []}
        rowKey="id"
        loading={isLoading}
        pagination={{
          current: page,
          pageSize,
          total: data?.pagination.total || 0,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
      />

      <Drawer
        title="交易详情"
        placement="right"
        width={500}
        onClose={() => setSelectedTransaction(null)}
        open={!!selectedTransaction}
      >
        {selectedTransaction && (
          <Descriptions column={1} bordered>
            <Descriptions.Item label="流水号">{selectedTransaction.lakala_serial}</Descriptions.Item>
            <Descriptions.Item label="交易日期">{selectedTransaction.trans_date}</Descriptions.Item>
            <Descriptions.Item label="交易时间">{selectedTransaction.trans_time}</Descriptions.Item>
            <Descriptions.Item label="交易类型">{selectedTransaction.trans_type}</Descriptions.Item>
            <Descriptions.Item label="金额">¥{(selectedTransaction.amount / 100).toFixed(2)}</Descriptions.Item>
            <Descriptions.Item label="手续费">¥{(selectedTransaction.fee / 100).toFixed(2)}</Descriptions.Item>
            <Descriptions.Item label="结算金额">¥{(selectedTransaction.settle_amount / 100).toFixed(2)}</Descriptions.Item>
            <Descriptions.Item label="支付渠道">{selectedTransaction.pay_channel}</Descriptions.Item>
            <Descriptions.Item label="商户订单号">{selectedTransaction.merchant_order_no}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </div>
  );
};

export default Transactions;
