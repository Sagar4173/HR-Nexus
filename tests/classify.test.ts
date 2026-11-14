import { describe, expect, it } from "vitest";

import { classifyQuestion, sensitivityFor } from "@/lib/classify";

describe("classifyQuestion", () => {
  it("flags harassment disclosures as sensitive and routes to ER", () => {
    const result = classifyQuestion(
      "I need to report harassment and retaliation by my manager. Please keep this confidential.",
    );
    expect(result.isSensitive).toBe(true);
    expect(result.categorySlug).toBe("harassment-posh");
    expect(result.sensitiveKeywords).toContain("harassment");
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("detects POSH and discrimination language", () => {
    expect(classifyQuestion("Who is on the POSH committee?").isSensitive).toBe(true);
    expect(classifyQuestion("I faced discrimination during promotion.").isSensitive).toBe(true);
  });

  it("classifies leave questions", () => {
    const result = classifyQuestion("How many annual leave days do I get, and can unused days carry over?");
    expect(result.isSensitive).toBe(false);
    expect(result.categorySlug).toBe("leave");
    expect(result.matchedKeywords.length).toBeGreaterThan(0);
  });

  it("classifies remote work questions", () => {
    expect(classifyQuestion("What is the work from home policy for my team?").categorySlug).toBe(
      "remote-work",
    );
  });

  it("classifies travel and expense questions", () => {
    expect(classifyQuestion("What is the per diem for a flight to Mumbai?").categorySlug).toBe(
      "travel",
    );
    expect(classifyQuestion("Can I claim a receipt for a client meal?").categorySlug).toBe(
      "expenses",
    );
  });

  it("returns an unclassified result for unknown topics", () => {
    const result = classifyQuestion("Can I bring my dog to the office on Friday?");
    expect(result.categorySlug).toBeNull();
    expect(result.isSensitive).toBe(false);
    expect(result.confidence).toBeLessThan(0.5);
  });

  it("does not match keywords inside unrelated words", () => {
    const result = classifyQuestion("I believe the projector is broken.");
    expect(result.categorySlug).toBeNull();
  });

  it("normalises whitespace and casing", () => {
    expect(classifyQuestion("   REMOTE   work   entitlement?  ").categorySlug).toBe("remote-work");
  });

  it("flags common harassment and safety disclosures that avoid the original keywords", () => {
    expect(
      classifyQuestion("My manager has been stalking me and touched me without consent.").isSensitive,
    ).toBe(true);
    expect(
      classifyQuestion("I was blackmailed and threatened after I refused his advances.").isSensitive,
    ).toBe(true);
    expect(
      classifyQuestion("He made unwelcome advances and quid pro quo comments.").isSensitive,
    ).toBe(true);
    expect(
      classifyQuestion("I am being bullied and verbally abused by my supervisor.").isSensitive,
    ).toBe(true);
    expect(
      classifyQuestion("I am having thoughts of self-harm and need confidential help.").isSensitive,
    ).toBe(true);
  });
});

describe("sensitivityFor", () => {
  it("uses the computed sensitivity instead of collapsing confidential to internal", () => {
    expect(sensitivityFor(true, false)).toBe("ER_RESTRICTED");
    expect(sensitivityFor(false, true)).toBe("CONFIDENTIAL");
    expect(sensitivityFor(false, false)).toBe("INTERNAL");
    expect(sensitivityFor(false, undefined)).toBe("INTERNAL");
  });
});
