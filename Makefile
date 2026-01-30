.PHONY: help up down dev logs clean test

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

up: ## Start production environment
	docker compose up --build

down: ## Stop all services
	docker compose down

dev: ## Start development environment with hot reload
	docker compose -f docker-compose.dev.yml up

logs: ## Tail logs from all services
	docker compose logs -f

logs-backend: ## Tail backend logs only
	docker compose logs -f backend

logs-frontend: ## Tail frontend logs only
	docker compose logs -f frontend

clean: ## Remove all containers, volumes, and images
	docker compose down -v --rmi all

test-backend: ## Run backend tests
	cd backend && npm test

test-backend-coverage: ## Run backend tests with coverage
	cd backend && npm run test:coverage

seed: ## Re-run database seed (useful for development)
	docker compose restart seed

health: ## Check health of all services
	@echo "Checking backend health..."
	@curl -s http://localhost:3000/health | json_pp || echo "Backend unhealthy"
	@echo "\nChecking frontend..."
	@curl -s -o /dev/null -w "%{http_code}" http://localhost:8080 || echo "Frontend unhealthy"
	@echo "\nChecking database..."
	@docker compose exec postgres pg_isready -U matter || echo "Database unhealthy"

install: ## Install dependencies for local development
	cd backend && npm install
	cd frontend && npm install
	cd database && npm install

