# Build Frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# Build Backend
FROM golang:alpine AS backend-builder
WORKDIR /app/backend
RUN apk add --no-cache gcc musl-dev
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ .
RUN CGO_ENABLED=0 go build -o main cmd/server/main.go

# Final Stage
FROM ubuntu:22.04
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates tzdata bash \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy backend binary
COPY --from=backend-builder /app/backend/main ./main

# Copy frontend build into the location the backend expects
COPY --from=frontend-builder /app/frontend/dist ./frontend/public

# Expose backend port
EXPOSE 8080

# Start the backend directly
CMD ["./main"]
