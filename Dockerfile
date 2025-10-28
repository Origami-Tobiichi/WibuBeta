FROM node:18-alpine

WORKDIR /app

# Install system dependencies including git dan python3 (untuk native modules)
RUN apk add --no-cache \
    curl \
    git \
    python3 \
    make \
    g++ \
    && npm install -g npm@latest

# Copy package files first untuk caching
COPY package*.json ./

# Clean npm cache dan install dependencies
RUN npm cache clean --force && \
    npm install --production --no-optional --build-from-source

# Copy source code
COPY . .

# Create necessary directories
RUN mkdir -p session data

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start application
CMD ["npm", "start"]
