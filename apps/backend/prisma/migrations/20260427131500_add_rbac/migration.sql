CREATE TABLE "RbacRole" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RbacRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RbacPermission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RbacPermission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RbacRolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RbacRolePermission_pkey" PRIMARY KEY ("roleId", "permissionId")
);

CREATE TABLE "RbacUserRoleAssignment" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RbacUserRoleAssignment_pkey" PRIMARY KEY ("userId", "roleId")
);

CREATE UNIQUE INDEX "RbacRole_key_key" ON "RbacRole"("key");
CREATE INDEX "RbacRole_system_idx" ON "RbacRole"("system");
CREATE INDEX "RbacRole_isActive_idx" ON "RbacRole"("isActive");
CREATE INDEX "RbacRole_deletedAt_idx" ON "RbacRole"("deletedAt");

CREATE UNIQUE INDEX "RbacPermission_key_key" ON "RbacPermission"("key");
CREATE INDEX "RbacPermission_category_idx" ON "RbacPermission"("category");
CREATE INDEX "RbacPermission_system_idx" ON "RbacPermission"("system");
CREATE INDEX "RbacPermission_isActive_idx" ON "RbacPermission"("isActive");
CREATE INDEX "RbacPermission_deletedAt_idx" ON "RbacPermission"("deletedAt");

CREATE INDEX "RbacRolePermission_permissionId_idx" ON "RbacRolePermission"("permissionId");
CREATE INDEX "RbacUserRoleAssignment_roleId_idx" ON "RbacUserRoleAssignment"("roleId");

ALTER TABLE "RbacRolePermission"
    ADD CONSTRAINT "RbacRolePermission_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "RbacRole"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RbacRolePermission"
    ADD CONSTRAINT "RbacRolePermission_permissionId_fkey"
    FOREIGN KEY ("permissionId") REFERENCES "RbacPermission"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RbacUserRoleAssignment"
    ADD CONSTRAINT "RbacUserRoleAssignment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RbacUserRoleAssignment"
    ADD CONSTRAINT "RbacUserRoleAssignment_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "RbacRole"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
