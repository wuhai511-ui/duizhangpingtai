import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Checkbox,
  Divider,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import ColumnSampleTable from './ColumnSampleTable';
import TransformRuleEditor from './TransformRuleEditor';
import { BUSINESS_ORDER_FIELD_LABELS } from './constants';
import {
  BUSINESS_ORDER_CANONICAL_FIELDS,
  REQUIRED_BUSINESS_ORDER_FIELDS,
} from '../../types/template';
import type {
  BusinessOrderCanonicalField,
  TemplateAnalyzeResult,
  TemplateMappingConfig,
  TransformRule,
} from '../../types';

interface MappingReviewModalProps {
  open: boolean;
  analysis: TemplateAnalyzeResult | null;
  loading?: boolean;
  onCancel: () => void;
  onSubmit: (payload: {
    templateName: string;
    mapping: TemplateMappingConfig;
    saveAsDefault: boolean;
  }) => void;
}

const MappingReviewModal: React.FC<MappingReviewModalProps> = ({
  open,
  analysis,
  loading,
  onCancel,
  onSubmit,
}) => {
  const [templateName, setTemplateName] = useState('业务订单模板');
  const [saveAsDefault, setSaveAsDefault] = useState(true);
  const [fieldMapping, setFieldMapping] = useState<Partial<Record<string, BusinessOrderCanonicalField>>>({});
  const [transforms, setTransforms] = useState<Partial<Record<BusinessOrderCanonicalField, TransformRule>>>({});

  useEffect(() => {
    if (!analysis) {
      return;
    }

    setFieldMapping(analysis.ai_mapping?.fieldMapping || {});
    setTransforms(analysis.ai_mapping?.transforms || {});
    setTemplateName(`业务订单模板_${new Date().toISOString().slice(0, 10)}`);
    setSaveAsDefault(true);
  }, [analysis]);

  const requiredMissing = useMemo(() => {
    const mappedFields = new Set(Object.values(fieldMapping).filter(Boolean));
    return REQUIRED_BUSINESS_ORDER_FIELDS.filter((field) => !mappedFields.has(field));
  }, [fieldMapping]);

  const headerOptions = (analysis?.profile.headers || []).map((header) => ({
    label: header,
    value: header,
  }));

  const fieldRows = BUSINESS_ORDER_CANONICAL_FIELDS.map((field) => ({
    key: field,
    field,
    label: BUSINESS_ORDER_FIELD_LABELS[field],
    required: (REQUIRED_BUSINESS_ORDER_FIELDS as readonly string[]).includes(field),
    sourceHeader:
      Object.entries(fieldMapping).find(([, target]) => target === field)?.[0] || undefined,
    transform: transforms[field],
  }));

  const handleHeaderChange = (field: BusinessOrderCanonicalField, sourceHeader?: string) => {
    const nextMapping = { ...fieldMapping };

    Object.keys(nextMapping).forEach((header) => {
      if (nextMapping[header] === field) {
        delete nextMapping[header];
      }
    });

    if (sourceHeader) {
      nextMapping[sourceHeader] = field;
    }

    setFieldMapping(nextMapping);
  };

  const handleSubmit = () => {
    if (!analysis) {
      return;
    }

    onSubmit({
      templateName,
      saveAsDefault,
      mapping: {
        fieldMapping,
        transforms,
        requiredMissing,
        unmappedColumns: analysis.profile.headers.filter((header) => !fieldMapping[header]),
        confidence: analysis.ai_mapping?.confidence || 0,
      },
    });
  };

  return (
    <Modal
      title="确认业务订单模板映射"
      open={open}
      width={1100}
      onCancel={onCancel}
      onOk={handleSubmit}
      okText="保存模板并导入"
      cancelText="取消"
      confirmLoading={loading}
      okButtonProps={{ disabled: requiredMissing.length > 0 || !templateName.trim() }}
    >
      {analysis && (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            type={requiredMissing.length > 0 ? 'warning' : 'success'}
            message={
              requiredMissing.length > 0
                ? `还缺少必填字段映射：${requiredMissing
                    .map((field) => BUSINESS_ORDER_FIELD_LABELS[field])
                    .join('、')}`
                : '核心字段已映射完成，可以直接导入。'
            }
          />

          <Space wrap>
            <Tag color="blue">格式：{analysis.profile.format}</Tag>
            <Tag color="cyan">列数：{analysis.profile.column_count}</Tag>
            <Tag color="purple">置信度：{Math.round((analysis.ai_mapping?.confidence || 0) * 100)}%</Tag>
          </Space>

          <Form layout="vertical">
            <Form.Item label="模板名称" required>
              <Input value={templateName} onChange={(event) => setTemplateName(event.target.value)} />
            </Form.Item>
            <Form.Item>
              <Checkbox checked={saveAsDefault} onChange={(event) => setSaveAsDefault(event.target.checked)}>
                保存为默认模板
              </Checkbox>
            </Form.Item>
          </Form>

          <Divider orientation="left">样例数据</Divider>
          <ColumnSampleTable
            headers={analysis.profile.headers}
            rows={analysis.profile.sample_rows}
          />

          <Divider orientation="left">字段映射</Divider>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '220px 1fr 220px',
              gap: 12,
              alignItems: 'center',
            }}
          >
            <Typography.Text strong>目标字段</Typography.Text>
            <Typography.Text strong>来源列</Typography.Text>
            <Typography.Text strong>转换规则</Typography.Text>

            {fieldRows.map((row) => (
              <React.Fragment key={row.key}>
                <Typography.Text>
                  {row.label}
                  {row.required ? <Tag color="red" style={{ marginLeft: 8 }}>必填</Tag> : null}
                </Typography.Text>
                <Select
                  allowClear
                  showSearch
                  placeholder="选择来源列"
                  options={headerOptions}
                  value={row.sourceHeader}
                  onChange={(value) => handleHeaderChange(row.field, value)}
                />
                <TransformRuleEditor
                  targetField={row.field}
                  value={row.transform}
                  onChange={(value) => setTransforms((prev) => ({ ...prev, [row.field]: value }))}
                />
              </React.Fragment>
            ))}
          </div>
        </Space>
      )}
    </Modal>
  );
};

export default MappingReviewModal;
