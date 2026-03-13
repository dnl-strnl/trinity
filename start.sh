#!/bin/bash

DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Starting Trinity... ☘️"
echo "root: $DIR"

# backend.
cd "$DIR/backend"
echo "<< backend on :4000"
export TRINITY_AUDIO=1  # toggle game sound effects
poetry run uvicorn server:app --reload --port 4000 &
BACKEND_PID=$!

sleep 1

cd "$DIR"
echo ">> frontend on :5173"
npx vite &
FRONTEND_PID=$!

echo "☘️          ~  T R I N I T Y  ~          ☘️"
echo "☘️  frontend: http://localhost:5173      ☘️"
echo "☘️  backend:  http://localhost:4000      ☘️"
echo "☘️  api docs: http://localhost:4000/docs ☘️"
echo "☘️                                       ☘️"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM
wait
