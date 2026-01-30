#!/bin/bash

# Matter Management MVP - Setup Verification Script

set -e

echo "🔍 Matter Management MVP - Setup Verification"
echo "=============================================="
echo ""

# Check Docker
echo "✓ Checking Docker..."
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker."
    exit 1
fi
echo "  Docker version: $(docker --version)"

# Check Docker Compose
echo "✓ Checking Docker Compose..."
if ! command -v docker compose &> /dev/null; then
    echo "❌ Docker Compose not found. Please install Docker Compose."
    exit 1
fi
echo "  Docker Compose version: $(docker compose version)"

# Check available disk space
echo "✓ Checking disk space..."
AVAILABLE=$(df -h . | awk 'NR==2 {print $4}')
echo "  Available disk space: $AVAILABLE"

# Check available memory
echo "✓ Checking available memory..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    MEM=$(sysctl hw.memsize | awk '{print int($2/1024/1024/1024)"GB"}')
    echo "  Total memory: $MEM"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    MEM=$(free -h | awk 'NR==2{print $2}')
    echo "  Total memory: $MEM"
fi

# Check ports availability
echo "✓ Checking required ports..."
PORTS=(3000 5432 8080)
for PORT in "${PORTS[@]}"; do
    if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo "  ⚠️  Port $PORT is already in use"
    else
        echo "  ✓ Port $PORT is available"
    fi
done

# Verify directory structure
echo "✓ Checking project structure..."
DIRS=(backend frontend database)
for DIR in "${DIRS[@]}"; do
    if [ -d "$DIR" ]; then
        echo "  ✓ $DIR/ exists"
    else
        echo "  ❌ $DIR/ not found"
        exit 1
    fi
done

# Check required files
echo "✓ Checking required files..."
FILES=(
    "docker-compose.yml"
    "backend/package.json"
    "backend/Dockerfile"
    "frontend/package.json"
    "frontend/Dockerfile"
    "database/schema.sql"
    "database/seed.js"
)
for FILE in "${FILES[@]}"; do
    if [ -f "$FILE" ]; then
        echo "  ✓ $FILE exists"
    else
        echo "  ❌ $FILE not found"
        exit 1
    fi
done

echo ""
echo "=============================================="
echo "✅ All prerequisites met!"
echo ""
echo "Ready to start:"
echo "  docker compose up"
echo ""
echo "Or for development mode:"
echo "  docker compose -f docker-compose.dev.yml up"
echo ""
echo "After startup, access:"
echo "  Frontend: http://localhost:8080"
echo "  Backend:  http://localhost:3000"
echo "  Health:   http://localhost:3000/health"
echo "=============================================="

