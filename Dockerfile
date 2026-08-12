# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Setup Backend & Run
FROM node:20-alpine
WORKDIR /app

# Copy server package files and install production dependencies
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm install --production

# Copy server code from root/server
WORKDIR /app
COPY server/ ./server/

# Copy built frontend assets from Stage 1 into dist/
COPY --from=frontend-builder /app/dist ./dist

ENV PORT=10000
EXPOSE 10000

CMD ["node", "server/index.js"]
