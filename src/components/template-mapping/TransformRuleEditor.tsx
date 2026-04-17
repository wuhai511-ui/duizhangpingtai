import React from 'react';
import { Select } from 'antd';
import type { BusinessOrderCanonicalField, TransformRule } from '../../types';

const options: Array<{ label: string; value: TransformRule }> = [
  { label: '原值', value: 'identity' },
  { label: '去空格', value: 'trim' },
  { label: '元转分', value: 'yuan_to_fen' },
  { label: '分值保持', value: 'fen_identity' },
  { label: '日期时间转日期', value: 'datetime_to_date' },
  { label: 'Excel 日期转日期', value: 'excel_date_to_date' },
  { label: '仅保留数字', value: 'strip_non_digits' },
  { label: '空值转 null', value: 'empty_to_null' },
];

interface TransformRuleEditorProps {
  value?: TransformRule;
  targetField: BusinessOrderCanonicalField;
  onChange: (value: TransformRule) => void;
}

const TransformRuleEditor: React.FC<TransformRuleEditorProps> = ({
  value,
  targetField,
  onChange,
}) => {
  return (
    <Select
      value={value || 'identity'}
      onChange={onChange}
      options={options}
      style={{ width: '100%' }}
      placeholder={`选择 ${targetField} 的转换规则`}
    />
  );
};

export default TransformRuleEditor;
