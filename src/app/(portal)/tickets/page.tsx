import { Filter, Inbox, MessageSquarePlus, Search } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

import {
  EmptyState,
  PageHeader,
  PriorityBadge,
  SlaBadge,
  StatusBadge,
} from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { normalizePage, truncate } from "@/lib/format";
import { listQueues, listTickets, PRIORITIES, TICKET_STATUSES } from "@/lib/queries";

export const metadata: Metadata = { title: "Tickets" };

type Params = { [key: string]: string | string[] | undefined };

function param(params: Params, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function buildQuery(params: Params, overrides: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const key of ["q", "status", "priority", "queue", "sensitivity", "page"]) {
    const value = overrides[key] !== undefined ? overrides[key] : param(params, key);
    if (value) query.set(key, value);
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const filters = {
    q: param(params, "q"),
    status: param(params, "status"),
    priority: param(params, "priority"),
    queue: param(params, "queue"),
    sensitivity: param(params, "sensitivity"),
    page: normalizePage(param(params, "page")),
  };

  const [data, queues] = await Promise.all([listTickets(session, filters), listQueues()]);
  const activeFilterCount = [
    filters.q,
    filters.status,
    filters.priority,
    filters.queue,
    filters.sensitivity,
  ].filter(Boolean).length;

  return (
    <div>
      <PageHeader
        eyebrow={session.role === "EMPLOYEE" ? "My requests" : "Queue workspace"}
        title="Tickets"
        description={
          session.role === "EMPLOYEE"
            ? "Every question you raise, with its status, routing and SLA commitments."
            : "Search, filter and open tickets. Restricted cases are only visible to authorised roles."
        }
        actions={
          <Link href="/ask" className="btn-primary">
            <MessageSquarePlus className="size-4" /> Ask HR
          </Link>
        }
      />

      <section className="card mb-5 p-4">
        <form method="get" className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={filters.q ?? ""}
              placeholder="Search ticket number, subject or requester"
              className="input pl-9"
              aria-label="Search tickets"
            />
          </div>
          <select name="status" defaultValue={filters.status ?? ""} className="select" aria-label="Status">
            <option value="">All statuses</option>
            {TICKET_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          <select name="priority" defaultValue={filters.priority ?? ""} className="select" aria-label="Priority">
            <option value="">All priorities</option>
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
          <select name="queue" defaultValue={filters.queue ?? ""} className="select" aria-label="Queue">
            <option value="">All queues</option>
            {queues.map((queue) => (
              <option key={queue.id} value={queue.slug}>
                {queue.name}
              </option>
            ))}
          </select>
          <select
            name="sensitivity"
            defaultValue={filters.sensitivity ?? ""}
            className="select"
            aria-label="Sensitivity"
          >
            <option value="">Any sensitivity</option>
            <option value="sensitive">Restricted only</option>
            <option value="standard">Standard only</option>
          </select>
          <div className="flex gap-2">
            <button type="submit" className="btn-secondary flex-1 lg:flex-none">
              <Filter className="size-4" /> Apply
            </button>
            {activeFilterCount > 0 && (
              <Link href="/tickets" className="btn-secondary">
                Reset
              </Link>
            )}
          </div>
        </form>
      </section>

      <section className="card overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
          <p className="text-xs text-slate-500">
            <span className="font-semibold text-slate-800">{data.total.toLocaleString("en-IN")}</span>{" "}
            tickets · page {data.page} of {data.pages}
          </p>
          <p className="text-[11px] text-slate-400">Ordered by most recent activity</p>
        </header>

        {data.rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Inbox className="size-7" />}
              title="No tickets match these filters"
              description="Try clearing the filters, or raise a new question to create a ticket."
              action={
                <Link href="/tickets" className="btn-secondary">
                  Clear filters
                </Link>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate-50/70">
                <tr>
                  <th className="table-head">Ticket</th>
                  <th className="table-head">Requester</th>
                  <th className="table-head">Routing</th>
                  <th className="table-head">Priority</th>
                  <th className="table-head">Status</th>
                  <th className="table-head">SLA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((ticket) => (
                  <tr key={ticket.id} className="transition hover:bg-slate-50/70">
                    <td className="table-cell max-w-[26rem]">
                      <Link href={`/tickets/${ticket.id}`} className="group block">
                        <span className="flex items-center gap-1.5 font-mono text-[11px] text-slate-400">
                          {ticket.ticketNo}
                          {ticket.isSensitive && (
                            <span className="rounded-full bg-purple-50 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700 ring-1 ring-purple-200 ring-inset">
                              Restricted
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block truncate font-medium text-slate-800 group-hover:text-indigo-700">
                          {truncate(ticket.subject, 90)}
                        </span>
                      </Link>
                    </td>
                    <td className="table-cell whitespace-nowrap">
                      <span className="block text-slate-700">
                        {ticket.requester.firstName} {ticket.requester.lastName}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        {ticket.requester.employeeNo}
                      </span>
                    </td>
                    <td className="table-cell whitespace-nowrap">
                      <span className="block text-slate-700">{ticket.queue.name}</span>
                      <span className="text-[11px] text-slate-400">
                        {ticket.category?.name ?? "Unclassified"}
                      </span>
                    </td>
                    <td className="table-cell">
                      <PriorityBadge priority={ticket.priority} />
                    </td>
                    <td className="table-cell">
                      <StatusBadge status={ticket.status} />
                    </td>
                    <td className="table-cell">
                      <SlaBadge state={ticket.sla?.state ?? "ON_TRACK"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3.5">
          <p className="text-[11px] text-slate-400">
            Showing {data.rows.length} of {data.total.toLocaleString("en-IN")}
          </p>
          <div className="flex items-center gap-2">
            {data.page > 1 ? (
              <Link
                href={`/tickets${buildQuery(params, { page: String(data.page - 1) })}`}
                className="btn-secondary"
              >
                Previous
              </Link>
            ) : (
              <span className="btn-secondary pointer-events-none opacity-40">Previous</span>
            )}
            {data.page < data.pages ? (
              <Link
                href={`/tickets${buildQuery(params, { page: String(data.page + 1) })}`}
                className="btn-secondary"
              >
                Next
              </Link>
            ) : (
              <span className="btn-secondary pointer-events-none opacity-40">Next</span>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}
