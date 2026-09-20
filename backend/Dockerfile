# Auto 24 - Production Backend Container
FROM node:20-alpine

# Security: Don't run as root
WORKDIR /app

# Install dependencies
COPY backend/package*.json ./
RUN npm ci --only=production

# Copy application source and web-viewer
COPY backend/ ./backend/
COPY web-viewer/ ./web-viewer/

# Create persistent data directory with correct permissions
RUN mkdir -p /app/backend/data && chown -R node:node /app

USER node

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app/backend
CMD ["node", "src/server.js"]
