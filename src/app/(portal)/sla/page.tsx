import { CalendarDays, Clock, Gauge, Timer, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

import { Badge, Card, PageHeader, PriorityBadge, SlaBadge, StatusBadge } from "@/components/ui";
import { requireHrSession } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { getSlaOverview } from "@/lib/queries";
import { businessHolidayKeys, businessMinutesBetween, parseWorkdays } from "@/lib/sla";

export const metadata: Metadata = { title: "SLA monitor" };

export default async function SlaPage() {
  const session = await requireHrSession();
  const { counts, openTotal, openTickets, rules, calendar } = await getSlaOverview(session);

  const stateMap = new Map(counts.map((row) => [row.state, row._count]));
  const total = counts.reduce((sum, row) => sum + row._count, 0);
  const met = stateMap.get("MET") ?? 0;
  const breached = stateMap.get("BREACHED") ?? 0;
  const atRisk = stateMap.get("AT_RISK") ?? 0;
  const paused = stateMap.get("PAUSED") ?? 0;
  const compliance = met + breached > 0 ? met / (met + breached) : 0;

  const now = new Date();
  const business = calendar
    ? {
        timeZone: calendar.timezone,
        workdays: parseWorkdays(calendar.workdays),
        startMinute: calendar.startMinute,
        endMinute: calendar.endMinute,
        holidays: businessHolidayKeys(calendar.holidays, calendar.timezone),
      }
    : null;

  function remaining(dueAt: Date | null | undefined, state: string): string {
    if (!dueAt) return "—";
    if (state === "PAUSED") return "Clock paused";
    if (state === "MET") return "Met";
    if (!business) return state;
    if (dueAt.getTime() <= now.getTime()) {
      const overdue = businessMinutesBetween(dueAt, now, business);
      return overdue >= 60
        ? `Overdue by ${Math.round(overdue / 60)}h business time`
        : `Overdue by ${overdue}m business time`;
    }
    const left = businessMinutesBetween(now, dueAt, business);
    return left >= 60 ? `${Math.round(left / 60)}h business time left` : `${left}m business time left`;
  }

  return (
    <div>
      <PageHeader
        eyebrow="Service levels"
        title="SLA monitor"
        description="All deadlines use the configured demo calendar: Asia/Kolkata business hours, Monday–Friday 09:00–18:00, with holidays excluded. The clock pauses while a ticket waits on the employee."
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
            <Timer className="size-4 text-indigo-500" />
            {total.toLocaleString("en-IN")} tracked tickets
          </span>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card p-5">
          <p className="text-xs font-medium text-slate-500">Compliance (met / closed)</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {(compliance * 100).toFixed(1)}%
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${compliance * 100}%` }} />
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            {met.toLocaleString("en-IN")} met · {breached.toLocaleString("en-IN")} breached
          </p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium text-slate-500">At risk</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{atRisk}</p>
          <p className="mt-2 text-[11px] text-slate-400">Past 75% of the resolution window</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium text-slate-500">Paused</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{paused}</p>
          <p className="mt-2 text-[11px] text-slate-400">Waiting on an employee response</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium text-slate-500">Open tickets with SLA</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {openTotal.toLocaleString("en-IN")}
          </p>
          <p className="mt-2 text-[11px] text-slate-400">
            Earliest {openTickets.length} deadlines listed below
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card
          title="SLA rules"
          description="Configurable thresholds — demo assumptions, not official requirements"
          padded={false}
          className="xl:col-span-2"
        >
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate-50/70">
                <tr>
                  <th className="table-head">Priority</th>
                  <th className="table-head">First response</th>
                  <th className="table-head">Resolution</th>
                  <th className="table-head">Escalate at</th>
                  <th className="table-head">Pause on employee wait</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td className="table-cell">
                      <PriorityBadge priority={rule.priority} />
                      <span className="ml-2 font-mono text-[10px] text-slate-400">{rule.code}</span>
                    </td>
                    <td className="table-cell tabular-nums">{rule.firstResponseMinutes} min</td>
                    <td className="table-cell tabular-nums">{rule.resolutionMinutes} min</td>
                    <td className="table-cell tabular-nums">{rule.escalationPct}%</td>
                    <td className="table-cell">
                      <Badge tone={rule.pauseOnWaitingEmployee ? "success" : "danger"}>
                        {rule.pauseOnWaitingEmployee ? "Yes" : "No"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Business calendar" description={calendar?.name ?? "Not configured"}>
          <div className="space-y-3 text-xs text-slate-600">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-500">
                <Clock className="size-3.5" /> Time zone
              </span>
              <span className="font-medium text-slate-800">{calendar?.timezone ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-500">
                <Gauge className="size-3.5" /> Workdays
              </span>
              <span className="font-medium text-slate-800">Mon–Fri</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-500">
                <Timer className="size-3.5" /> Hours
              </span>
              <span className="font-medium text-slate-800">
                09:00–18:00 ({calendar ? calendar.endMinute - calendar.startMinute : 0}m)
              </span>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-slate-500">
                <CalendarDays className="size-3.5" /> Holidays ({calendar?.holidays.length ?? 0})
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {calendar?.holidays.map((holiday) => (
                  <span
                    key={holiday.id}
                    className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600"
                    title={holiday.name}
                  >
                    {formatDate(holiday.date)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <section className="card mt-5 overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Open tickets by deadline</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Remaining time is calculated in business minutes, excluding weekends and holidays
            </p>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] text-amber-600">
            <TriangleAlert className="size-3.5" /> {atRisk} at risk
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-slate-50/70">
              <tr>
                <th className="table-head">Ticket</th>
                <th className="table-head">Queue</th>
                <th className="table-head">Priority</th>
                <th className="table-head">Status</th>
                <th className="table-head">SLA state</th>
                <th className="table-head">Resolution due</th>
                <th className="table-head">Remaining</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {openTickets.map((ticket) => (
                <tr key={ticket.id} className="transition hover:bg-slate-50/70">
                  <td className="table-cell max-w-sm">
                    <Link href={`/tickets/${ticket.id}`} className="group block">
                      <span className="font-mono text-[10px] text-slate-400">{ticket.ticketNo}</span>
                      <span className="block truncate font-medium text-slate-800 group-hover:text-indigo-700">
                        {ticket.subject}
                      </span>
                    </Link>
                  </td>
                  <td className="table-cell whitespace-nowrap text-slate-600">{ticket.queue.name}</td>
                  <td className="table-cell">
                    <PriorityBadge priority={ticket.priority} />
                  </td>
                  <td className="table-cell">
                    <StatusBadge status={ticket.status} />
                  </td>
                  <td className="table-cell">
                    <SlaBadge state={ticket.sla?.state ?? "ON_TRACK"} />
                  </td>
                  <td className="table-cell whitespace-nowrap text-xs text-slate-500">
                    {formatDateTime(ticket.sla?.resolutionDueAt)}
                  </td>
                  <td className="table-cell whitespace-nowrap text-xs font-medium text-slate-600">
                    {remaining(ticket.sla?.resolutionDueAt, ticket.sla?.state ?? "ON_TRACK")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {openTickets.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-slate-500">
            No open tickets in your scope.
          </p>
        )}
      </section>

      <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
        SLA states shown for historical seeded tickets are snapshots recorded at seed time. New
        tickets created in the app evaluate state at creation. First-response, resolution and
        escalation thresholds are configurable demo values ({rules.map((rule) => `${rule.priority} ${rule.firstResponseMinutes}/${rule.resolutionMinutes}m`).join(", ")}).
      </p>
    </div>
  );
}
