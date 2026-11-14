/**
 * Read/write smoke test for the application services against Neon.
 *
 * Usage:
 *   node --env-file=.env.local --import tsx scripts/smoke-services.ts
 */
import { prisma } from "../src/lib/db";
import type { Session } from "../src/lib/auth";
import { createAskTicket } from "../src/lib/tickets";
import {
  getDashboard,
  getSlaOverview,
  getTicketDetail,
  listAuditEvents,
  listPolicies,
  listTickets,
} from "../src/lib/queries";

async function main(): Promise<void> {
  const [hrAdmin, employee] = await Promise.all([
    prisma.employee.findFirst({ where: { role: "HR_ADMIN" }, orderBy: { employeeNo: "asc" } }),
    prisma.employee.findFirst({ where: { role: "EMPLOYEE" }, orderBy: { employeeNo: "asc" } }),
  ]);
  if (!hrAdmin || !employee) throw new Error("Seed data is missing demo employees");

  const adminSession: Session = {
    employeeId: hrAdmin.id,
    employeeNo: hrAdmin.employeeNo,
    name: `${hrAdmin.firstName} ${hrAdmin.lastName}`,
    role: "HR_ADMIN",
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const employeeSession: Session = {
    employeeId: employee.id,
    employeeNo: employee.employeeNo,
    name: `${employee.firstName} ${employee.lastName}`,
    role: "EMPLOYEE",
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  const dashboard = await getDashboard(adminSession);
  const employeeDashboard = await getDashboard(employeeSession);
  const tickets = await listTickets(adminSession, { page: 1 });
  const firstTicket = tickets.rows[0];
  const detail = firstTicket ? await getTicketDetail(firstTicket.id, adminSession) : null;
  const policies = await listPolicies("leave");
  const sla = await getSlaOverview(adminSession);
  const audit = await listAuditEvents(adminSession, { page: 1 });

  const answered = await createAskTicket({
    requesterId: employee.id,
    question: "How many annual leave days am I entitled to, and can I carry unused days over?",
  });
  const sensitive = await createAskTicket({
    requesterId: employee.id,
    question: "I need to report harassment and retaliation by my manager. Please keep this confidential.",
  });

  const answeredDetail = await getTicketDetail(answered.ticketId, employeeSession);

  console.log(
    JSON.stringify(
      {
        dashboard: dashboard.totals,
        employeeDashboard: employeeDashboard.totals,
        ticketCount: tickets.total,
        detailMessages: detail?.ticket.messages.length ?? 0,
        policies: policies.length,
        slaStates: sla.counts,
        auditRows: audit.total,
        answered: {
          ticketNo: answered.ticketNo,
          status: answered.status,
          queue: answered.queue.slug,
          citations: answered.citations.length,
          validated: answered.citations.every((citation) => citation.validated),
          policyVersion: answered.policyVersionId,
          detailMessages: answeredDetail?.ticket.messages.length ?? 0,
        },
        sensitive: {
          ticketNo: sensitive.ticketNo,
          status: sensitive.status,
          queue: sensitive.queue.slug,
          priority: sensitive.priority,
          sensitivity: sensitive.sensitivity,
          citations: sensitive.citations.length,
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
