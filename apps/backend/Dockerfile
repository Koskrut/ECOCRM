# Backend (NestJS + Prisma). Build context must be repo root (.) — see publish-release.yml.
FROM node:20-alpine AS builder

WORKDIR /repo

COPY package.json package-lock.json* ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY packages/contracts ./packages/contracts
COPY packages/module-sdk ./packages/module-sdk
RUN npm install --workspace=backend --include=dev && npm cache clean --force

COPY apps/backend/prisma ./apps/backend/prisma
COPY apps/backend/prisma.config.ts apps/backend/prisma.config.cjs ./apps/backend/
ENV DATABASE_URL=postgresql://crm:crm@localhost:5432/crm
RUN npm run prisma:generate --workspace=backend

COPY apps/backend/tsconfig.json ./apps/backend/
COPY apps/backend/src ./apps/backend/src
COPY scripts/generate-version-file.sh ./scripts/generate-version-file.sh
RUN npm run build --workspace=backend

FROM node:20-alpine AS runner

WORKDIR /app

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

COPY package.json package-lock.json* ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY packages/contracts ./packages/contracts
COPY packages/module-sdk ./packages/module-sdk
RUN npm install --workspace=backend --omit=dev && npm cache clean --force

COPY --from=builder /repo/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /repo/apps/backend/dist ./dist
COPY --from=builder /repo/apps/backend/prisma ./prisma
COPY --from=builder /repo/apps/backend/prisma.config.cjs ./prisma.config.cjs

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]

# Publish workflow may request this target when include_outbound_in_manifest is true.
# On branches without outbound-main, this matches runner; replace with a dedicated image when outbound ships on main.
FROM runner AS outbound-runner
ARG IMAGE_VERSION="0.0.0-dev"
ARG VCS_REF="unknown"
LABEL org.opencontainers.image.title="ECOCRM Module Outbound" \
      org.opencontainers.image.version=$IMAGE_VERSION \
      org.opencontainers.image.source="https://github.com/Koskrut/ECOCRM" \
      org.opencontainers.image.revision=$VCS_REF
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
