import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { createAskTicket } from "@/lib/tickets";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  question: z.string().trim().min(8, "At least 8 characters are required").max(4000),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues.map((issue) => issue.message) },
      { status: 422 },
    );
  }

  try {
    const result = await createAskTicket({
      requesterId: session.employeeId,
      question: parsed.data.question,
    });
    return NextResponse.json(result, {
      status: 201,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Inactive employees cannot raise tickets") {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (message === "Requester not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.startsWith("Please provide") || message.startsWith("Question is too long")) {
      return NextResponse.json({ error: message }, { status: 422 });
    }
    console.error("Ticket creation failed", error);
    return NextResponse.json({ error: "Ticket creation failed" }, { status: 500 });
  }
}
