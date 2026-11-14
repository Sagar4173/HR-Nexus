import {
  AlertCircle,
  ArrowLeft,
  ArrowRightLeft,
  BadgeCheck,
  Bot,
  CalendarClock,
  CheckCircle2,
  Clock,
  Lock,
  MessageSquare,
  ShieldAlert,
  Sparkles,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { canViewRestricted, HR_ROLES, requireSession, isReadOnly } from "@/lib/auth";
import { formatDate, formatDateTime, humanizeStatus } from "@/lib/format";
import { getTicketDetail, listAssignableAgents } from "@/lib/queries";
import {
  Avatar,
  Badge,
  Card,
  KeyValue,
  PageHeader,
  PriorityBadge,
  SensitivityBadge,
  SlaBadge,
  StatusBadge,
} from "@/components/ui";
import {
  assignAction,
  escalateAction,
  priorityAction,
  resolveAction,
  transitionAction,
} from "../actions";

export const metadata: Metadata = { title: "Ticket" };

const SENDER_LABEL: Record<string, string> = {
  EMPLOYEE: "Employee",
  HR_AGENT: "HR agent",
  ER_SPECIALIST: "ER specialist",
  AI: "HR Nexus assistant",
  SYSTEM: "System",
};

function JsonBlock({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-slate-400">—</span>;
  return (
    <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-slate-950 px-2.5 py-2 text-[10px] leading-relaxed text-slate-300">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default async function TicketDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; error?: string; updated?: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const banner = await searchParams;
  const record = await getTicketDetail(id, session);
  if (!record) notFound();

  const { ticket, audit } = record;
  const assignees = await listAssignableAgents(ticket.isSensitive);
  const canAct =
    HR_ROLES.includes(session.role) && !isReadOnly(session.role) && ticket.status !== "CLOSED";
  const canSeeRestricted = canViewRestricted(session.role);
  const openWorkflow = canAct;

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/tickets"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-800"
        >
          <ArrowLeft className="size-3.5" /> Back to tickets
        </Link>
      </div>

      {banner.created && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <span>
            Ticket created. The policy answer and citations below were generated in the same
            transaction.{" "}
            <Link href="/ask" className="font-semibold underline underline-offset-2">
              Ask another question
            </Link>
            .
          </span>
        </div>
      )}
      {banner.updated && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> {banner.updated}. The change is
          recorded in the audit trail.
        </div>
      )}
      {banner.error && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> {banner.error}
        </div>
      )}

      <PageHeader
        eyebrow={ticket.ticketNo}
        title={ticket.subject}
        description={`Raised ${formatDateTime(ticket.createdAt)} by ${ticket.requester.firstName} ${ticket.requester.lastName} · ${ticket.queue.name}`}
        actions={
          <>
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
            {ticket.isSensitive && <SensitivityBadge sensitive />}
            {ticket.sla && <SlaBadge state={ticket.sla.state} />}
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card
            title="Conversation"
            description={`${ticket.messages.length} messages · ${ticket.messages.reduce((sum, message) => sum + message.citations.length, 0)} citations`}
            padded={false}
          >
            <div className="space-y-5 p-5">
              {ticket.messages.map((message) => {
                const isAi = message.senderType === "AI";
                const isSystem = message.senderType === "SYSTEM";
                return (
                  <article
                    key={message.id}
                    className={
                      isAi
                        ? "rounded-xl border border-indigo-100 bg-indigo-50/50 p-4"
                        : isSystem
                          ? "rounded-xl border border-amber-100 bg-amber-50/50 p-4"
                          : "rounded-xl border border-slate-200 bg-slate-50/60 p-4"
                    }
                  >
                    <header className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {isAi ? (
                          <span className="flex size-7 items-center justify-center rounded-full bg-indigo-600 text-white">
                            <Sparkles className="size-3.5" />
                          </span>
                        ) : isSystem ? (
                          <span className="flex size-7 items-center justify-center rounded-full bg-amber-500 text-white">
                            <ShieldAlert className="size-3.5" />
                          </span>
                        ) : (
                          <Avatar
                            first={message.sender?.firstName ?? "?"}
                            last={message.sender?.lastName ?? ""}
                          />
                        )}
                        <div>
                          <p className="text-xs font-semibold text-slate-800">
                            {message.senderType === "EMPLOYEE"
                              ? `${message.sender?.firstName ?? ""} ${message.sender?.lastName ?? ""}`.trim() ||
                                "Employee"
                              : isAi
                                ? "HR Nexus assistant"
                                : SENDER_LABEL[message.senderType] ?? message.senderType}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {formatDateTime(message.createdAt)} · {message.visibility.replaceAll("_", " ").toLowerCase()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {isAi && message.aiRun && (
                          <Badge tone={message.aiRun.status === "SUCCESS" ? "success" : "warning"}>
                            {message.aiRun.provider} · {message.aiRun.status.toLowerCase()}
                          </Badge>
                        )}
                        {isSystem && <Badge tone="warning">Automation bypassed</Badge>}
                      </div>
                    </header>

                    <div className="mt-3 text-sm leading-relaxed whitespace-pre-line text-slate-700">
                      {message.body}
                    </div>

                    {message.citations.length > 0 && (
                      <div className="mt-4 space-y-2.5">
                        <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] text-slate-500 uppercase">
                          <BadgeCheck className="size-3.5 text-emerald-500" /> Validated citations
                        </p>
                        {message.citations.map((citation) => (
                          <div
                            key={citation.id}
                            className="rounded-lg border border-slate-200 bg-white p-3"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="text-xs font-semibold text-slate-800">
                                  {citation.policyVersion.policyDocument.code} ·{" "}
                                  {citation.policyVersion.policyDocument.title}
                                </p>
                                <p className="mt-0.5 text-[10px] text-slate-400">
                                  {citation.policyVersion.versionLabel} · effective{" "}
                                  {formatDate(citation.policyVersion.effectiveFrom)}
                                  {citation.policyVersion.effectiveTo
                                    ? ` → ${formatDate(citation.policyVersion.effectiveTo)}`
                                    : " → current"}
                                </p>
                              </div>
                              <Badge tone={citation.validated === "VALID" ? "success" : "danger"}>
                                {citation.validated === "VALID" ? "Validated" : "Invalid"}
                              </Badge>
                            </div>
                            <blockquote className="mt-2 border-l-2 border-indigo-300 pl-3 text-xs leading-relaxed text-slate-600">
                              “{citation.quote}”
                            </blockquote>
                            <p className="mt-2 text-[10px] text-slate-400">
                              {citation.policyChunk.heading} · {citation.validationNote}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {isAi && message.citations.length === 0 && (
                      <p className="mt-3 text-[11px] text-slate-500">
                        No citation was attached to this message.
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          </Card>

          {ticket.resolution && (
            <Card title="Resolution" description="Recorded when the ticket was resolved">
              <p className="text-sm leading-relaxed whitespace-pre-line text-slate-700">
                {ticket.resolution.summary}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                <Badge tone="success">{humanizeStatus(ticket.resolution.resolutionType)}</Badge>
                <span>
                  Resolved by {ticket.resolution.resolvedBy.firstName}{" "}
                  {ticket.resolution.resolvedBy.lastName} · {formatDateTime(ticket.resolution.createdAt)}
                </span>
              </div>
            </Card>
          )}

          <Card
            title="Audit trail"
            description={`${audit.length} append-only events for this ticket`}
            padded={false}
          >
            <ol className="divide-y divide-slate-100">
              {audit.map((event) => (
                <li key={event.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                      <Clock className="size-3.5 text-slate-400" />
                      {humanizeStatus(event.action)}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {formatDateTime(event.createdAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    {event.actorType} · {event.actorId?.slice(0, 8) ?? "system"}… · request{" "}
                    {event.requestId?.slice(0, 8) ?? "—"}…
                  </p>
                  <details className="mt-1.5">
                    <summary className="cursor-pointer text-[10px] font-medium text-indigo-600">
                      Before / after payload
                    </summary>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <JsonBlock value={event.beforeJson} />
                      <JsonBlock value={event.afterJson} />
                    </div>
                  </details>
                </li>
              ))}
              {audit.length === 0 && (
                <li className="px-5 py-6 text-center text-xs text-slate-500">
                  No audit events recorded for this ticket.
                </li>
              )}
            </ol>
          </Card>
        </div>

        <div className="space-y-5">
          {ticket.sla && (
            <Card
              title="SLA commitment"
              description={`${ticket.sla.rule.code} · ${ticket.sla.calendar.name}`}
              action={<SlaBadge state={ticket.sla.state} />}
            >
              <dl className="divide-y divide-slate-100">
                <KeyValue label="Started">{formatDateTime(ticket.sla.startedAt)}</KeyValue>
                <KeyValue label="First response due">
                  {formatDateTime(ticket.sla.firstResponseDueAt)}
                </KeyValue>
                <KeyValue label="Resolution due">
                  {formatDateTime(ticket.sla.resolutionDueAt)}
                </KeyValue>
                <KeyValue label="First responded">
                  {formatDateTime(ticket.sla.firstRespondedAt)}
                </KeyValue>
                <KeyValue label="Paused at">{formatDateTime(ticket.sla.pausedAt)}</KeyValue>
                <KeyValue label="Paused time">
                  {Math.round(ticket.sla.accumulatedPauseSec / 60)} min
                </KeyValue>
                <KeyValue label="Resolved at">{formatDateTime(ticket.sla.resolvedAt)}</KeyValue>
              </dl>
              <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5 text-[10px] leading-relaxed text-slate-500">
                Business-hours clock: {ticket.sla.calendar.workdays.replaceAll(",", ", ")} ·{" "}
                {String(Math.floor(ticket.sla.calendar.startMinute / 60)).padStart(2, "0")}:
                {String(ticket.sla.calendar.startMinute % 60).padStart(2, "0")}–
                {String(Math.floor(ticket.sla.calendar.endMinute / 60)).padStart(2, "0")}:
                {String(ticket.sla.calendar.endMinute % 60).padStart(2, "0")} ·{" "}
                {ticket.sla.calendar.timezone}. First response {ticket.sla.rule.firstResponseMinutes}m,
                resolution {ticket.sla.rule.resolutionMinutes}m, escalation at{" "}
                {ticket.sla.rule.escalationPct}%.
              </div>
              {ticket.sla.events.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-[11px] font-medium text-indigo-600">
                    {ticket.sla.events.length} SLA events
                  </summary>
                  <ul className="mt-2 space-y-1.5">
                    {ticket.sla.events.map((event) => (
                      <li key={event.id} className="flex items-start justify-between gap-2 text-[10px]">
                        <span className="font-medium text-slate-600">{humanizeStatus(event.type)}</span>
                        <span className="text-right text-slate-400">
                          {formatDateTime(event.occurredAt)}
                          <span className="block max-w-[11rem]">{event.note}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </Card>
          )}

          <Card title="Ticket details">
            <dl className="divide-y divide-slate-100">
              <KeyValue label="Requester">
                {ticket.requester.firstName} {ticket.requester.lastName}
                <span className="block font-mono text-[10px] text-slate-400">
                  {ticket.requester.employeeNo}
                </span>
              </KeyValue>
              <KeyValue label="Department">{ticket.requester.department.name}</KeyValue>
              <KeyValue label="Location / type">
                {ticket.requester.locationCountry} ·{" "}
                {ticket.requester.employmentType.replaceAll("_", " ").toLowerCase()}
              </KeyValue>
              <KeyValue label="Queue">
                <span className="inline-flex items-center gap-1">
                  {ticket.queue.isRestricted && <Lock className="size-3 text-purple-500" />}
                  {ticket.queue.name}
                </span>
              </KeyValue>
              <KeyValue label="Category">{ticket.category?.name ?? "Unclassified"}</KeyValue>
              <KeyValue label="Sensitivity">{ticket.sensitivity.replaceAll("_", " ")}</KeyValue>
              <KeyValue label="Channel">{humanizeStatus(ticket.sourceChannel)}</KeyValue>
              <KeyValue label="AI intent">
                {ticket.aiIntent ?? "—"}
                {ticket.aiConfidence !== null && (
                  <span className="ml-1 text-slate-400">
                    ({(ticket.aiConfidence * 100).toFixed(0)}%)
                  </span>
                )}
              </KeyValue>
              <KeyValue label="Assignee">
                {ticket.assignee
                  ? `${ticket.assignee.firstName} ${ticket.assignee.lastName}`
                  : "Unassigned"}
              </KeyValue>
              <KeyValue label="Created">{formatDateTime(ticket.createdAt)}</KeyValue>
              <KeyValue label="Updated">{formatDateTime(ticket.updatedAt)}</KeyValue>
            </dl>
          </Card>

          {canAct && (
            <Card title="Assignment" description="Only eligible staff appear in this list">
              <form action={assignAction} className="space-y-2.5">
                <input type="hidden" name="ticketId" value={ticket.id} />
                <select
                  name="assigneeId"
                  required
                  defaultValue={ticket.assigneeId ?? ""}
                  className="select w-full"
                  aria-label="Assignee"
                >
                  <option value="" disabled>
                    Choose an assignee
                  </option>
                  {assignees.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.firstName} {agent.lastName} · {agent.role.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn-primary w-full">
                  <ArrowRightLeft className="size-4" /> Assign ticket
                </button>
              </form>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
                Restricted tickets can only be assigned to ER specialists or HR admins.
                {ticket.assignments.length > 0 &&
                  ` ${ticket.assignments.length} prior assignment${ticket.assignments.length === 1 ? "" : "s"} on record.`}
              </p>
            </Card>
          )}

          {openWorkflow && (
            <Card title="Workflow actions" description="Every transition writes an audit event">
              <div className="flex flex-wrap gap-2">
                <form action={transitionAction}>
                  <input type="hidden" name="ticketId" value={ticket.id} />
                  <input type="hidden" name="type" value="start" />
                  <button type="submit" className="btn-secondary">
                    <MessageSquare className="size-4" /> Start work
                  </button>
                </form>
                <form action={transitionAction}>
                  <input type="hidden" name="ticketId" value={ticket.id} />
                  <input type="hidden" name="type" value="wait_employee" />
                  <button type="submit" className="btn-secondary">
                    <Clock className="size-4" /> Wait on employee
                  </button>
                </form>
                <form action={transitionAction}>
                  <input type="hidden" name="ticketId" value={ticket.id} />
                  <input type="hidden" name="type" value="wait_hr" />
                  <button type="submit" className="btn-secondary">
                    <UserRound className="size-4" /> Wait on HR
                  </button>
                </form>
                <form action={transitionAction}>
                  <input type="hidden" name="ticketId" value={ticket.id} />
                  <input type="hidden" name="type" value="close" />
                  <button type="submit" className="btn-secondary">
                    Close
                  </button>
                </form>
              </div>

              <form action={priorityAction} className="mt-4 flex items-end gap-2 border-t border-slate-100 pt-4">
                <input type="hidden" name="ticketId" value={ticket.id} />
                <div className="flex-1">
                  <label htmlFor="priority" className="text-[11px] font-medium text-slate-600">
                    Priority
                  </label>
                  <select
                    id="priority"
                    name="priority"
                    defaultValue={ticket.priority}
                    className="select mt-1 w-full"
                  >
                    {["P1", "P2", "P3", "P4"].map((priority) => (
                      <option key={priority} value={priority}>
                        {priority}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="btn-secondary">
                  Recalculate SLA
                </button>
              </form>

              <form action={resolveAction} className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                <input type="hidden" name="ticketId" value={ticket.id} />
                <label htmlFor="summary" className="text-[11px] font-medium text-slate-600">
                  Resolution summary
                </label>
                <textarea
                  id="summary"
                  name="summary"
                  rows={3}
                  required
                  minLength={5}
                  placeholder="What was agreed or confirmed with the employee?"
                  className="input h-auto resize-y py-2"
                />
                <button type="submit" className="btn-primary w-full">
                  <CheckCircle2 className="size-4" /> Resolve ticket
                </button>
              </form>

              <form action={escalateAction} className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                <input type="hidden" name="ticketId" value={ticket.id} />
                <label htmlFor="reason" className="text-[11px] font-medium text-slate-600">
                  Escalation reason
                </label>
                <textarea
                  id="reason"
                  name="reason"
                  rows={2}
                  required
                  minLength={5}
                  placeholder="Why does this need a higher level?"
                  className="input h-auto resize-y py-2"
                />
                <button type="submit" className="btn-danger w-full">
                  <ShieldAlert className="size-4" /> Escalate
                </button>
              </form>
            </Card>
          )}

          {!canSeeRestricted && ticket.isSensitive && (
            <div className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-xs text-purple-800">
              <Lock className="mb-1 size-4" /> This restricted case is visible because of your
              current role, but only ER specialists can act on it.
            </div>
          )}

          <Card title="AI runs" description="Deterministic pipeline telemetry" padded={false}>
            <ul className="divide-y divide-slate-100">
              {ticket.aiRuns.map((run) => (
                <li key={run.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                      <Bot className="size-3.5 text-slate-400" /> {humanizeStatus(run.kind)}
                    </span>
                    <Badge tone={run.status === "SUCCESS" ? "success" : "warning"}>
                      {run.status}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    {run.provider} · {run.model} · {run.promptVersion} · {run.latencyMs}ms ·{" "}
                    {formatDate(run.createdAt)}
                  </p>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[10px] font-medium text-indigo-600">
                      Structured output
                    </summary>
                    <JsonBlock value={run.outputJson} />
                  </details>
                </li>
              ))}
              {ticket.aiRuns.length === 0 && (
                <li className="px-5 py-6 text-center text-xs text-slate-500">
                  No AI runs recorded.
                </li>
              )}
            </ul>
          </Card>

          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[10px] leading-relaxed text-slate-500">
            <CalendarClock className="size-4 shrink-0 text-slate-400" />
            Deadline calculations use the configured demo calendar and are not official HR
            commitments.
          </div>
        </div>
      </div>
    </div>
  );
}
