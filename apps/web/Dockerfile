# Web (Next.js) — CRM admin UI
FROM node:20-alpine AS deps
WORKDIR /repo
COPY apps/web/package.json ./apps/web/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/contracts/src ./packages/contracts/src
WORKDIR /repo/apps/web
RUN npm install --include=dev && npm cache clean --force

FROM node:20-alpine AS builder
WORKDIR /repo/apps/web
COPY --from=deps /repo/apps/web/node_modules ./node_modules
COPY --from=deps /repo/packages /repo/packages
COPY apps/web ./
ENV NEXT_TELEMETRY_DISABLED=1
# Build-time API URL for server-side calls (override in docker-compose if needed)
ARG API_URL=http://backend:3001
ENV API_URL=$API_URL
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ARG IMAGE_VERSION="0.0.0-dev"
ARG VCS_REF=""
LABEL org.opencontainers.image.title="ECOCRM Web" \
      org.opencontainers.image.version=$IMAGE_VERSION \
      org.opencontainers.image.source="https://github.com/Koskrut/ECOCRM" \
      org.opencontainers.image.revision=$VCS_REF
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
EXPOSE 3000
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./.next/static
COPY --from=builder /repo/apps/web/public ./public
CMD ["node", "server.js"]
