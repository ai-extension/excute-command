#!/bin/bash

# Configuration (Relative to script location)
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
SOURCE_FILE="$PROJECT_ROOT/cmd/httpget/main.go"
OUTPUT_DIR="$PROJECT_ROOT/data/httpget"

# List of targets (OS/ARCH)
TARGETS=(
    "linux/amd64"
    "linux/arm64"
    "linux/386"
    "linux/arm"
    "darwin/amd64"
    "darwin/arm64"
)

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Compile for each target
for target in "${TARGETS[@]}"; do
    os=$(echo $target | cut -d'/' -f1)
    arch=$(echo $target | cut -d'/' -f2)
    echo "Compiling for $os/$arch..."
    # Set CGO_ENABLED=0 for static linking
    GOOS=$os GOARCH=$arch CGO_ENABLED=0 go build -ldflags="-s -w" -o "$OUTPUT_DIR/httpget-$os-$arch" "$SOURCE_FILE"
    if [ $? -eq 0 ]; then
        echo "Created: $OUTPUT_DIR/httpget-$os-$arch"
    else
        echo "Failed to compile for $target"
    fi
done

echo "Compilation complete."
