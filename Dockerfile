FROM node:18-alpine

WORKDIR /app

# Install system dependencies
RUN apk update && apk add --no-cache \
    curl \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

# Update npm to latest
RUN npm install -g npm@9.8.1

# Copy package files
COPY package*.json ./

# Install dependencies dengan strict flags
RUN npm config set update-notifier false && \
    npm config set fund false && \
    npm cache clean --force && \
    npm install --production --no-optional --no-audit --no-fund

# Copy source code
COPY . .

# Create directories
RUN mkdir -p session data logs

# Fix permissions
RUN chmod -R 755 /app

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start application
CMD ["node", "app.js"]
