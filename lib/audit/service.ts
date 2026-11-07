import "server-only";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

/**
 * Audit log for sensitive admin actions.
 *
 * Append-only by convention: nothing in the application updates or deletes a
 * row here. The actor's email is denormalised so the record survives the
 * account being deleted — an audit trail that disappears with its subject is
 * not an audit trail.
 */

export type AuditAction =
  | "user.role_changed"
  | "user.status_changed"
  | "question.created"
  | "question.updated"
  | "question.deleted"
  | "question.ai_generated"
  | "question.reviewed"
  | "assessment.created"
  | "assessment.updated"
  | "assessment.deleted"
  | "assessment.published"
  | "assessment.unpublished";

export async function recordAudit(args: {
  actorId: string;
  actorEmail: string;
  action: AuditAction;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: args.actorId,
        actorEmail: args.actorEmail,
        action: args.action,
        targetType: args.targetType,
        targetId: args.targetId ?? null,
        metadata: (args.metadata ?? {}) as Prisma.InputJsonValue,
        ip: args.ip ?? null,
      },
    });
  } catch (error) {
    // Logging must never break the action it is recording.
    console.error("[audit] failed to record:", error);
  }
}

export async function listAuditLogs(args: {
  page?: number;
  pageSize?: number;
  action?: string;
  actorId?: string;
}) {
  const page = Math.max(1, args.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, args.pageSize ?? 30));

  const where: Prisma.AuditLogWhereInput = {
    ...(args.action ? { action: args.action } : {}),
    ...(args.actorId ? { actorId: args.actorId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Extracts the client IP from proxy headers, for the audit record. */
export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip");
}
