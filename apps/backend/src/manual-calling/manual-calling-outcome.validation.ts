import { BadRequestException } from "@nestjs/common";
import { ManualCallOutcome } from "@prisma/client";
import type { CompleteSessionDto } from "./dto/complete-session.dto";

export function validateManualCallCompletePayload(dto: CompleteSessionDto): void {
  if (
    (dto.outcome === ManualCallOutcome.REQUESTED_CALLBACK ||
      dto.outcome === ManualCallOutcome.MEETING_SCHEDULED) &&
    (!dto.callbackAt || !dto.callbackAt.trim())
  ) {
    throw new BadRequestException("callbackAt is required for this outcome");
  }
  if (dto.outcome === ManualCallOutcome.WRONG_NUMBER && !dto.note?.trim()) {
    throw new BadRequestException("note is required for WRONG_NUMBER");
  }
}
