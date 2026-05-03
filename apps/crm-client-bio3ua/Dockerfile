# Minimal client_extension image sample (bio3ua).
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install && npm cache clean --force
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3010
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
EXPOSE 3010
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3010/health >/dev/null || exit 1
CMD ["node", "dist/main.js"]
