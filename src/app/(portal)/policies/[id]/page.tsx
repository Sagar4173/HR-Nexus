import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Building2,
  CalendarRange,
  FileText,
  Quote,
  Users,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { Badge, Card, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { isVersionEffectiveOn } from "@/lib/policy-dates";
import { getPolicyDetail } from "@/lib/queries";

export const metadata: Metadata = { title: "Policy" };

const STATUS_TONE: Record<string, "success" | "warning" | "neutral"> = {
  ACTIVE: "success",
  DRAFT: "warning",
  RETIRED: "neutral",
};

export default async function PolicyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const document = await getPolicyDetail(id);
  if (!document) notFound();

  const now = new Date();
  const active = document.versions.find((version) => isVersionEffectiveOn(version, now));

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/policies"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-800"
        >
          <ArrowLeft className="size-3.5" /> Back to the policy library
        </Link>
      </div>

      <PageHeader
        eyebrow={document.code}
        title={document.title}
        description={document.summary ?? "No summary recorded for this policy."}
        actions={
          <>
            <Badge tone="info">{document.category.name}</Badge>
            {active ? (
              <Badge tone="success">
                <BadgeCheck className="size-3" /> Current: {active.versionLabel}
              </Badge>
            ) : (
              <Badge tone="warning">
                <AlertTriangle className="size-3" /> No currently effective version
              </Badge>
            )}
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          {document.versions.map((version) => {
            const isCurrent = active?.id === version.id;
            return (
              <Card
                key={version.id}
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    Version {version.versionLabel}
                    <Badge tone={STATUS_TONE[version.status] ?? "neutral"}>{version.status}</Badge>
                    {isCurrent && <Badge tone="purple">Currently effective</Badge>}
                  </span>
                }
                description={`Effective ${formatDate(version.effectiveFrom)} → ${version.effectiveTo ? formatDate(version.effectiveTo) : "open-ended"} · ${version._count.chunks} sections · ${version._count.citations} citations`}
              >
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold tracking-[0.12em] text-slate-400 uppercase">
                    Audience rules
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {version.audienceRules.map((rule) => (
                      <span
                        key={rule.id}
                        className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
                      >
                        <Users className="size-3" />
                        {rule.dimension === "ALL"
                          ? "All employees"
                          : `${rule.dimension.replaceAll("_", " ").toLowerCase()}: ${rule.value}`}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {version.chunks.map((chunk) => (
                    <details
                      key={chunk.id}
                      className="group rounded-lg border border-slate-200 bg-slate-50/60 px-3.5 py-2.5"
                    >
                      <summary className="cursor-pointer text-xs font-semibold text-slate-700 marker:text-slate-400">
                        {chunk.ordinal + 1}. {chunk.heading}
                      </summary>
                      <p className="mt-2 text-xs leading-relaxed whitespace-pre-line text-slate-600">
                        {chunk.content}
                      </p>
                    </details>
                  ))}
                </div>

                <details className="mt-4">
                  <summary className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-indigo-600">
                    <FileText className="size-3.5" /> View full policy text
                  </summary>
                  <div className="mt-2 max-h-96 overflow-auto rounded-lg border border-slate-200 bg-white p-4">
                    <pre className="text-xs leading-relaxed whitespace-pre-wrap text-slate-600">
                      {version.contentMd}
                    </pre>
                  </div>
                </details>
              </Card>
            );
          })}
        </div>

        <div className="space-y-5">
          <Card title="Document metadata">
            <dl className="divide-y divide-slate-100 text-xs">
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="flex items-center gap-1.5 text-slate-500">
                  <Building2 className="size-3.5" /> Owner
                </dt>
                <dd className="text-right font-medium text-slate-800">
                  {document.ownerDepartment?.name ?? "Unassigned"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="flex items-center gap-1.5 text-slate-500">
                  <CalendarRange className="size-3.5" /> Versions
                </dt>
                <dd className="text-right font-medium text-slate-800">{document.versions.length}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="flex items-center gap-1.5 text-slate-500">
                  <Quote className="size-3.5" /> Total citations
                </dt>
                <dd className="text-right font-medium text-slate-800">
                  {document.versions.reduce((sum, version) => sum + version._count.citations, 0)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="flex items-center gap-1.5 text-slate-500">
                  <FileText className="size-3.5" /> Category
                </dt>
                <dd className="text-right font-medium text-slate-800">{document.category.name}</dd>
              </div>
            </dl>
          </Card>

          <Card title="How this document is used">
            <ol className="space-y-3 text-[11px] leading-relaxed text-slate-600">
              <li>
                <span className="font-semibold text-slate-800">1. Eligibility.</span> A version is
                eligible only when it is effective on the question date and at least one audience
                rule matches the employee&apos;s department, country, employment type or grade.
              </li>
              <li>
                <span className="font-semibold text-slate-800">2. Deterministic choice.</span> If
                several documents cover the same category, the lowest document code wins.
              </li>
              <li>
                <span className="font-semibold text-slate-800">3. Grounded answer.</span> The
                entitlement or rules section is quoted verbatim, and the citation is validated
                against the chunk, version and audience before display.
              </li>
            </ol>
          </Card>

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] leading-relaxed text-amber-900">
            <AlertTriangle className="mb-1 size-4" />
            Historic versions are retained for audit. Answers always cite the version applicable on
            the question date, never automatically the newest text.
          </div>
        </div>
      </div>
    </div>
  );
}
