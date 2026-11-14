"use server";

import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { createAskTicket } from "@/lib/tickets";

function isRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function askAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const question = String(formData.get("question") ?? "").trim();

  if (question.length < 8) {
    redirect(`/ask?error=${encodeURIComponent("Please add a little more detail (at least 8 characters).")}`);
  }
  if (question.length > 4000) {
    redirect(`/ask?error=${encodeURIComponent("Questions are limited to 4,000 characters.")}`);
  }

  try {
    const result = await createAskTicket({ requesterId: session.employeeId, question });
    redirect(`/tickets/${result.ticketId}?created=1`);
  } catch (error) {
    if (isRedirect(error)) throw error;
    const message = error instanceof Error ? error.message : "The ticket could not be created.";
    redirect(`/ask?error=${encodeURIComponent(message)}`);
  }
}
