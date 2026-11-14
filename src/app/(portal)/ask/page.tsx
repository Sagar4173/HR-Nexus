import { AlertCircle, ArrowRight, BadgeCheck, FileSearch, ShieldAlert, Sparkles } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

import { PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { getTeam } from "@/lib/queries";
import { AskForm } from "./ask-form";

export const metadata: Metadata = { title: "Ask HR" };

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireSession();
  const { error } = await searchParams;
  const profile = await getTeam(session);

  return (
    <div>
      <PageHeader
        eyebrow="Employee self-service"
        title="Ask a policy question"
        description="Every question becomes a ticket. Sensitive disclosures bypass the answer pipeline and route directly to the restricted Employee Relations queue."
      />

      {error && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <section className="card p-5 sm:p-6">
          <AskForm />
        </section>

        <div className="space-y-5">
          <section className="card">
            <header className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">Your policy context</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Applicability is resolved against these attributes
              </p>
            </header>
            <dl className="divide-y divide-slate-100 px-5 py-2 text-sm">
              {[
                ["Employee", profile ? `${profile.firstName} ${profile.lastName}` : session.name],
                ["Department", profile?.department.name ?? "—"],
                ["Location", profile?.locationCountry ?? "—"],
                ["Employment type", profile?.employmentType.replaceAll("_", " ").toLowerCase() ?? "—"],
                ["Grade", profile?.grade ?? "—"],
                ["Home queue", profile?.queue?.name ?? "—"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 py-2.5">
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="text-right text-xs font-medium text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="card">
            <header className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">What happens to your question</h2>
            </header>
            <ol className="space-y-4 p-5">
              {[
                {
                  icon: Sparkles,
                  title: "Classify",
                  body: "Keyword rules detect the policy category and screen for sensitive language.",
                },
                {
                  icon: FileSearch,
                  title: "Resolve the version",
                  body: "Only versions effective on today's date and applicable to your profile are eligible.",
                },
                {
                  icon: BadgeCheck,
                  title: "Answer with citations",
                  body: "A verbatim passage is extracted and validated. If nothing fits, a specialist is asked to review.",
                },
              ].map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    <step.icon className="size-3.5" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-slate-800">
                      {index + 1}. {step.title}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="border-t border-slate-100 px-5 py-4">
              <div className="flex items-start gap-2 rounded-lg bg-purple-50 px-3 py-2.5 text-[11px] leading-relaxed text-purple-800">
                <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Harassment, discrimination and misconduct disclosures are never answered by
                  automation. They are routed to ER specialists with a P1 SLA.
                </span>
              </div>
            </div>
          </section>

          <Link
            href="/policies"
            className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:border-indigo-300"
          >
            Browse the policy library
            <ArrowRight className="size-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-indigo-500" />
          </Link>
        </div>
      </div>
    </div>
  );
}
