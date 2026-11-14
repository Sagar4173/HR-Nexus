"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Inbox,
  LayoutDashboard,
  MessageSquarePlus,
  ScrollText,
  ShieldCheck,
  Timer,
  Users,
} from "lucide-react";

import type { Role } from "@/generated/prisma/enums";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, roles: "all" },
  { href: "/ask", label: "Ask HR", icon: MessageSquarePlus, roles: "all" },
  { href: "/tickets", label: "Tickets", icon: Inbox, roles: "all" },
  { href: "/policies", label: "Policies", icon: BookOpen, roles: "all" },
  { href: "/sla", label: "SLA monitor", icon: Timer, roles: "hr" },
  { href: "/audit", label: "Audit trail", icon: ScrollText, roles: "hr" },
] as const;

const HR_ROLES: Role[] = ["HR_AGENT", "ER_SPECIALIST", "HR_ADMIN", "AUDITOR"];

export function PortalNav({
  role,
  orientation = "vertical",
}: {
  role: Role;
  orientation?: "vertical" | "horizontal";
}) {
  const pathname = usePathname();
  const items = ITEMS.filter((item) =>
    item.roles === "all" ? true : HR_ROLES.includes(role),
  );

  return (
    <nav
      aria-label="Primary"
      className={cn(
        orientation === "vertical"
          ? "flex flex-col gap-1"
          : "flex items-center gap-1 overflow-x-auto pb-1",
      )}
    >
      {items.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition",
              orientation === "horizontal" && "px-2.5 py-1.5 text-[13px]",
              active
                ? "bg-indigo-50 text-indigo-700"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
            )}
          >
            <Icon className={cn("size-4", active ? "text-indigo-600" : "text-slate-400")} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function PortalBrand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="flex size-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
        <ShieldCheck className="size-5" />
      </span>
      <span className={cn("leading-tight", compact && "hidden sm:block")}>
        <span className="block text-sm font-semibold tracking-tight text-slate-900">
          HR Nexus
        </span>
        <span className="block text-[11px] text-slate-500">Policy-aware people ops</span>
      </span>
    </Link>
  );
}

export function TeamBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
      <Users className="size-3.5" /> {count} people
    </span>
  );
}
