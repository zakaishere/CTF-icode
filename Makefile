# icode-ctf — Docker Compose shortcuts
# First time on a new server: bash setup.sh
# After that: make up

COMPOSE = docker compose
BACKEND_CONTAINER = icode-backend
DB_CONTAINER      = icode-db

.PHONY: up down restart rebuild logs logs-b logs-f logs-n logs-db ps clean shell-b shell-db setup help

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

setup: ## First-time setup (creates .env, upload dir) — then runs make up
	@bash setup.sh

up: ## Build images (if needed) and start all services (no .env needed)
	$(COMPOSE) up -d --build

down: ## Stop and remove containers (keeps volumes)
	$(COMPOSE) down

restart: ## Restart all containers without rebuilding
	$(COMPOSE) restart

rebuild: ## Full stop → rebuild → start
	$(COMPOSE) down
	$(COMPOSE) up -d --build

logs: ## Tail logs for all services
	$(COMPOSE) logs -f

logs-b: ## Tail backend logs
	$(COMPOSE) logs -f backend

logs-f: ## Tail frontend logs
	$(COMPOSE) logs -f frontend

logs-n: ## Tail nginx logs
	$(COMPOSE) logs -f nginx

logs-db: ## Tail database logs
	$(COMPOSE) logs -f db

ps: ## Show container status
	$(COMPOSE) ps

clean: ## ⚠ DESTRUCTIVE: stop containers AND delete volumes (data loss!)
	@echo "WARNING: This deletes all database data and uploads!"
	@read -p "Type 'yes' to confirm: " yn; [ "$$yn" = "yes" ] || exit 1
	$(COMPOSE) down -v

shell-b: ## Open a shell inside the backend container
	docker exec -it $(BACKEND_CONTAINER) sh

shell-db: ## Open psql inside the db container
	docker exec -it $(DB_CONTAINER) \
		psql -U $${DB_USERNAME:-icode_user} -d $${DB_NAME:-icode_ctf}
