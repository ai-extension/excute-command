import React, { useState } from 'react';
import { Plus, Search, MoreVertical, Play } from 'lucide-react';

const CommandPage = () => {
    const [searchTerm, setSearchTerm] = useState('');

    // Sample data for UI mockup
    const commands = [
        { id: '1', name: 'Deploy Backend', status: 'SUCCESS', last_run: '2024-02-12 10:00', steps: 3 },
        { id: '2', name: 'Cleanup Logs', status: 'PENDING', last_run: 'N/A', steps: 1 },
        { id: '3', name: 'Docker Build', status: 'FAILED', last_run: '2024-02-11 15:30', steps: 5 },
    ];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Commands</h1>
                    <p className="text-gray-500 text-sm">Create and manage multi-step automation commands.</p>
                </div>
                <button className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition">
                    <Plus className="w-4 h-4" />
                    <span>New Command</span>
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="p-4 border-b bg-gray-50 flex items-center gap-4">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search commands..."
                            className="w-full pl-10 pr-4 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <table className="w-full text-left">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                        <tr>
                            <th className="px-6 py-4 font-semibold">Name</th>
                            <th className="px-6 py-4 font-semibold">Status</th>
                            <th className="px-6 py-4 font-semibold">Steps</th>
                            <th className="px-6 py-4 font-semibold">Last Run</th>
                            <th className="px-6 py-4 font-not-italic"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y text-sm">
                        {commands.map((cmd) => (
                            <tr key={cmd.id} className="hover:bg-gray-50 transition">
                                <td className="px-6 py-4 font-medium text-gray-900">{cmd.name}</td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${cmd.status === 'SUCCESS' ? 'bg-green-100 text-green-700' :
                                            cmd.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                                                'bg-gray-100 text-gray-700'
                                        }`}>
                                        {cmd.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-gray-500">{cmd.steps} steps</td>
                                <td className="px-6 py-4 text-gray-500">{cmd.last_run}</td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-2">
                                        <button className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Run">
                                            <Play className="w-4 h-4" />
                                        </button>
                                        <button className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition">
                                            <MoreVertical className="w-4 h-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default CommandPage;
