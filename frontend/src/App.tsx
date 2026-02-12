import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import CommandPage from './pages/CommandPage';

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Layout />}>
                    <Route index element={<Dashboard />} />
                    <Route path="commands" element={<CommandPage />} />
                    <Route path="settings" element={<div className="p-8">Settings coming soon...</div>} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}

export default App;
