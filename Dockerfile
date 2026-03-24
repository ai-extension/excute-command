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
# Install base packages
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates tzdata bash git curl unzip \
    && rm -rf /var/lib/apt/lists/*

# Install AWS CLI v2
RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" \
    && unzip awscliv2.zip \
    && ./aws/install \
    && rm -rf awscliv2.zip aws

# Install Session Manager Plugin
RUN curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/ubuntu_64bit/session-manager-plugin.deb" -o "session-manager-plugin.deb" \
    && apt-get update \
    && apt-get install -y ./session-manager-plugin.deb \
    && rm -f session-manager-plugin.deb

# Git config
RUN git config --global user.name "CSM Administrator" && \
    git config --global user.email "admin@csm.local" && \
    git config --global init.defaultBranch main && \
    git config --global --add safe.directory /app

WORKDIR /app

# Copy backend binary
COPY --from=backend-builder /app/backend/main ./main

# Copy httpget binaries
COPY --from=backend-builder /app/backend/data/httpget ./data/httpget

# Copy frontend build into the location the backend expects
COPY --from=frontend-builder /app/frontend/dist ./frontend/public

# Expose backend port
EXPOSE 8080

# Start the backend directly
CMD ["./main"]
