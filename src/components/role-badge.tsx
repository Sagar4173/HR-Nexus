import type { Role } from "@/generated/prisma/enums";
import { cn } from "@/lib/cn";

const ROLE_STYLES: Record<Role, string> = {
  EMPLOYEE: "bg-slate-100 text-slate-700 ring-slate-200",
  HR_AGENT: "bg-sky-50 text-sky-700 ring-sky-200",
  ER_SPECIALIST: "bg-purple-50 text-purple-700 ring-purple-200",
  HR_ADMIN: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  AUDITOR: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

export const ROLE_LABELS: Record<Role, string> = {
  EMPLOYEE: "Employee",
  HR_AGENT: "HR Agent",
  ER_SPECIALIST: "ER Specialist",
  HR_ADMIN: "HR Admin",
  AUDITOR: "Auditor",
};

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        ROLE_STYLES[role],
        className,
      )}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}
