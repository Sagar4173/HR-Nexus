"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { Priority } from "@/generated/prisma/enums";
import { HR_ROLES, isReadOnly, requireSession } from "@/lib/auth";
import { applyTicketAction, type Actor, type TicketAction } from "@/lib/tickets";

async function actor(): Promise<Actor> {
  const session = await requireSession();
  if (!HR_ROLES.includes(session.role)) throw new Error("Only HR staff can update tickets");
  if (isReadOnly(session.role)) throw new Error("Auditors have read-only access");
  return { employeeId: session.employeeId, role: session.role, name: session.name };
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function finish(ticketId: string, error: string | null, message: string): never {
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  revalidatePath("/");
  const query = error ? `?error=${encodeURIComponent(error)}` : `?updated=${encodeURIComponent(message)}`;
  redirect(`/tickets/${ticketId}${query}`);
}

async function run(ticketId: string, action: TicketAction, message: string): Promise<never> {
  let error: string | null = null;
  try {
    const current = await actor();
    await applyTicketAction(ticketId, current, action);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "The ticket could not be updated.";
  }
  finish(ticketId, error, message);
}

export async function assignAction(formData: FormData): Promise<void> {
  const ticketId = text(formData, "ticketId");
  const assigneeId = text(formData, "assigneeId");
  if (!ticketId || !assigneeId) finish(ticketId, "Choose an assignee first.", "Assigned");
  await run(ticketId, { type: "assign", assigneeId }, "Assigned");
}

export async function transitionAction(formData: FormData): Promise<void> {
  const ticketId = text(formData, "ticketId");
  const type = text(formData, "type");
  if (type === "start") await run(ticketId, { type: "start" }, "Ticket started");
  if (type === "wait_employee") await run(ticketId, { type: "wait_employee" }, "Waiting on employee");
  if (type === "wait_hr") await run(ticketId, { type: "wait_hr" }, "Waiting on HR");
  if (type === "close") await run(ticketId, { type: "close" }, "Ticket closed");
  finish(ticketId, "Unsupported transition.", "Updated");
}

export async function resolveAction(formData: FormData): Promise<void> {
  const ticketId = text(formData, "ticketId");
  const summary = text(formData, "summary");
  if (summary.length < 5) finish(ticketId, "Add a short resolution summary.", "Resolved");
  await run(ticketId, { type: "resolve", summary }, "Ticket resolved");
}

export async function escalateAction(formData: FormData): Promise<void> {
  const ticketId = text(formData, "ticketId");
  const reason = text(formData, "reason");
  if (reason.length < 5) finish(ticketId, "Add an escalation reason.", "Escalated");
  await run(ticketId, { type: "escalate", reason }, "Ticket escalated");
}

const PRIORITIES: Priority[] = ["P1", "P2", "P3", "P4"];

export async function priorityAction(formData: FormData): Promise<void> {
  const ticketId = text(formData, "ticketId");
  const value = text(formData, "priority");
  if (!PRIORITIES.includes(value as Priority)) finish(ticketId, "Unknown priority.", "Priority updated");
  await run(ticketId, { type: "priority", priority: value as Priority }, "Priority updated");
}
