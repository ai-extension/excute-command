# Command Step Manager (CSM)

CSM is a powerful, multi-step command execution and management platform with a professional admin dashboard.

## Project Structure
- **/backend**: Golang REST API providing command orchestration.
- **/frontend**: React + Vite + Tailwind CSS admin dashboard.
- **/docs**: Documentation and AI development guides.

## Quick Start

### Backend
1.  Navigate to `./backend`
2.  Run `go run cmd/server/main.go`
3.  Server starts at `http://localhost:8080`

### Frontend
1.  Navigate to `./frontend`
2.  Install dependencies: `npm install`
3.  Run development server: `npm run dev`
4.  Open `http://localhost:5173`

## Features
- Sequential command execution.
- Real-time status tracking.
- Beautiful, responsive admin UI.
- Clean Architecture for easy extensibility.

## Future Roadmap
- Persistent SQLite storage.
- Real-time WebSocket log streaming.
- User authentication and access control.
- Script templates and variables.
