import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import LoginPage from './pages/LoginPage';
import UsersPage from './pages/UsersPage';
import RolesPage from './pages/RolesPage';
import ServerPage from './pages/ServerPage';
import WorkflowPage from './pages/WorkflowPage';
import WorkflowDesignerPage from './pages/WorkflowDesignerPage';
import ExecutionHistoryPage from './pages/ExecutionHistoryPage';
import { useAuth } from './context/AuthContext';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    const { isAuthenticated } = useAuth();
    const location = useLocation();

    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return <>{children}</>;
};

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route
                    path="/"
                    element={
                        <ProtectedRoute>
                            <Layout />
                        </ProtectedRoute>
                    }
                >
                    <Route index element={<Dashboard />} />
                    <Route path="workflows" element={<WorkflowPage />} />
                    <Route path="workflows/new" element={<WorkflowDesignerPage />} />
                    <Route path="workflows/:id/edit" element={<WorkflowDesignerPage />} />
                    <Route path="history" element={<ExecutionHistoryPage />} />
                    <Route path="servers" element={<ServerPage />} />
                    <Route path="users" element={<UsersPage />} />
                    <Route path="roles" element={<RolesPage />} />
                    <Route path="settings" element={<div className="p-8 text-white">Settings coming soon...</div>} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
