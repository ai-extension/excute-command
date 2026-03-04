import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import LoginPage from './pages/LoginPage';
import UsersPage from './pages/UsersPage';
import RolesPage from './pages/RolesPage';
import ServerPage from './pages/ServerPage';
import VpnPage from './pages/VpnPage';
import WorkflowPage from './pages/WorkflowPage';
import WorkflowDesignerPage from './pages/WorkflowDesignerPage';
import ExecutionHistoryPage from './pages/ExecutionHistoryPage';
import GlobalVariablesPage from './pages/GlobalVariablesPage';
import SchedulesPage from './pages/SchedulesPage';
import ScheduleDetailPage from './pages/ScheduleDetailPage';
import TagsPage from './pages/TagsPage';
import SettingsPage from './pages/SettingsPage';
import PagesListPage from './pages/PagesListPage';
import PageDesignerPage from './pages/PageDesignerPage';
import RolePermissionsPage from './pages/RolePermissionsPage';
import PublicPageView from './pages/PublicPageView';
import ProfilePage from './pages/ProfilePage';
import APIKeysPage from './pages/APIKeysPage';
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
                    <Route path="vpns" element={<VpnPage />} />
                    <Route path="users" element={<UsersPage />} />
                    <Route path="roles" element={<RolesPage />} />
                    <Route path="roles/:id/permissions" element={<RolePermissionsPage />} />
                    <Route path="variables" element={<GlobalVariablesPage />} />
                    <Route path="tags" element={<TagsPage />} />
                    <Route path="schedules" element={<SchedulesPage />} />
                    <Route path="schedules/:id" element={<ScheduleDetailPage />} />
                    <Route path="settings" element={<SettingsPage />} />
                    <Route path="pages" element={<PagesListPage />} />
                    <Route path="pages/:id/edit" element={<PageDesignerPage />} />
                    <Route path="profile" element={<ProfilePage />} />
                    <Route path="api-keys" element={<APIKeysPage />} />
                </Route>
                <Route path="/public/pages/:slug" element={<PublicPageView />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
