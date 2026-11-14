import { LogOut } from "lucide-react";
import type { ReactNode } from "react";

import { logoutAction } from "@/app/actions/auth";
import { PortalBrand, PortalNav } from "@/components/portal-nav";
import { RoleBadge } from "@/components/role-badge";
import { requireSession } from "@/lib/auth";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();

  return (
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-slate-200 bg-white px-4 py-5 lg:flex">
        <PortalBrand />

        <div className="mt-7">
          <p className="px-3 text-[10px] font-semibold tracking-[0.16em] text-slate-400 uppercase">
            Workspace
          </p>
          <div className="mt-2">
            <PortalNav role={session.role} />
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-slate-400 uppercase">
            Demo assumptions
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
            SLA clocks use Asia/Kolkata business hours (Mon–Fri, 09:00–18:00) and pause while
            an employee response is pending. Calendar and thresholds are configurable demo
            values, not official policy.
          </p>
        </div>

        <div className="mt-auto border-t border-slate-100 pt-4">
          <div className="flex items-center gap-2.5 px-1">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
              {session.name
                .split(" ")
                .map((part) => part[0])
                .slice(0, 2)
                .join("")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{session.name}</p>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="truncate font-mono text-[10px] text-slate-400">
                  {session.employeeNo}
                </span>
                <RoleBadge role={session.role} className="text-[10px]" />
              </div>
            </div>
          </div>
          <form action={logoutAction} className="mt-3">
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
            >
              <LogOut className="size-3.5" /> Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <PortalBrand />
            <div className="flex items-center gap-2">
              <RoleBadge role={session.role} />
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Sign out"
                >
                  <LogOut className="size-4" />
                </button>
              </form>
            </div>
          </div>
          <div className="px-3 pb-2">
            <PortalNav role={session.role} orientation="horizontal" />
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>

        <footer className="border-t border-slate-200/70 px-4 py-5 text-center text-[11px] text-slate-400 sm:px-6 lg:px-8">
          HR Nexus · synthetic demo data · guidance is extracted from policy text and is not
          legal advice.
        </footer>
      </div>
    </div>
  );
}
