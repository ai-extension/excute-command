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
RUN go build -o main cmd/server/main.go

# Final Stage
FROM alpine:latest
RUN apk add --no-cache ca-certificates tzdata nginx

WORKDIR /app

# Copy backend binary into backend folder
COPY --from=backend-builder /app/backend/main ./backend/main

# Copy frontend build into frontend folder
COPY --from=frontend-builder /app/frontend/dist ./frontend/public

# Copy Nginx config
COPY docker/nginx.conf /etc/nginx/http.d/default.conf

# Copy entrypoint script
COPY docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Expose port 80 (Nginx)
EXPOSE 80
# Backend port (internal)
EXPOSE 8080

# Use entrypoint script to start both processes
ENTRYPOINT ["./entrypoint.sh"]
