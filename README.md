# Command Step Manager (CSM)

CSM is a powerful, multi-step command execution and management platform with a professional admin dashboard.

## Project Structure
- **/backend**: Golang REST API providing command orchestration.
- **/frontend**: React + Vite + Tailwind CSS admin dashboard.
- **/docs**: Documentation and AI development guides.

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Go 1.20+
- Node.js 18+

### Setup & Run
1.  **Install everything**:
    ```bash
    make install
    ```
2.  **Start Database**:
    ```bash
    make db-up
    ```
3.  **Run Backend**:
    ```bash
    make run-be
    ```
4.  **Run Frontend**:
    ```bash
    make run-fe
    ```

Or use `make help` to see all available commands.

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
