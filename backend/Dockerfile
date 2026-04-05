FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY api/ ./api/
RUN npx tsc

RUN npm prune --omit=dev

CMD ["node", "dist/api/server.js"]
