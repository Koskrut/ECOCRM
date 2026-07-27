import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { Transform, Type } from "class-transformer";
import type { RiskBand, RiskDecisionOutcome, RiskDomainId, RiskSubjectType } from "@prisma/client";
import { PaymentType } from "@prisma/client";

export type RiskHubResponse = {
  eri: {
    score: number;
    band: RiskBand;
    computedAt: string | null;
    trend7d: number[];
  };
  domainHeatmap: {
    domain: RiskDomainId;
    labelUk: string;
    labelEn: string;
    avgScore: number;
    band: RiskBand;
    criticalCount: number;
    highCount: number;
    deepLink?: string;
  }[];
  criticalSubjects: RiskScoreDto[];
  pendingApprovals: RiskDecisionDto[];
  deepLinks: { labelUk: string; labelEn: string; href: string }[];
};

export type RiskScoreDto = {
  id?: string;
  domain: RiskDomainId;
  subjectType: RiskSubjectType;
  subjectId: string;
  subjectLabel?: string;
  score: number;
  band: RiskBand;
  reasons: unknown;
  computedAt: string;
};

export type RiskDecisionDto = {
  id: string;
  domain: RiskDomainId;
  gatePoint: string;
  outcome: RiskDecisionOutcome;
  subjectType: RiskSubjectType;
  subjectId: string;
  orderId: string | null;
  reasons: unknown;
  createdAt: string;
  approvedAt: string | null;
};

export class EvaluateDeferredGateDto {
  @IsOptional()
  @IsString()
  contactId?: string | null;

  @IsOptional()
  @IsString()
  companyId?: string | null;

  @IsOptional()
  @IsString()
  orderId?: string | null;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalAmount!: number;

  @IsEnum(PaymentType)
  paymentType!: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  persistDecision?: boolean;
}

export class GetExposureQueryDto {
  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  additionalAmount?: number;

  @IsOptional()
  @IsString()
  excludeOrderId?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  persist?: boolean;
}

export class UpdateCreditProfileDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  riskClass?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  paymentTermsDays?: number;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class ApproveDecisionDto {
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateCreditPolicyDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  warnExposurePct?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  approveExposurePct?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  blockExposurePct?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  blockOverdueDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  defaultCreditLimit?: number;

  @IsOptional()
  @IsString()
  defaultCurrency?: string;
}

export class GetScoresQueryDto {
  @IsOptional()
  @IsString()
  domain?: RiskDomainId;

  @IsOptional()
  @IsString()
  subjectType?: RiskSubjectType;

  @IsOptional()
  @IsString()
  subjectId?: string;
}
