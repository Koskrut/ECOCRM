import { Injectable } from "@nestjs/common";
import { CallQueueItemStatus, Prisma } from "@prisma/client";

export type MissedCallEnqueueParams = {
  callId: string;
  assigneeId: string;
  contactId: string | null;
  leadId: string | null;
  companyId: string | null;
};

export type ResolveConversationParams = {
  contactId: string | null;
  leadId: string | null;
};

@Injectable()
export class MissedCallQueueService {
  async enqueueFromMissedCall(
    tx: Prisma.TransactionClient,
    params: MissedCallEnqueueParams,
  ): Promise<void> {
    if (process.env.MISSED_CALL_QUEUE_DISABLED === "true") return;
    if (!params.assigneeId) return;
    if (!params.contactId && !params.leadId) return;

    const activeStatuses: CallQueueItemStatus[] = [
      CallQueueItemStatus.PENDING,
      CallQueueItemStatus.CLAIMED,
    ];

    const entityFilter: Prisma.CallQueueItemWhereInput = params.contactId
      ? { contactId: params.contactId }
      : { leadId: params.leadId! };

    const existingForEntity = await tx.callQueueItem.findFirst({
      where: {
        assigneeId: params.assigneeId,
        status: { in: activeStatuses },
        callId: { not: null },
        ...entityFilter,
      },
      select: { id: true },
    });
    if (existingForEntity) return;

    await tx.callQueueItem.upsert({
      where: { callId: params.callId },
      create: {
        callId: params.callId,
        assigneeId: params.assigneeId,
        contactId: params.contactId,
        leadId: params.leadId,
        companyId: params.companyId,
        status: CallQueueItemStatus.PENDING,
        sortOrder: 0,
      },
      update: {
        assigneeId: params.assigneeId,
        contactId: params.contactId,
        leadId: params.leadId,
        companyId: params.companyId,
        status: CallQueueItemStatus.PENDING,
        sortOrder: 0,
      },
    });
  }

  async resolveOnConversation(
    tx: Prisma.TransactionClient,
    params: ResolveConversationParams,
  ): Promise<void> {
    if (!params.contactId && !params.leadId) return;

    const or: Prisma.CallQueueItemWhereInput[] = [];
    if (params.contactId) or.push({ contactId: params.contactId });
    if (params.leadId) or.push({ leadId: params.leadId });

    await tx.callQueueItem.updateMany({
      where: {
        status: { in: [CallQueueItemStatus.PENDING, CallQueueItemStatus.CLAIMED] },
        callId: { not: null },
        OR: or,
      },
      data: { status: CallQueueItemStatus.CANCELLED },
    });
  }
}
