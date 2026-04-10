# Build Frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# Build Backend
FROM --platform=$BUILDPLATFORM golang:alpine AS backend-builder
ARG TARGETOS
ARG TARGETARCH
WORKDIR /app/backend
RUN apk add --no-cache gcc musl-dev bash
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ .
RUN chmod +x scripts/compile_httpget.sh && bash scripts/compile_httpget.sh
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -o main cmd/server/main.go

# Final Stage
FROM ubuntu:22.04
# Install base packages (No SSH client needed because code uses Go library)
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates \
    tzdata \
    bash \
    curl \
    unzip \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy backend binary
COPY --from=backend-builder /app/backend/main ./main

# Copy httpget binaries
COPY --from=backend-builder /app/backend/data/httpget ./data/httpget

# Copy frontend build into the location the backend expects
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Expose backend port
EXPOSE 8080

# Start the backend directly
CMD ["./main"]
