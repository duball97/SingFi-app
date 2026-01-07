# Multi-stage build for faster deployments
FROM node:20-alpine AS base

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg \
    && pip3 install --no-cache-dir yt-dlp

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --prefer-offline --no-audit --only=production

# Build stage
FROM base AS builder

# Install all dependencies (including devDependencies for build)
RUN npm ci --prefer-offline --no-audit

# Copy source files
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM base AS production

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/package.json ./

# Set environment
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Start the server
CMD ["npm", "start"]

