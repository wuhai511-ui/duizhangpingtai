import React from 'react';
import { Card, Row, Col, Statistic, Table, Tag } from 'antd';
import {
  TransactionOutlined,
  DollarOutlined,
  CheckCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';

const Dashboard: React.FC = () => {
  const stats = {
    todayTransactions: 156,
    todayAmount: 1256800,
    matchRate: 98.5,
    pendingDiffs: 3,
  };

  const chartOption = {
    title: { text: '近7天交易趋势' },
    xAxis: {
      type: 'category',
      data: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    },
    yAxis: { type: 'value' },
    series: [
      {
        data: [120, 200, 150, 80, 70, 110, 130],
        type: 'line',
        smooth: true,
      },
    ],
  };

  const columns = [
    { title: '流水号', dataIndex: 'serial', key: 'serial' },
    { title: '商户', dataIndex: 'merchant', key: 'merchant' },
    { title: '金额', dataIndex: 'amount', key: 'amount', render: (v: number) => `¥${(v / 100).toFixed(2)}` },
    { title: '状态', dataIndex: 'status', key: 'status', render: (v: string) => <Tag color={v === 'success' ? 'green' : 'orange'}>{v}</Tag> },
  ];

  const recentTransactions = [
    { key: '1', serial: 'JY001', merchant: '测试商户', amount: 10000, status: 'success' },
    { key: '2', serial: 'JY002', merchant: '测试商户', amount: 50000, status: 'success' },
    { key: '3', serial: 'JY003', merchant: '测试商户', amount: 30000, status: 'pending' },
  ];

  return (
    <div>
      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic
              title="今日交易笔数"
              value={stats.todayTransactions}
              prefix={<TransactionOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="今日交易金额"
              value={stats.todayAmount / 100}
              precision={2}
              prefix={<DollarOutlined />}
              suffix="元"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="对账匹配率"
              value={stats.matchRate}
              precision={2}
              prefix={<CheckCircleOutlined />}
              suffix="%"
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="待处理差异"
              value={stats.pendingDiffs}
              prefix={<WarningOutlined />}
              valueStyle={{ color: stats.pendingDiffs > 0 ? '#cf1322' : '#3f8600' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={16}>
          <Card>
            <ReactECharts option={chartOption} style={{ height: 300 }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card title="最近交易">
            <Table
              columns={columns}
              dataSource={recentTransactions}
              pagination={false}
              size="small"
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
