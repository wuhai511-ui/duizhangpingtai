import React from 'react';
import { Menu } from 'antd';
import {
  DashboardOutlined,
  ShopOutlined,
  TransactionOutlined,
  SyncOutlined,
  RobotOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppStore } from '../../stores/appStore';

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/merchants', icon: <ShopOutlined />, label: '商户管理' },
  { key: '/transactions', icon: <TransactionOutlined />, label: '交易查询' },
  { key: '/reconciliation', icon: <SyncOutlined />, label: '对账管理' },
  { key: '/reconciliation-templates', icon: <SettingOutlined />, label: '账单模板' },
  { key: '/ai-query', icon: <RobotOutlined />, label: 'AI查询' },
];

const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { sidebarCollapsed } = useAppStore();

  return (
    <Menu
      mode="inline"
      selectedKeys={[location.pathname]}
      items={menuItems}
      onClick={({ key }) => navigate(key)}
      inlineCollapsed={sidebarCollapsed}
      style={{ height: '100%', borderRight: 0 }}
    />
  );
};

export default Sidebar;
