#!/bin/sh

# Start the Go backend in the background
/app/backend/main &

# Start Nginx in the foreground
nginx -g 'daemon off;'
