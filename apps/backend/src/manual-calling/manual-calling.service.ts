import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ActivityType,
  CallQueueItemStatus,
  ManualCallOutcome,
  ManualCallSessionStatus,
  Prisma,
} from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CompleteSessionDto } from "./dto/complete-session.dto";
import { EnqueueQueueItemDto } from "./dto/enqueue-queue-item.dto";
import { StartSessionDto } from "./dto/start-session.dto";
import { validateManualCallCompletePayload } from "./manual-calling-outcome.validation";
import { ManualCallingRingostatLinkService } from "./manual-calling-ringostat-link.service";

@Injectable()
export class ManualCallingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ringostatLink: ManualCallingRingostatLinkService,
  ) {}

  getPlaybook() {
    return {
      sections: [
        {
          id: "opening",
          title: "Відкриття",
          bullets: [
            "Представитись, назвати компанію",
            "Коротко пояснити мету дзвінка",
            "Уточнити, чи зручно говорити зараз",
          ],
        },
        {
          id: "qualification",
          title: "Кваліфікація",
          bullets: [
            "Роль співрозмовника / ЛПР",
            "Актуальність продукту для них",
            "Чи є поточний постачальник / конкуренти",
          ],
        },
        {
          id: "needs",
          title: "Потреби",
          bullets: ["Основні болі / задачі", "Терміни та пріоритет", "Обсяг / формат закупівлі"],
        },
        {
          id: "offer",
          title: "Пропозиція",
          bullets: ["Коротко цінність", "Наступний крок (КП / зустріч / дзвінок)", "Заперечення — зафіксувати"],
        },
        {
          id: "close",
          title: "Завершення",
          bullets: ["Підсумок домовленостей", "Що робимо далі і коли", "Подяка"],
        },
      ],
    };
  }

  async getQueue(actor: AuthUser) {
    const items = await this.prisma.callQueueItem.findMany({
      where: {
        assigneeId: actor.id,
        status: { in: [CallQueueItemStatus.PENDING, CallQueueItemStatus.CLAIMED] },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        lead: {
          select: {
            id: true,
            fullName: true,
            firstName: true,
            lastName: true,
            phone: true,
            status: true,
            company: { select: { id: true, name: true } },
          },
        },
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            company: { select: { id: true, name: true } },
          },
        },
        sessions: {
          where: { status: ManualCallSessionStatus.OPEN },
          take: 1,
          select: { id: true, startedAt: true },
        },
      },
    });
    return { items: items.map((it) => this.mapQueueItem(it)) };
  }

  async enqueue(dto: EnqueueQueueItemDto, actor: AuthUser) {
    const leadId = dto.leadId?.trim() || null;
    const contactId = dto.contactId?.trim() || null;
    if (!!leadId === !!contactId) {
      throw new BadRequestException("Exactly one of leadId or contactId is required");
    }

    let companyId: string | null = null;
    if (leadId) {
      const lead = await this.prisma.lead.findUnique({
        where: { id: leadId },
        select: { id: true, companyId: true, ownerId: true },
      });
      if (!lead) throw new NotFoundException("Lead not found");
      this.assertLeadOwner(lead.ownerId, actor);
      companyId = lead.companyId;
      await this.prisma.callQueueItem.create({
        data: {
          assigneeId: actor.id,
          leadId,
          companyId,
          status: CallQueueItemStatus.PENDING,
          sortOrder: await this.nextSortOrder(actor.id),
        },
      });
    } else {
      const contact = await this.prisma.contact.findUnique({
        where: { id: contactId! },
        select: { id: true, companyId: true, ownerId: true },
      });
      if (!contact) throw new NotFoundException("Contact not found");
      this.assertContactOwner(contact.ownerId, actor);
      companyId = contact.companyId ?? null;
      await this.prisma.callQueueItem.create({
        data: {
          assigneeId: actor.id,
          contactId: contactId!,
          companyId,
          status: CallQueueItemStatus.PENDING,
          sortOrder: await this.nextSortOrder(actor.id),
        },
      });
    }

    return { ok: true };
  }

  async claimQueueItem(queueItemId: string, actor: AuthUser) {
    const item = await this.prisma.callQueueItem.findUnique({
      where: { id: queueItemId },
      include: {
        lead: { select: { ownerId: true } },
        contact: { select: { ownerId: true } },
      },
    });
    if (!item) throw new NotFoundException("Queue item not found");
    if (item.assigneeId !== actor.id) {
      throw new ForbiddenException("This queue item belongs to another user");
    }
    if (item.status !== CallQueueItemStatus.PENDING) {
      throw new ConflictException("Queue item is not pending");
    }
    this.assertLeadOwner(item.leadId ? item.lead?.ownerId : null, actor, true);
    this.assertContactOwner(item.contactId ? item.contact?.ownerId : null, actor, true);

    const phoneNorm = await this.resolveTargetPhoneNormalized(item.leadId, item.contactId);

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.callQueueItem.update({
        where: { id: queueItemId },
        data: { status: CallQueueItemStatus.CLAIMED },
      });

      let open = await tx.manualCallSession.findFirst({
        where: { queueItemId, status: ManualCallSessionStatus.OPEN },
      });
      if (!open) {
        open = await tx.manualCallSession.create({
          data: {
            queueItemId,
            userId: actor.id,
            leadId: item.leadId,
            contactId: item.contactId,
            companyId: item.companyId,
            targetPhoneNormalized: phoneNorm,
            status: ManualCallSessionStatus.OPEN,
          },
        });
      }
      return open;
    });

    return { session: await this.getSessionById(result.id, actor) };
  }

  async skipQueueItem(queueItemId: string, actor: AuthUser) {
    const item = await this.prisma.callQueueItem.findUnique({ where: { id: queueItemId } });
    if (!item) throw new NotFoundException("Queue item not found");
    if (item.assigneeId !== actor.id) {
      throw new ForbiddenException("This queue item belongs to another user");
    }
    if (
      item.status !== CallQueueItemStatus.PENDING &&
      item.status !== CallQueueItemStatus.CLAIMED
    ) {
      throw new ConflictException("Queue item cannot be skipped");
    }

    await this.prisma.$transaction([
      this.prisma.manualCallSession.updateMany({
        where: { queueItemId, status: ManualCallSessionStatus.OPEN },
        data: { status: ManualCallSessionStatus.CANCELLED },
      }),
      this.prisma.callQueueItem.update({
        where: { id: queueItemId },
        data: { status: CallQueueItemStatus.SKIPPED },
      }),
    ]);

    return { ok: true };
  }

  async startSession(dto: StartSessionDto, actor: AuthUser) {
    const item = await this.prisma.callQueueItem.findUnique({
      where: { id: dto.queueItemId },
      include: {
        lead: { select: { ownerId: true } },
        contact: { select: { ownerId: true } },
      },
    });
    if (!item) throw new NotFoundException("Queue item not found");
    if (item.assigneeId !== actor.id) {
      throw new ForbiddenException("This queue item belongs to another user");
    }
    if (item.status !== CallQueueItemStatus.CLAIMED) {
      throw new ConflictException("Queue item must be claimed first");
    }
    this.assertLeadOwner(item.leadId ? item.lead?.ownerId : null, actor, true);
    this.assertContactOwner(item.contactId ? item.contact?.ownerId : null, actor, true);

    const phoneNorm = await this.resolveTargetPhoneNormalized(item.leadId, item.contactId);

    let session = await this.prisma.manualCallSession.findFirst({
      where: { queueItemId: item.id, status: ManualCallSessionStatus.OPEN },
    });
    if (!session) {
      session = await this.prisma.manualCallSession.create({
        data: {
          queueItemId: item.id,
          userId: actor.id,
          leadId: item.leadId,
          contactId: item.contactId,
          companyId: item.companyId,
          targetPhoneNormalized: phoneNorm,
          status: ManualCallSessionStatus.OPEN,
        },
      });
    }

    return { session: await this.getSessionById(session.id, actor) };
  }

  async getSession(sessionId: string, actor: AuthUser) {
    return { session: await this.getSessionById(sessionId, actor) };
  }

  async completeSession(sessionId: string, dto: CompleteSessionDto, actor: AuthUser) {
    validateManualCallCompletePayload(dto);

    if (dto.idempotencyKey) {
      const prior = await this.prisma.manualCallSession.findUnique({
        where: { completionIdempotencyKey: dto.idempotencyKey },
        include: { queueItem: true, call: true, activity: true },
      });
      if (prior && prior.userId === actor.id && prior.status === ManualCallSessionStatus.COMPLETED) {
        return { session: this.mapCompletedSession(prior), idempotent: true };
      }
    }

    const completed = await this.prisma.$transaction(async (tx) => {
      const session = await tx.manualCallSession.findUnique({
        where: { id: sessionId },
        include: { queueItem: true },
      });
      if (!session) throw new NotFoundException("Session not found");
      if (session.userId !== actor.id) throw new ForbiddenException("Not your session");
      if (session.status === ManualCallSessionStatus.COMPLETED) {
        const full = await tx.manualCallSession.findUnique({
          where: { id: sessionId },
          include: { queueItem: true, call: true, activity: true },
        });
        return { session: full!, alreadyCompleted: true };
      }
      if (session.status !== ManualCallSessionStatus.OPEN) {
        throw new ConflictException("Session is not open");
      }

      if (session.activityId) {
        const full = await tx.manualCallSession.findUnique({
          where: { id: sessionId },
          include: { queueItem: true, call: true, activity: true },
        });
        return { session: full!, alreadyCompleted: true };
      }

      const completedAt = new Date();
      const callId = await this.ringostatLink.tryLinkSessionToCall({
        userId: actor.id,
        targetPhoneNormalized: session.targetPhoneNormalized,
        anchorAt: completedAt,
      });

      await this.createOutcomeTasksTx(tx, dto, session, actor, completedAt);

      const activityBody = this.buildActivityBody(dto, completedAt);
      const activity = await tx.activity.create({
        data: {
          type: ActivityType.MANUAL_CALL,
          title: `Прозвон: ${dto.outcome}`,
          body: activityBody,
          createdBy: actor.id,
          occurredAt: completedAt,
          leadId: session.leadId,
          contactId: session.contactId,
          companyId: session.companyId,
        },
      });

      const updated = await tx.manualCallSession.update({
        where: { id: sessionId },
        data: {
          status: ManualCallSessionStatus.COMPLETED,
          completedAt,
          outcome: dto.outcome,
          note: dto.note?.trim() ?? null,
          callbackAt: dto.callbackAt ? new Date(dto.callbackAt) : null,
          callId: callId ?? null,
          activityId: activity.id,
          completionIdempotencyKey: dto.idempotencyKey?.trim() || null,
        },
        include: { queueItem: true, call: true, activity: true },
      });

      await tx.callQueueItem.update({
        where: { id: session.queueItemId },
        data: { status: CallQueueItemStatus.DONE },
      });

      return { session: updated, alreadyCompleted: false };
    });

    if (completed.alreadyCompleted) {
      return { session: this.mapCompletedSession(completed.session), idempotent: true };
    }

    return { session: this.mapCompletedSession(completed.session), idempotent: false };
  }

  private async createOutcomeTasksTx(
    tx: Prisma.TransactionClient,
    dto: CompleteSessionDto,
    session: {
      leadId: string | null;
      contactId: string | null;
      companyId: string | null;
    },
    actor: AuthUser,
    completedAt: Date,
  ) {
    const base = {
      assigneeId: actor.id,
      createdById: actor.id,
      leadId: session.leadId,
      contactId: session.contactId,
      companyId: session.companyId,
    };

    if (dto.outcome === ManualCallOutcome.REQUESTED_CALLBACK) {
      const due = new Date(dto.callbackAt!);
      await tx.task.create({
        data: {
          ...base,
          title: "Перезвонити клієнту",
          body: dto.note?.trim() ?? null,
          dueAt: due,
        },
      });
    } else if (dto.outcome === ManualCallOutcome.REQUESTED_OFFER) {
      await tx.task.create({
        data: {
          ...base,
          title: "Надіслати комерційну пропозицію",
          body: dto.note?.trim() ?? null,
          dueAt: null,
        },
      });
    } else if (dto.outcome === ManualCallOutcome.MEETING_SCHEDULED) {
      const due = new Date(dto.callbackAt!);
      await tx.task.create({
        data: {
          ...base,
          title: "Зустріч з клієнтом",
          body: dto.note?.trim() ?? null,
          dueAt: due,
        },
      });
    }
  }

  private buildActivityBody(dto: CompleteSessionDto, completedAt: Date): string {
    const lines = [
      `Результат: ${dto.outcome}`,
      `Час завершення: ${completedAt.toISOString()}`,
    ];
    if (dto.note?.trim()) lines.push("", dto.note.trim());
    if (dto.callbackAt) lines.push("", `Наступний контакт: ${dto.callbackAt}`);
    return lines.join("\n");
  }

  private mapCompletedSession(s: {
    id: string;
    queueItemId: string;
    userId: string;
    status: ManualCallSessionStatus;
    startedAt: Date;
    completedAt: Date | null;
    outcome: ManualCallOutcome | null;
    note: string | null;
    callbackAt: Date | null;
    callId: string | null;
    activityId: string | null;
    leadId: string | null;
    contactId: string | null;
    companyId: string | null;
    call: {
      id: string;
      durationSec: number | null;
      recordingUrl: string | null;
      recordingStatus: string | null;
      status: string;
    } | null;
  }) {
    return {
      id: s.id,
      queueItemId: s.queueItemId,
      userId: s.userId,
      status: s.status,
      startedAt: s.startedAt.toISOString(),
      completedAt: s.completedAt?.toISOString() ?? null,
      outcome: s.outcome,
      note: s.note,
      callbackAt: s.callbackAt?.toISOString() ?? null,
      callId: s.callId,
      activityId: s.activityId,
      leadId: s.leadId,
      contactId: s.contactId,
      companyId: s.companyId,
      linkedCall: s.call
        ? {
            id: s.call.id,
            durationSec: s.call.durationSec,
            recordingUrl: s.call.recordingUrl,
            recordingStatus: s.call.recordingStatus,
            status: s.call.status,
          }
        : null,
    };
  }

  private async getSessionById(sessionId: string, actor: AuthUser) {
    const s = await this.prisma.manualCallSession.findUnique({
      where: { id: sessionId },
      include: {
        queueItem: {
          include: {
            lead: {
              select: {
                id: true,
                fullName: true,
                firstName: true,
                lastName: true,
                phone: true,
                status: true,
                company: { select: { id: true, name: true } },
              },
            },
            contact: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
                company: { select: { id: true, name: true } },
              },
            },
            sessions: {
              where: { status: ManualCallSessionStatus.OPEN },
              take: 1,
              select: { id: true, startedAt: true },
            },
          },
        },
        call: true,
        lead: {
          select: {
            id: true,
            fullName: true,
            firstName: true,
            lastName: true,
            phone: true,
            status: true,
            company: { select: { id: true, name: true } },
          },
        },
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            company: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!s) throw new NotFoundException("Session not found");
    if (s.userId !== actor.id) throw new ForbiddenException("Not your session");
    return {
      id: s.id,
      queueItemId: s.queueItemId,
      status: s.status,
      startedAt: s.startedAt.toISOString(),
      completedAt: s.completedAt?.toISOString() ?? null,
      outcome: s.outcome,
      note: s.note,
      callbackAt: s.callbackAt?.toISOString() ?? null,
      targetPhoneNormalized: s.targetPhoneNormalized,
      callId: s.callId,
      activityId: s.activityId,
      linkedCall: s.call
        ? {
            id: s.call.id,
            durationSec: s.call.durationSec,
            recordingUrl: s.call.recordingUrl,
            recordingStatus: s.call.recordingStatus,
            status: s.call.status,
          }
        : null,
      queueItem: this.mapQueueItem(s.queueItem),
      lead: s.lead,
      contact: s.contact,
    };
  }

  private mapQueueItem(it: {
    id: string;
    status: CallQueueItemStatus;
    sortOrder: number;
    callId: string | null;
    leadId: string | null;
    contactId: string | null;
    companyId: string | null;
    createdAt: Date;
    lead: {
      id: string;
      fullName: string | null;
      firstName: string | null;
      lastName: string | null;
      phone: string | null;
      status: string;
      company: { id: string; name: string } | null;
    } | null;
    contact: {
      id: string;
      firstName: string;
      lastName: string;
      phone: string;
      company: { id: string; name: string } | null;
    } | null;
    sessions: { id: string; startedAt: Date }[];
  }) {
    const target =
      it.leadId && it.lead
        ? {
            kind: "LEAD" as const,
            id: it.lead.id,
            displayName:
              it.lead.fullName?.trim() ||
              [it.lead.firstName, it.lead.lastName].filter(Boolean).join(" ").trim() ||
              it.lead.phone ||
              "Lead",
            phone: it.lead.phone,
            companyName: it.lead.company?.name ?? null,
          }
        : it.contact
          ? {
              kind: "CONTACT" as const,
              id: it.contact.id,
              displayName: `${it.contact.firstName} ${it.contact.lastName}`.trim(),
              phone: it.contact.phone,
              companyName: it.contact.company?.name ?? null,
            }
          : null;

    return {
      id: it.id,
      status: it.status,
      sortOrder: it.sortOrder,
      source: it.callId ? ("MISSED_CALL" as const) : ("MANUAL" as const),
      target,
      openSessionId: it.sessions[0]?.id ?? null,
      createdAt: it.createdAt.toISOString(),
    };
  }

  private async nextSortOrder(assigneeId: string): Promise<number> {
    const agg = await this.prisma.callQueueItem.aggregate({
      where: {
        assigneeId,
        status: { in: [CallQueueItemStatus.PENDING, CallQueueItemStatus.CLAIMED] },
      },
      _max: { sortOrder: true },
    });
    return (agg._max.sortOrder ?? 0) + 1;
  }

  private async resolveTargetPhoneNormalized(
    leadId: string | null,
    contactId: string | null,
  ): Promise<string | null> {
    if (leadId) {
      const lead = await this.prisma.lead.findUnique({
        where: { id: leadId },
        select: { phoneNormalized: true, phone: true },
      });
      return this.normalizePhone(lead?.phoneNormalized ?? lead?.phone ?? null);
    }
    if (contactId) {
      const c = await this.prisma.contact.findUnique({
        where: { id: contactId },
        select: { phoneNormalized: true, phone: true },
      });
      return this.normalizePhone(c?.phoneNormalized ?? c?.phone ?? null);
    }
    return null;
  }

  private normalizePhone(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const digits = raw.replace(/\D/g, "");
    return digits.length ? digits : null;
  }

  private assertLeadOwner(ownerId: string | null | undefined, actor: AuthUser, strict = false) {
    if (actor.role !== UserRole.MANAGER) return;
    if (ownerId != null && ownerId !== actor.id) {
      throw new ForbiddenException("You can only access leads assigned to you");
    }
    if (strict && ownerId == null) {
      // unassigned lead still callable by manager in many CRMs — keep allowed
    }
  }

  private assertContactOwner(ownerId: string | null | undefined, actor: AuthUser, strict = false) {
    if (actor.role !== UserRole.MANAGER) return;
    if (ownerId != null && ownerId !== actor.id) {
      throw new ForbiddenException("You can only access contacts assigned to you");
    }
    void strict;
  }
}
