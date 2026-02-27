.PHONY: help install-be install-fe install db-up db-down run-be run-fe dev

help: ## Display this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install-be: ## Install backend dependencies
	cd backend && go mod tidy

install-fe: ## Install frontend dependencies
	cd frontend && npm install

install: install-be install-fe ## Install all dependencies

db-up: ## Start PostgreSQL database in Docker
	cd docker && docker-compose up -d

db-down: ## Stop PostgreSQL database
	cd docker && docker-compose down

run-be: ## Run backend server
	kill -9 $(lsof -t -i:8080) || true && cd backend && go run cmd/server/main.go

run-fe: ## Run frontend development server
	cd frontend && npm run dev

dev: ## Run both BE and FE (requires manual control or background execution)
	@echo "Starting development environment..."
	@make -j 2 run-be run-fe
