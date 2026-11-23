-- CreateTable
CREATE TABLE "UserPayrollProfile" (
    "userId" TEXT NOT NULL,
    "baseSalaryUah" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amortizationUahPerKm" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "bonusThresholdUah" DECIMAL(14,2),
    "bonusPercentUpTo" DECIMAL(8,4),
    "bonusPercentAbove" DECIMAL(8,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPayrollProfile_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "UserPayrollProfile" ADD CONSTRAINT "UserPayrollProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
