import React from 'react';
import { PlayCircle, CheckCircle, XCircle, Clock } from 'lucide-react';

const StatCard = ({ title, value, icon: Icon, color }: any) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border flex items-center gap-4">
        <div className={`p-3 rounded-lg ${color}`}>
            <Icon className="w-6 h-6 text-white" />
        </div>
        <div>
            <p className="text-sm text-gray-500 font-medium">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
        </div>
    </div>
);

const Dashboard = () => {
    const stats = [
        { title: 'Total Commands', value: '12', icon: PlayCircle, color: 'bg-blue-500' },
        { title: 'Successful Runs', value: '45', icon: CheckCircle, color: 'bg-green-500' },
        { title: 'Failed Runs', value: '2', icon: XCircle, color: 'bg-red-500' },
        { title: 'Avg Run Time', value: '1.5m', icon: Clock, color: 'bg-orange-500' },
    ];

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold">System Dashboard</h1>
                <p className="text-gray-500">Welcome to CSM! Monitor your command execution here.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map((stat) => (
                    <StatCard key={stat.title} {...stat} />
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border p-6">
                    <h3 className="text-lg font-bold mb-4">Recent Executions</h3>
                    <div className="text-center py-12 text-gray-400">
                        No recent executions found.
                    </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h3 className="text-lg font-bold mb-4">Quick Actions</h3>
                    <div className="space-y-3">
                        <button className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                            Create New Command
                        </button>
                        <button className="w-full py-2 px-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
                            View Run History
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
