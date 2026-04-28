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
COPY scripts/generate-version-file.sh ./scripts/generate-version-file.sh
ARG IMAGE_VERSION="0.0.0-dev"
ARG VCS_REF="unknown"
ARG BUILD_TIME=""
ENV VERSION=$IMAGE_VERSION
ENV COMMIT_SHA=$VCS_REF
ENV BUILT_AT=$BUILD_TIME
RUN npm run build --workspace=backend

FROM node:20-alpine AS runtime-base

WORKDIR /repo

ARG CRM_RELEASE_VERSION=""
ARG GIT_SHA=""
ARG BUILD_TIME=""
ARG IMAGE_TAG=""
ARG IMAGE_VERSION="0.0.0-dev"
ARG VCS_REF=""
ENV CRM_RELEASE_VERSION=$CRM_RELEASE_VERSION
ENV GIT_SHA=$GIT_SHA
ENV BUILD_TIME=$BUILD_TIME
ENV IMAGE_TAG=$IMAGE_TAG

LABEL org.opencontainers.image.title="ECOCRM Backend Core" \
      org.opencontainers.image.version=$IMAGE_VERSION \
      org.opencontainers.image.source="https://github.com/Koskrut/ECOCRM" \
      org.opencontainers.image.revision=$VCS_REF

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
COPY --from=builder /repo/apps/backend/prisma ./apps/backend/prisma
COPY --from=builder /repo/apps/backend/prisma.config.cjs ./apps/backend/prisma.config.cjs

FROM runtime-base AS migrate
CMD ["sh", "-c", "cd apps/backend && npx prisma migrate deploy"]

FROM runtime-base AS runner
EXPOSE 3001

CMD ["sh", "-c", "cd apps/backend && node dist/main.js"]

# Optional: standalone voice outbound slice (same repo build, different entrypoint).
# Prisma migrations still use the migrate image built from this Dockerfile (`migrate` target).
FROM runtime-base AS outbound-runner
ARG IMAGE_VERSION="0.0.0-dev"
ARG VCS_REF="unknown"
LABEL org.opencontainers.image.title="ECOCRM Module Outbound" \
      org.opencontainers.image.version=$IMAGE_VERSION \
      org.opencontainers.image.source="https://github.com/Koskrut/ECOCRM" \
      org.opencontainers.image.revision=$VCS_REF

EXPOSE 3001

CMD ["sh", "-c", "cd apps/backend && node dist/outbound-main.js"]
