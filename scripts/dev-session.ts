/**
 * Mint a demo session token for HTTP smoke tests and API exploration.
 *
 * Usage:
 *   node --env-file=.env.local --import tsx scripts/dev-session.ts EMP-0001
 *   node --env-file=.env.local --import tsx scripts/dev-session.ts HR_ADMIN
 *
 * Prints the cookie value only; send it as:
 *   Cookie: hrnexus_session=<token>
 */
import type { Role } from "../src/generated/prisma/enums";
import { prisma } from "../src/lib/db";
import { SESSION_COOKIE, createSessionToken } from "../src/lib/auth";

const ROLES: Role[] = ["EMPLOYEE", "HR_AGENT", "ER_SPECIALIST", "HR_ADMIN", "AUDITOR"];

async function main(): Promise<void> {
  const argument = (process.argv[2] ?? "EMP-0001").toUpperCase();
  const employee = ROLES.includes(argument as Role)
    ? await prisma.employee.findFirst({
        where: { role: argument as Role, status: "ACTIVE" },
        orderBy: { employeeNo: "asc" },
      })
    : await prisma.employee.findUnique({ where: { employeeNo: argument } });
  if (!employee) throw new Error(`No employee matches ${argument}`);
  const { token } = createSessionToken({
    employeeId: employee.id,
    employeeNo: employee.employeeNo,
    name: `${employee.firstName} ${employee.lastName}`,
    role: employee.role,
  });
  console.log(`${SESSION_COOKIE}=${token}`);
  console.error(
    `${employee.employeeNo} · ${employee.firstName} ${employee.lastName} · ${employee.role}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
