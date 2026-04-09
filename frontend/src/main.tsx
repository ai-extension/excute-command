import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

import { NamespaceProvider } from './context/NamespaceContext'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <AuthProvider>
        <NamespaceProvider>
            <ThemeProvider>
                <App />
            </ThemeProvider>
        </NamespaceProvider>
    </AuthProvider>,
)
