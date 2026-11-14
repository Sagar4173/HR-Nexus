import { formatInTimeZone } from "date-fns-tz";

import type { Priority } from "@/generated/prisma/enums";

import { prisma } from "./db";
import { parseWorkdays, type BusinessCalendar } from "./sla";

export type SlaConfiguration = {
  rule: {
    id: string;
    code: string;
    priority: Priority;
    firstResponseMinutes: number;
    resolutionMinutes: number;
    escalationPct: number;
    pauseOnWaitingEmployee: boolean;
  };
  calendar: {
    id: string;
    code: string;
    name: string;
    timezone: string;
    description: string | null;
  };
  business: BusinessCalendar;
};

async function loadCalendar(calendarId: string): Promise<SlaConfiguration["calendar"] & { business: BusinessCalendar }> {
  const calendar = await prisma.slaCalendar.findUnique({ where: { id: calendarId } });
  if (!calendar) throw new Error("SLA calendar is not configured");
  const holidays = await prisma.businessHoliday.findMany({
    where: { calendarId },
    select: { date: true },
  });
  return {
    id: calendar.id,
    code: calendar.code,
    name: calendar.name,
    timezone: calendar.timezone,
    description: null,
    business: {
      timeZone: calendar.timezone,
      workdays: parseWorkdays(calendar.workdays),
      startMinute: calendar.startMinute,
      endMinute: calendar.endMinute,
      holidays: new Set(
        holidays.map((holiday) => formatInTimeZone(holiday.date, calendar.timezone, "yyyy-MM-dd")),
      ),
    },
  };
}

export async function loadSlaConfiguration(priority: Priority): Promise<SlaConfiguration> {
  const rule = await prisma.slaRule.findFirst({ where: { priority } });
  if (!rule) throw new Error(`No SLA rule is configured for ${priority}`);
  const calendar = await prisma.slaCalendar.findFirst({ where: { code: "INDIA-IST" } });
  if (!calendar) throw new Error("The INDIA-IST SLA calendar is not configured");
  const resolved = await loadCalendar(calendar.id);
  return {
    rule: {
      id: rule.id,
      code: rule.code,
      priority: rule.priority,
      firstResponseMinutes: rule.firstResponseMinutes,
      resolutionMinutes: rule.resolutionMinutes,
      escalationPct: rule.escalationPct,
      pauseOnWaitingEmployee: rule.pauseOnWaitingEmployee,
    },
    calendar: {
      id: resolved.id,
      code: resolved.code,
      name: resolved.name,
      timezone: resolved.timezone,
      description: resolved.description,
    },
    business: resolved.business,
  };
}

export async function loadSlaConfigurationForTicket(
  ruleId: string,
  calendarId: string,
): Promise<SlaConfiguration> {
  const [rule, calendar] = await Promise.all([
    prisma.slaRule.findUnique({ where: { id: ruleId } }),
    loadCalendar(calendarId),
  ]);
  if (!rule) throw new Error("SLA rule not found");
  return {
    rule: {
      id: rule.id,
      code: rule.code,
      priority: rule.priority,
      firstResponseMinutes: rule.firstResponseMinutes,
      resolutionMinutes: rule.resolutionMinutes,
      escalationPct: rule.escalationPct,
      pauseOnWaitingEmployee: rule.pauseOnWaitingEmployee,
    },
    calendar: {
      id: calendar.id,
      code: calendar.code,
      name: calendar.name,
      timezone: calendar.timezone,
      description: calendar.description,
    },
    business: calendar.business,
  };
}
