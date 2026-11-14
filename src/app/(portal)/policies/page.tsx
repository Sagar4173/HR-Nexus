import { BookOpen, Layers, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

import { Badge, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { isVersionEffectiveOn } from "@/lib/policy-dates";
import { listPolicies } from "@/lib/queries";

export const metadata: Metadata = { title: "Policy library" };

function currentVersion(
  versions: Array<{
    versionLabel: string;
    status: string;
    effectiveFrom: Date;
    effectiveTo: Date | null;
  }>,
  now: Date,
) {
  return versions.find((version) => isVersionEffectiveOn(version, now));
}

export default async function PoliciesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const documents = await listPolicies(q);
  const now = new Date();
  const totalVersions = documents.reduce((sum, document) => sum + document.versions.length, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Knowledge base"
        title="Policy library"
        description="150 policy articles, each with one or more dated versions and audience rules. The resolver only cites versions effective on the answer date and applicable to the employee."
        actions={
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
            <Layers className="size-4 text-indigo-500" />
            {documents.length} articles · {totalVersions} versions
          </div>
        }
      />

      <section className="card mb-5 p-4">
        <form method="get" className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search by title or document code"
              className="input pl-9"
              aria-label="Search policies"
            />
          </div>
          <button type="submit" className="btn-secondary">
            Search
          </button>
          {q && (
            <Link href="/policies" className="btn-secondary">
              Clear
            </Link>
          )}
        </form>
      </section>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-slate-50/70">
              <tr>
                <th className="table-head">Document</th>
                <th className="table-head">Category</th>
                <th className="table-head">Currently effective</th>
                <th className="table-head">Versions</th>
                <th className="table-head">Effective since</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {documents.map((document) => {
                const active = currentVersion(document.versions, now);
                return (
                  <tr key={document.id} className="transition hover:bg-slate-50/70">
                    <td className="table-cell">
                      <Link href={`/policies/${document.id}`} className="group block max-w-lg">
                        <span className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
                          {document.code}
                          {document.versions.length > 1 && (
                            <Badge tone="info">{document.versions.length} versions</Badge>
                          )}
                        </span>
                        <span className="mt-0.5 block font-medium text-slate-800 group-hover:text-indigo-700">
                          {document.title}
                        </span>
                      </Link>
                    </td>
                    <td className="table-cell whitespace-nowrap text-slate-600">
                      {document.category.name}
                    </td>
                    <td className="table-cell whitespace-nowrap">
                      {active ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Badge tone="success">{active.versionLabel}</Badge>
                          <span className="text-[11px] text-slate-400">
                            {active.effectiveTo ? `until ${formatDate(active.effectiveTo)}` : "open-ended"}
                          </span>
                        </span>
                      ) : (
                        <Badge tone="warning">No active version</Badge>
                      )}
                    </td>
                    <td className="table-cell tabular-nums text-slate-600">
                      {document.versions.length}
                    </td>
                    <td className="table-cell whitespace-nowrap text-xs text-slate-500">
                      {active ? formatDate(active.effectiveFrom) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {documents.length === 0 && (
          <div className="px-5 py-14 text-center">
            <BookOpen className="mx-auto size-7 text-slate-300" />
            <p className="mt-2 text-sm font-medium text-slate-700">No policies match “{q}”</p>
            <Link href="/policies" className="mt-2 inline-block text-xs font-medium text-indigo-600">
              Clear the search
            </Link>
          </div>
        )}
      </section>

      <div className="mt-5 flex items-start gap-2 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-[11px] leading-relaxed text-indigo-900">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        <span>
          Version selection is deterministic: eligible versions must be effective on the answer
          date and match the employee&apos;s audience rules. The lowest document code wins, and the
          effective version of that document is cited.
        </span>
      </div>
    </div>
  );
}
