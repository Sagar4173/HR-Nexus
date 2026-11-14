import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { Role } from "@/generated/prisma/enums";
import { prisma } from "./db";
import { HR_ROLES } from "./access";

export { HR_ROLES };

export const SESSION_COOKIE = "hrnexus_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

export type Session = {
  employeeId: string;
  employeeNo: string;
  name: string;
  role: Role;
  exp: number;
};

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 16) {
    throw new Error("SESSION_SECRET must be set to at least 16 characters.");
  }
  return value;
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export function createSessionToken(
  session: Omit<Session, "exp">,
): { token: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const payload: Session = { ...session, exp: Math.floor(expiresAt.getTime() / 1000) };
  const body = base64url(JSON.stringify(payload));
  return { token: `${body}.${sign(body)}`, expiresAt };
}

export function verifySessionToken(token: string | undefined): Session | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Session;
    if (!payload.employeeId || !payload.role) return null;
    if (payload.exp * 1000 <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: session.employeeId },
      select: { employeeNo: true, firstName: true, lastName: true, role: true, status: true },
    });
    if (!employee || employee.status !== "ACTIVE") return null;
    return {
      ...session,
      employeeNo: employee.employeeNo,
      name: `${employee.firstName} ${employee.lastName}`,
      role: employee.role,
    };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireHrSession(): Promise<Session> {
  const session = await requireSession();
  if (!HR_ROLES.includes(session.role)) redirect("/");
  return session;
}

export function canViewRestricted(role: Role): boolean {
  return role === "ER_SPECIALIST" || role === "HR_ADMIN" || role === "AUDITOR";
}

export function isReadOnly(role: Role): boolean {
  return role === "AUDITOR";
}

export function cookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}
