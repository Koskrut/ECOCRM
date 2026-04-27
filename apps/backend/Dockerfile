# Backend (NestJS + Prisma)
FROM node:20-alpine AS builder

WORKDIR /repo

COPY package.json package-lock.json* ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/contracts/src ./packages/contracts/src
COPY packages/module-sdk/package.json ./packages/module-sdk/package.json
COPY packages/module-sdk/src ./packages/module-sdk/src
RUN npm install --workspace=backend --include=dev && npm cache clean --force

COPY apps/backend/prisma ./apps/backend/prisma/
COPY apps/backend/prisma.config.ts apps/backend/prisma.config.cjs ./apps/backend/
ENV DATABASE_URL=postgresql://crm:crm@localhost:5432/crm
RUN npm run prisma:generate --workspace=backend

COPY apps/backend/tsconfig.json ./apps/backend/
COPY apps/backend/src ./apps/backend/src
RUN npm run build --workspace=backend

# Production stage
FROM node:20-alpine AS runner

WORKDIR /repo

ARG CRM_RELEASE_VERSION=""
ARG GIT_SHA=""
ARG BUILD_TIME=""
ARG IMAGE_TAG=""
ENV CRM_RELEASE_VERSION=$CRM_RELEASE_VERSION
ENV GIT_SHA=$GIT_SHA
ENV BUILD_TIME=$BUILD_TIME
ENV IMAGE_TAG=$IMAGE_TAG

ENV NODE_ENV=production
ENV PORT=3001

# Prisma needed for migrate deploy at runtime
COPY package.json package-lock.json* ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/contracts/src ./packages/contracts/src
COPY packages/module-sdk/package.json ./packages/module-sdk/package.json
COPY packages/module-sdk/src ./packages/module-sdk/src
RUN npm install --workspace=backend --omit=dev && npm cache clean --force

COPY --from=builder /repo/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /repo/apps/backend/dist ./apps/backend/dist
COPY apps/backend/prisma ./apps/backend/prisma
COPY apps/backend/prisma.config.cjs ./apps/backend/

EXPOSE 3001

CMD ["sh", "-c", "cd apps/backend && npx prisma migrate deploy && node dist/main.js"]
