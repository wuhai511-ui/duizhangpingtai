import React from 'react';
import { Table, Typography } from 'antd';

interface ColumnSampleTableProps {
  headers: string[];
  rows: string[][];
}

const ColumnSampleTable: React.FC<ColumnSampleTableProps> = ({ headers, rows }) => {
  const columns = headers.map((header, index) => ({
    title: header || `列 ${index + 1}`,
    dataIndex: String(index),
    key: String(index),
    ellipsis: true,
    width: 180,
  }));

  const dataSource = rows.map((row, rowIndex) => {
    const record: Record<string, string> = { key: String(rowIndex) };
    headers.forEach((_, index) => {
      record[String(index)] = row[index] || '';
    });
    return record;
  });

  if (headers.length === 0) {
    return <Typography.Text type="secondary">未识别到表头。</Typography.Text>;
  }

  return (
    <Table
      size="small"
      scroll={{ x: true }}
      pagination={false}
      columns={columns}
      dataSource={dataSource}
    />
  );
};

export default ColumnSampleTable;
