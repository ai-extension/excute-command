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
import RegisterPage from './pages/RegisterPage';
import { useAuth } from './context/AuthContext';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    const { isAuthenticated, isLoading } = useAuth();
    const location = useLocation();

    if (isLoading) {
        return (
            <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#050505] relative overflow-hidden">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/20 blur-[120px] rounded-full animate-pulse" />
                <div className="relative z-10 flex flex-col items-center gap-6">
                    <div className="h-16 w-16 rounded-2xl premium-gradient p-[1px] animate-bounce duration-1000 shadow-[0_0_40px_rgba(99,102,241,0.4)]">
                        <div className="w-full h-full rounded-2xl bg-[#050505] flex items-center justify-center">
                            <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                        </div>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                        <h2 className="text-xl font-black tracking-tighter text-white uppercase italic">Initializing System</h2>
                        <div className="flex gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse delay-75" />
                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse delay-150" />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

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
                <Route path="/register" element={<RegisterPage />} />
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
