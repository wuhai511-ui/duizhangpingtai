import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './components/Layout';
import AuthGuard from './components/AuthGuard';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Merchants from './pages/Merchants';
import Transactions from './pages/Transactions';
import Reconciliation from './pages/Reconciliation';
import AIQuery from './pages/AIQuery';
import ReconciliationTemplates from './pages/ReconciliationTemplates';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <AuthGuard>
              <MainLayout />
            </AuthGuard>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="merchants" element={<Merchants />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="reconciliation" element={<Reconciliation />} />
          <Route path="reconciliation-templates" element={<ReconciliationTemplates />} />
          <Route path="ai-query" element={<AIQuery />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
