import { ArrowRight, Database, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import type { Metadata } from "next";

import type { Role } from "@/generated/prisma/enums";
import { loginAction } from "@/app/actions/auth";
import { PortalBrand } from "@/components/portal-nav";
import { ROLE_LABELS, RoleBadge } from "@/components/role-badge";
import { listDemoAccounts } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in",
};

const DEMO_ROLES: Array<{
  role: Role;
  blurb: string;
  tone: string;
}> = [
  {
    role: "EMPLOYEE",
    blurb: "Raises questions, sees only their own tickets.",
    tone: "from-slate-500 to-slate-700",
  },
  {
    role: "HR_AGENT",
    blurb: "Works standard queues. Restricted cases are hidden.",
    tone: "from-sky-500 to-sky-700",
  },
  {
    role: "ER_SPECIALIST",
    blurb: "Handles confidential Employee Relations cases.",
    tone: "from-purple-500 to-purple-700",
  },
  {
    role: "HR_ADMIN",
    blurb: "Full queue access, assignment and compliance view.",
    tone: "from-indigo-500 to-indigo-700",
  },
  {
    role: "AUDITOR",
    blurb: "Read-only access to every record and audit event.",
    tone: "from-emerald-500 to-emerald-700",
  },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const employees = await listDemoAccounts(DEMO_ROLES.map(({ role }) => role));
  const demoAccounts = DEMO_ROLES.map((entry, index) => ({ ...entry, employee: employees[index] }));

  return (
    <div className="min-h-screen bg-slate-950 lg:grid lg:grid-cols-[1.05fr_1fr]">
      <section className="relative flex flex-col justify-between overflow-hidden bg-slate-950 px-6 py-10 text-white sm:px-12 lg:px-14 lg:py-14">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -left-24 size-[28rem] rounded-full bg-indigo-600/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute right-0 bottom-0 size-[24rem] rounded-full bg-sky-500/15 blur-3xl"
        />

        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-500 shadow-lg shadow-indigo-500/30">
              <ShieldCheck className="size-5.5" />
            </span>
            <div>
              <p className="text-sm font-semibold tracking-tight">HR Nexus</p>
              <p className="text-xs text-slate-400">Policy-aware people operations</p>
            </div>
          </div>

          <h1 className="mt-14 max-w-lg text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
            The right HR answer, from the{" "}
            <span className="bg-gradient-to-r from-indigo-300 to-sky-300 bg-clip-text text-transparent">
              right policy version
            </span>
            .
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-400">
            HR Nexus classifies every question, resolves the policy that applied on that
            date, validates each citation, routes sensitive cases to a restricted queue and
            tracks SLA clocks in Asia/Kolkata business hours.
          </p>

          <dl className="mt-10 grid max-w-md grid-cols-2 gap-4">
            {[
              ["5,000", "synthetic tickets"],
              ["150", "policy articles"],
              ["60/60", "golden cases passing"],
              ["99.1%", "citation validity"],
            ].map(([value, label]) => (
              <div
                key={label}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur"
              >
                <dt className="text-xl font-semibold text-white">{value}</dt>
                <dd className="mt-0.5 text-[11px] tracking-wide text-slate-400 uppercase">
                  {label}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <ul className="relative mt-12 grid max-w-lg gap-3 text-xs text-slate-300 sm:grid-cols-2">
          <li className="flex items-start gap-2">
            <LockKeyhole className="mt-0.5 size-3.5 shrink-0 text-indigo-300" />
            HMAC-signed sessions with role-based access control.
          </li>
          <li className="flex items-start gap-2">
            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-indigo-300" />
            Deterministic extractive answers with verbatim citations.
          </li>
          <li className="flex items-start gap-2">
            <Database className="mt-0.5 size-3.5 shrink-0 text-indigo-300" />
            Neon PostgreSQL: policies, tickets, SLA and audit trail.
          </li>
          <li className="flex items-start gap-2">
            <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-indigo-300" />
            Pick a demo identity to explore each permission boundary.
          </li>
        </ul>
      </section>

      <section className="flex items-center justify-center bg-slate-50 px-4 py-10 sm:px-8">
        <div className="w-full max-w-xl">
          <div className="lg:hidden">
            <PortalBrand />
          </div>
          <div className="mt-6 lg:mt-0">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">
              Sign in to the workspace
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Demo authentication — choose one of the seeded identities below.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700"
            >
              {error}
            </div>
          )}

          <div className="mt-5 space-y-2.5">
            {demoAccounts.map(({ role, blurb, tone, employee }) => (
              <form key={role} action={loginAction}>
                <input type="hidden" name="identifier" value={employee?.employeeNo ?? ""} />
                <button
                  type="submit"
                  disabled={!employee}
                  className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span
                    className={`flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${tone} text-sm font-semibold text-white`}
                  >
                    {employee
                      ? `${employee.firstName[0] ?? ""}${employee.lastName[0] ?? ""}`
                      : "—"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        {employee
                          ? `${employee.firstName} ${employee.lastName}`
                          : ROLE_LABELS[role]}
                      </span>
                      <RoleBadge role={role} />
                      {employee && (
                        <span className="font-mono text-[11px] text-slate-400">
                          {employee.employeeNo}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      {blurb}
                      {employee?.queue ? ` · ${employee.queue.name}` : ""}
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500" />
                </button>
              </form>
            ))}
          </div>

          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Sign in by employee number
            </p>
            <form action={loginAction} className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                name="identifier"
                required
                placeholder="e.g. EMP-0001 or name@hrnexus.example"
                className="input flex-1"
                autoComplete="username"
              />
              <button type="submit" className="btn-primary sm:w-auto">
                Sign in
              </button>
            </form>
            <p className="mt-2 text-[11px] text-slate-400">
              Seeded accounts only. Sessions expire after 12 hours.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
