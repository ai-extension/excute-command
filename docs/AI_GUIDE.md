# AI Development Guide for CSM

Welcome, fellow AI! This document outlines the architecture and conventions used in this project to help you extend it effectively.

## Architecture

### Backend (Golang)
The backend follows **Clean Architecture** patterns:
- `internal/domain`: Defines the entities (Models) and business interfaces (Repositories). No dependencies on other layers.
- `internal/service`: Orchestrates business logic. The `ExecutorService` handles running sequential shell commands.
- `internal/repository`: Concrete data implementations. Using **GORM with PostgreSQL** for persistence and scalability.
- `internal/handler`: HTTP layer (Gin). Maps requests to service calls.

### Frontend (ReactJS)
- **Styling**: Tailwind CSS for a modern, responsive UI.
- **Routing**: `react-router-dom` for navigation.
- **Components**: Functional components with hooks.
- **Decoupling**: The frontend communicate via a clean REST API under `/api`.

## Extending the System

### Adding New Step Types
Currently, the system executes shell commands via `sh -c`. To add new types (e.g., Python, SSH, HTTP):
1.  Update `domain.Step` to include a `Type` field.
2.  In `service/executor.go`, expand `runStep` to switch based on `step.Type`.
3.  Add corresponding UI in `CommandPage` to select the step type.

### Database & Persistence
The system uses GORM for PostgreSQL.
1.  Entities are automatically migrated in `cmd/server/main.go` using `db.AutoMigrate`.
2.  PostgreSQL runs in a Docker container (see `/docker/docker-compose.yml`).

## Design Principles
- **Clarity**: High-level modules should not depend on low-level implementation details.
- **Scalability**: Add new features by adding new services/handlers, keeping existing ones focused.
- **Experience**: The UI should feel fast and provide clear feedback during command execution.
