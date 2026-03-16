#!/bin/bash

set -e

IMAGE_NAME="torchlens-worker:latest"

echo "Checking if Docker image '$IMAGE_NAME' exists..."

if [[ "$(docker images -q $IMAGE_NAME 2> /dev/null)" == "" ]]; then
    echo "Image not found. Building Docker image..."
    docker build -t $IMAGE_NAME ./backend/
else
    echo "Image already exists. Skipping build."
fi

echo "Stopping active containers..."
docker compose down
echo "Starting docker compose..."
docker compose up -d --build

echo "Setup complete!"
