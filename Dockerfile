FROM node:20-alpine

WORKDIR /app

# Copy server package files
COPY server/package*.json ./server/

# Install server dependencies
WORKDIR /app/server
RUN npm install --production

# Copy server source code
COPY server/ .

ENV PORT=10000
EXPOSE 10000

CMD ["node", "index.js"]
