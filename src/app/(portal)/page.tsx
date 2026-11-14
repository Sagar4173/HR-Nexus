import {
  ArrowUpRight,
  BadgeCheck,
  Inbox,
  MessageSquarePlus,
  ShieldAlert,
  ShieldCheck,
  Timer,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

import { PageHeader, PriorityBadge, StatusBadge, SlaBadge } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { getDashboard } from "@/lib/queries";

export const metadata: Metadata = { title: "Dashboard" };

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export default async function DashboardPage() {
  const session = await requireSession();
  const data = await getDashboard(session);
  const { totals } = data;
  const maxVolume = Math.max(1, ...data.volume.map((point) => point.count));
  const maxQueue = Math.max(1, ...data.queueWorkload.map((row) => row.open));
  const totalStatuses = Math.max(1, data.statusCounts.reduce((sum, row) => sum + row._count, 0));

  const scopeNote =
    session.role === "EMPLOYEE"
      ? "Scoped to tickets you raised. Sensitive cases are visible only as restricted records to authorised teams."
      : session.role === "HR_AGENT"
        ? "Scoped to standard queues. Employee Relations restricted cases are excluded from this view."
        : "Full operations visibility, including Employee Relations restricted cases.";

  return (
    <div>
      <PageHeader
        eyebrow={`Signed in as ${session.employeeNo}`}
        title="Operations overview"
        description={`Synthetic policy-operations dataset. Latest activity ${formatDateTime(data.anchorDate)} IST. ${scopeNote}`}
        actions={
          <>
            <Link href="/ask" className="btn-primary">
              <MessageSquarePlus className="size-4" /> Ask HR
            </Link>
            <Link href="/tickets" className="btn-secondary">
              <Inbox className="size-4" /> Ticket queue
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card p-5">
          <div className="flex items-start justify-between">
            <p className="text-xs font-medium text-slate-500">Open workload</p>
            <span className="rounded-lg bg-indigo-50 p-1.5 text-indigo-600">
              <Inbox className="size-4" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
            {totals.open.toLocaleString("en-IN")}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            of {totals.total.toLocaleString("en-IN")} tickets · {totals.resolved.toLocaleString("en-IN")} resolved
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-start justify-between">
            <p className="text-xs font-medium text-slate-500">SLA compliance</p>
            <span className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600">
              <Timer className="size-4" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
            {pct(totals.slaCompliance)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {totals.slaMet.toLocaleString("en-IN")} met · {totals.slaBreached.toLocaleString("en-IN")} breached ·{" "}
            {totals.slaPaused.toLocaleString("en-IN")} paused
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-start justify-between">
            <p className="text-xs font-medium text-slate-500">Citation validity</p>
            <span className="rounded-lg bg-purple-50 p-1.5 text-purple-600">
              <BadgeCheck className="size-4" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
            {pct(totals.citationRate)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {totals.citationValid.toLocaleString("en-IN")} valid ·{" "}
            {totals.citationInvalid.toLocaleString("en-IN")} flagged by validation
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-start justify-between">
            <p className="text-xs font-medium text-slate-500">Sensitive routing</p>
            <span className="rounded-lg bg-rose-50 p-1.5 text-rose-600">
              <ShieldAlert className="size-4" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
            {pct(totals.routingRate)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {totals.sensitiveRestricted.toLocaleString("en-IN")} of{" "}
            {totals.sensitive.toLocaleString("en-IN")} sensitive cases in the restricted queue
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <section className="card xl:col-span-2">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Ticket volume</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Created per day over the 14 days ending {formatDate(data.anchorDate)} (latest activity)
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
              <TrendingUp className="size-3.5" /> {data.volume.reduce((sum, point) => sum + point.count, 0)} created
            </span>
          </header>
          <div className="flex h-48 items-end gap-2 px-5 pt-6 pb-4">
            {data.volume.map((point) => (
              <div key={point.day} className="group flex h-full flex-1 flex-col justify-end gap-1">
                <div className="relative flex h-full items-end">
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-indigo-500 to-indigo-400 transition group-hover:from-indigo-600 group-hover:to-indigo-500"
                    style={{ height: `${Math.max(4, (point.count / maxVolume) * 100)}%` }}
                    title={`${point.day}: ${point.count} tickets`}
                  />
                </div>
                <span className="text-center text-[9px] text-slate-400">
                  {point.day.slice(8)}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <header className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Open workload by queue</h2>
            <p className="mt-0.5 text-xs text-slate-500">Restricted queues are access-controlled</p>
          </header>
          <div className="space-y-4 p-5">
            {data.queueWorkload.map((row) => (
              <div key={row.queue.id}>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-slate-700">
                    {row.queue.isRestricted ? (
                      <ShieldCheck className="size-3.5 text-purple-500" />
                    ) : (
                      <Inbox className="size-3.5 text-slate-400" />
                    )}
                    {row.queue.name}
                  </span>
                  <span className="tabular-nums text-slate-500">{row.open}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${row.queue.isRestricted ? "bg-purple-500" : "bg-indigo-500"}`}
                    style={{ width: `${Math.max(3, (row.open / maxQueue) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
            {data.queueWorkload.length === 0 && (
              <p className="text-xs text-slate-500">No open tickets in this scope.</p>
            )}
          </div>
        </section>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <section className="card xl:col-span-2">
          <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Recently updated tickets</h2>
              <p className="mt-0.5 text-xs text-slate-500">Latest activity across the queue</p>
            </div>
            <Link
              href="/tickets"
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              View all <ArrowUpRight className="size-3.5" />
            </Link>
          </header>
          <div className="divide-y divide-slate-100">
            {data.recent.map((ticket) => (
              <Link
                key={ticket.id}
                href={`/tickets/${ticket.id}`}
                className="flex items-center gap-3 px-5 py-3 transition hover:bg-slate-50/80"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[11px] text-slate-400">{ticket.ticketNo}</span>
                    <PriorityBadge priority={ticket.priority} />
                    {ticket.isSensitive && (
                      <span className="rounded-full bg-purple-50 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700 ring-1 ring-purple-200 ring-inset">
                        Restricted
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-sm font-medium text-slate-800">
                    {ticket.subject}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {ticket.requester.firstName} {ticket.requester.lastName} ·{" "}
                    {ticket.queue.name} · {formatDateTime(ticket.updatedAt)}
                  </p>
                </div>
                <StatusBadge status={ticket.status} />
              </Link>
            ))}
            {data.recent.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-slate-500">No tickets yet.</p>
            )}
          </div>
        </section>

        <section className="card">
          <header className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-900">State distribution</h2>
            <p className="mt-0.5 text-xs text-slate-500">All tickets in your scope</p>
          </header>
          <div className="space-y-3 p-5">
            {data.statusCounts
              .slice()
              .sort((left, right) => right._count - left._count)
              .map((row) => (
                <div key={row.status}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">{row.status.replaceAll("_", " ")}</span>
                    <span className="tabular-nums text-slate-500">{row._count}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-slate-400"
                      style={{ width: `${(row._count / totalStatuses) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
          </div>
          <div className="border-t border-slate-100 px-5 py-3">
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>SLA at risk / paused</span>
              <span className="flex items-center gap-1.5">
                <SlaBadge state="AT_RISK" /> {totals.slaAtRisk}
                <SlaBadge state="PAUSED" /> {totals.slaPaused}
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
