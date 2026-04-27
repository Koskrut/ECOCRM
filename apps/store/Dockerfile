# Store (Next.js) — internet shop frontend
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install && npm cache clean --force

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ARG API_URL=http://backend:3001
ENV API_URL=$API_URL
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ARG IMAGE_VERSION="0.0.0-dev"
ARG VCS_REF=""
LABEL org.opencontainers.image.title="ECOCRM Store" \
      org.opencontainers.image.version=$IMAGE_VERSION \
      org.opencontainers.image.source="https://github.com/Koskrut/ECOCRM" \
      org.opencontainers.image.revision=$VCS_REF
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3002
EXPOSE 3002
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
CMD ["node", "server.js"]
