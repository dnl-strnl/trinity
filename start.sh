#!/bin/bash

DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Starting Trinity... ☘️"
echo "root: $DIR"

# kill anything already on port 33333 >:)
lsof -ti :33333 | xargs kill -9 2>/dev/null || true

# backend.
cd "$DIR/backend"
echo "<< backend on :33333"
export TRINITY_AUDIO=1  # toggle game sound effects
poetry run uvicorn server:app --reload --port 33333 --host 0.0.0.0 &
BACKEND_PID=$!

sleep 1

cd "$DIR"
echo ">> frontend on :3333"
npx vite &
FRONTEND_PID=$!

echo "☘️          ~  T R I N I T Y  ~           ☘️"
echo "☘️  frontend: http://localhost:3333       ☘️"
echo "☘️  backend:  http://localhost:33333      ☘️"
echo "☘️  api docs: http://localhost:33333/docs ☘️"
echo "☘️                                        ☘️"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM
wait
