import React from 'react';

interface AnsiTextProps {
    text: string;
}

const AnsiText: React.FC<AnsiTextProps> = ({ text }) => {
    if (!text) return null;

    // Split by ANSI escape sequences
    const parts = text.split(/(\u001b\[[0-9;]*m)/g);
    let currentStyles: Record<string, string> = {
        color: '#e2e8f0' // Default text color
    };

    return (
        <>
            {parts.map((part, index) => {
                if (part.startsWith('\u001b[')) {
                    const code = part.match(/[0-9;]+/)?.[0] || '0';
                    const codes = code.split(';');

                    codes.forEach(c => {
                        const num = parseInt(c, 10);
                        if (num === 0) {
                            currentStyles = { color: '#e2e8f0' };
                        } else if (num === 1) {
                            currentStyles.fontWeight = 'bold';
                        } else if (num >= 30 && num <= 37) {
                            const colors = ['#000', '#f43f5e', '#10b981', '#f59e0b', '#3b82f6', '#d946ef', '#06b6d4', '#fff'];
                            currentStyles.color = colors[num - 30];
                        } else if (num >= 90 && num <= 97) {
                            const brightColors = ['#94a3b8', '#fb7185', '#34d399', '#fbbf24', '#60a5fa', '#f472b6', '#22d3ee', '#fff'];
                            currentStyles.color = brightColors[num - 90];
                        }
                    });
                    return null;
                }

                return (
                    <span key={index} style={{ ...currentStyles }}>
                        {part}
                    </span>
                );
            }).filter(Boolean)}
        </>
    );
};

export default AnsiText;
