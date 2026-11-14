import { Filter, History, Search } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { requireHrSession } from "@/lib/auth";
import { formatDateTime, humanizeStatus, normalizePage } from "@/lib/format";
import { listAuditEvents } from "@/lib/queries";

export const metadata: Metadata = { title: "Audit trail" };

type Params = { [key: string]: string | string[] | undefined };

function param(params: Params, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function buildQuery(params: Params, overrides: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const key of ["action", "entityType", "page"]) {
    const value = overrides[key] !== undefined ? overrides[key] : param(params, key);
    if (value) query.set(key, value);
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const session = await requireHrSession();
  const params = await searchParams;
  const filters = {
    action: param(params, "action"),
    entityType: param(params, "entityType"),
    page: normalizePage(param(params, "page")),
  };
  const data = await listAuditEvents(session, filters);

  return (
    <div>
      <PageHeader
        eyebrow="Compliance"
        title="Audit trail"
        description="Append-only record of every ticket and routing decision. The database rejects updates and deletes on audit rows."
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
            <History className="size-4 text-indigo-500" />
            {data.total.toLocaleString("en-IN")} events
          </span>
        }
      />

      <section className="card mb-5 p-4">
        <form method="get" className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div>
            <label htmlFor="action" className="sr-only">
              Action
            </label>
            <select id="action" name="action" defaultValue={filters.action ?? ""} className="select w-full">
              <option value="">All actions</option>
              {data.actions.map((action) => (
                <option key={action} value={action}>
                  {humanizeStatus(action)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="entityType" className="sr-only">
              Entity type
            </label>
            <select
              id="entityType"
              name="entityType"
              defaultValue={filters.entityType ?? ""}
              className="select w-full"
            >
              <option value="">All entity types</option>
              {data.entityTypes.map((entityType) => (
                <option key={entityType} value={entityType}>
                  {entityType}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-secondary flex-1">
              <Filter className="size-4" /> Apply
            </button>
            {(filters.action || filters.entityType) && (
              <Link href="/audit" className="btn-secondary">
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
            events · page {data.page} of {data.pages}
          </p>
          <p className="inline-flex items-center gap-1 text-[11px] text-slate-400">
            <Search className="size-3" /> HR agents do not see restricted-ticket events
          </p>
        </header>

        {data.rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No audit events match these filters"
              description="Try a different action or entity type."
              action={
                <Link href="/audit" className="btn-secondary">
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
                  <th className="table-head">When</th>
                  <th className="table-head">Action</th>
                  <th className="table-head">Actor</th>
                  <th className="table-head">Entity</th>
                  <th className="table-head">Request</th>
                  <th className="table-head">Payload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((event) => (
                  <tr key={event.id} className="align-top transition hover:bg-slate-50/70">
                    <td className="table-cell whitespace-nowrap text-xs text-slate-500">
                      {formatDateTime(event.createdAt)}
                    </td>
                    <td className="table-cell">
                      <Badge tone={event.action.includes("SENSITIVE") ? "restricted" : "info"}>
                        {humanizeStatus(event.action)}
                      </Badge>
                    </td>
                    <td className="table-cell whitespace-nowrap">
                      <span className="block text-xs text-slate-700">{event.actorType}</span>
                      <span className="font-mono text-[10px] text-slate-400">
                        {event.actorId?.slice(0, 8) ?? "system"}…
                      </span>
                    </td>
                    <td className="table-cell whitespace-nowrap">
                      <span className="block text-xs text-slate-700">{event.entityType}</span>
                      <Link
                        href={`/tickets/${event.entityId}`}
                        className="font-mono text-[10px] text-indigo-600 hover:underline"
                      >
                        {event.entityId.slice(0, 8)}…
                      </Link>
                    </td>
                    <td className="table-cell whitespace-nowrap font-mono text-[10px] text-slate-400">
                      {event.requestId ? `${event.requestId.slice(0, 8)}…` : "—"}
                    </td>
                    <td className="table-cell max-w-md">
                      <details>
                        <summary className="cursor-pointer text-[10px] font-medium text-indigo-600">
                          Before / after
                        </summary>
                        <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-slate-950 px-2.5 py-2 text-[10px] leading-relaxed text-slate-300">
                          {JSON.stringify(
                            { before: event.beforeJson, after: event.afterJson },
                            null,
                            2,
                          )}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3.5">
          <p className="text-[11px] text-slate-400">
            Newest first · {data.rows.length} shown
          </p>
          <div className="flex items-center gap-2">
            {data.page > 1 ? (
              <Link
                href={`/audit${buildQuery(params, { page: String(data.page - 1) })}`}
                className="btn-secondary"
              >
                Previous
              </Link>
            ) : (
              <span className="btn-secondary pointer-events-none opacity-40">Previous</span>
            )}
            {data.page < data.pages ? (
              <Link
                href={`/audit${buildQuery(params, { page: String(data.page + 1) })}`}
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
