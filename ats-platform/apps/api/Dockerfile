FROM node:20-alpine AS base

FROM base AS dependencies
WORKDIR /app
COPY package.json ./
RUN npm install

FROM base AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN npm install -g node-prune

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
RUN node-prune

EXPOSE 3001
CMD ["node", "dist/index.js"]
