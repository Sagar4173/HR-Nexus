"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE, cookieOptions, createSessionToken } from "@/lib/auth";
import { prisma } from "@/lib/db";

function safeMessage(message: string): string {
  return encodeURIComponent(message.slice(0, 180));
}

export async function loginAction(formData: FormData): Promise<void> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  if (!identifier) {
    redirect(`/login?error=${safeMessage("Choose a demo account or enter your employee number.")}`);
  }

  const employee = await prisma.employee.findFirst({
    where: {
      status: "ACTIVE",
      OR: [
        { employeeNo: identifier.toUpperCase() },
        { email: identifier.toLowerCase() },
      ],
    },
  });

  if (!employee) {
    redirect(`/login?error=${safeMessage(`No active employee matches “${identifier}”.`)}`);
  }

  const { token, expiresAt } = createSessionToken({
    employeeId: employee.id,
    employeeNo: employee.employeeNo,
    name: `${employee.firstName} ${employee.lastName}`,
    role: employee.role,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions(expiresAt));
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
