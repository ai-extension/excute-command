import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import 'xterm/css/xterm.css';
import { useAuth } from '../context/AuthContext';

interface XTerminalProps {
    sessionID: string;
    isActive: boolean;
    className?: string;
}

const XTerminal: React.FC<XTerminalProps> = ({ sessionID, isActive, className }) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const socketRef = useRef<WebSocket | null>(null);
    const { token } = useAuth();

    useEffect(() => {
        if (!terminalRef.current || !isActive) return;

        // Initialize xterm.js
        const term = new Terminal({
            cursorBlink: true,
            fontSize: 13,
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            theme: {
                background: '#0a0b0e',
                foreground: '#d4d4d8',
                cursor: '#4f46e5',
                selectionBackground: 'rgba(79, 70, 229, 0.3)',
                black: '#000000',
                red: '#ef4444',
                green: '#22c55e',
                yellow: '#eab308',
                blue: '#3b82f6',
                magenta: '#a855f7',
                cyan: '#06b6d4',
                white: '#ffffff',
            },
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);
        fitAddon.fit();

        xtermRef.current = term;

        // Connect WebSocket
        const wsUrl = `ws://${window.location.hostname}:8080/api/ws?token=${token || ''}`;
        const socket = new WebSocket(wsUrl);
        socketRef.current = socket;

        socket.onopen = () => {
            console.log('XTerminal connected to WS');
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.target_id === sessionID) {
                    term.write(data.content);
                }
            } catch (err) {
                // Not a JSON message or different format
            }
        };

        // Handle user input
        term.onData((data) => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                    type: 'input',
                    session_id: sessionID,
                    content: data
                }));
            }
        });

        // Handle window resize
        const handleResize = () => {
            fitAddon.fit();
        };
        window.addEventListener('resize', handleResize);

        return () => {
            socket.close();
            term.dispose();
            window.removeEventListener('resize', handleResize);
        };
    }, [sessionID, isActive]);

    return (
        <div
            ref={terminalRef}
            className={className}
            style={{ width: '100%', height: '100%' }}
        />
    );
};

export default XTerminal;
