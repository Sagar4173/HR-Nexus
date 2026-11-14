import { formatInTimeZone } from "date-fns-tz";

import { prisma } from "./db";
import { dateKey, toDateOnly } from "./policy-dates";

export type EmployeeContext = {
  departmentCode: string;
  locationCountry: string;
  employmentType: string;
  grade: string;
};

export type ResolvedPolicy = {
  category: { id: string; slug: string; name: string };
  document: {
    id: string;
    code: string;
    title: string;
    summary: string | null;
  };
  version: {
    id: string;
    versionLabel: string;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    status: string;
    contentMd: string;
  };
};

export type PolicyChunkHit = {
  id: string;
  heading: string;
  content: string;
  ordinal: number;
  rank: number;
};

export type Citation = {
  chunkId: string;
  policyVersionId: string;
  policyDocumentId: string;
  documentCode: string;
  documentTitle: string;
  versionLabel: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  heading: string;
  quote: string;
  rank: number;
  validated: boolean;
  validationNote: string | null;
};

export type PolicyAnswer = {
  mode: "answered" | "insufficient";
  answer: string;
  policy: ResolvedPolicy | null;
  citations: Citation[];
  retrieval: { candidates: number; matched: boolean };
};

/**
 * Deterministic version resolution:
 * 1. only versions effective on the requested date,
 * 2. only versions whose audience applies to the employee,
 * 3. lowest policy-document code wins (stable, testable order),
 * 4. the effective version of that document is used.
 */
export async function resolvePolicy(
  categorySlug: string,
  context: EmployeeContext,
  asOf: Date,
): Promise<ResolvedPolicy | null> {
  const category = await prisma.category.findUnique({ where: { slug: categorySlug } });
  if (!category) return null;

  const effectiveOn = toDateOnly(asOf);
  const versions = await prisma.policyVersion.findMany({
    where: {
      status: { not: "DRAFT" },
      effectiveFrom: { lte: effectiveOn },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveOn } }],
      policyDocument: { categoryId: category.id },
      audienceRules: {
        some: {
          OR: [
            { dimension: "ALL" },
            { dimension: "COUNTRY", value: context.locationCountry },
            { dimension: "DEPARTMENT", value: context.departmentCode },
            { dimension: "EMPLOYMENT_TYPE", value: context.employmentType },
            { dimension: "GRADE", value: context.grade },
          ],
        },
      },
    },
    include: { policyDocument: true },
    orderBy: [{ policyDocument: { code: "asc" } }, { effectiveFrom: "desc" }],
  });

  const version = versions[0];
  if (!version) return null;

  return {
    category: { id: category.id, slug: category.slug, name: category.name },
    document: {
      id: version.policyDocument.id,
      code: version.policyDocument.code,
      title: version.policyDocument.title,
      summary: version.policyDocument.summary,
    },
    version: {
      id: version.id,
      versionLabel: version.versionLabel,
      effectiveFrom: version.effectiveFrom,
      effectiveTo: version.effectiveTo,
      status: version.status,
      contentMd: version.contentMd,
    },
  };
}

export async function retrieveChunks(
  policyVersionId: string,
  question: string,
  limit = 3,
): Promise<PolicyChunkHit[]> {
  const trimmed = question.trim();
  if (trimmed.length > 0) {
    const hits = await prisma.$queryRaw<PolicyChunkHit[]>`
      SELECT c.id,
             c.heading,
             c.content,
             c.ordinal,
             ts_rank(
               to_tsvector('english', coalesce(c.heading, '') || ' ' || coalesce(c.content, '')),
               websearch_to_tsquery('english', ${trimmed})
             )::float8 AS rank
      FROM "PolicyChunk" c
      WHERE c."policyVersionId" = ${policyVersionId}::uuid
        AND to_tsvector('english', coalesce(c.heading, '') || ' ' || coalesce(c.content, ''))
            @@ websearch_to_tsquery('english', ${trimmed})
      ORDER BY rank DESC, c.ordinal ASC
      LIMIT ${limit}
    `;
    if (hits.length > 0) {
      return hits.map((hit) => ({ ...hit, rank: Number(hit.rank) }));
    }
  }

  const fallback = await prisma.policyChunk.findMany({
    where: { policyVersionId },
    orderBy: { ordinal: "asc" },
    take: limit,
  });
  return fallback.map((chunk) => ({
    id: chunk.id,
    heading: chunk.heading,
    content: chunk.content,
    ordinal: chunk.ordinal,
    rank: 0,
  }));
}

function buildQuote(content: string, maxLength = 340): string {
  const clean = content.trim();
  if (clean.length <= maxLength) return clean;
  const window = clean.slice(0, maxLength);
  const sentenceEnd = window.lastIndexOf(". ");
  if (sentenceEnd >= 80) return window.slice(0, sentenceEnd + 1).trim();
  const wordEnd = window.lastIndexOf(" ");
  return (wordEnd > 0 ? window.slice(0, wordEnd) : window).trim();
}

export async function validateCitation(input: {
  chunkId: string;
  policyVersionId: string;
  quote: string;
  asOf: Date;
  context: EmployeeContext;
}): Promise<{ valid: boolean; note: string }> {
  const chunk = await prisma.policyChunk.findUnique({
    where: { id: input.chunkId },
    include: {
      policyVersion: {
        include: { policyDocument: { include: { category: true } }, audienceRules: true },
      },
    },
  });
  if (!chunk || chunk.policyVersionId !== input.policyVersionId) {
    return { valid: false, note: "Citation chunk does not belong to the cited version" };
  }
  if (!chunk.content.includes(input.quote)) {
    return { valid: false, note: "Quoted text is not a verbatim substring of the chunk" };
  }
  const version = chunk.policyVersion;
  const asOf = toDateOnly(input.asOf);
  if (version.effectiveFrom > asOf || (version.effectiveTo && version.effectiveTo < asOf)) {
    return { valid: false, note: "Cited policy version was not effective at the answer date" };
  }
  const applicable = version.audienceRules.some((rule) => {
    if (rule.dimension === "ALL") return true;
    if (rule.dimension === "COUNTRY") return rule.value === input.context.locationCountry;
    if (rule.dimension === "DEPARTMENT") return rule.value === input.context.departmentCode;
    if (rule.dimension === "EMPLOYMENT_TYPE") return rule.value === input.context.employmentType;
    if (rule.dimension === "GRADE") return rule.value === input.context.grade;
    return false;
  });
  if (!applicable) {
    return { valid: false, note: "Policy version audience does not cover the employee" };
  }
  return { valid: true, note: "Quote, version and audience verified" };
}

export async function answerPolicyQuestion(input: {
  categorySlug: string;
  question: string;
  context: EmployeeContext;
  asOf: Date;
}): Promise<PolicyAnswer> {
  const policy = await resolvePolicy(input.categorySlug, input.context, input.asOf);
  if (!policy) {
    return {
      mode: "insufficient",
      answer:
        "I could not find a policy that is effective for your role, location and employment type on this date. A People Operations specialist will review your question.",
      policy: null,
      citations: [],
      retrieval: { candidates: 0, matched: false },
    };
  }

  const chunks = await retrieveChunks(policy.version.id, input.question);
  if (chunks.length === 0) {
    return {
      mode: "insufficient",
      answer:
        "The applicable policy does not contain a section that answers this question. A People Operations specialist will review it.",
      policy,
      citations: [],
      retrieval: { candidates: 0, matched: false },
    };
  }

  const entitlement = await prisma.policyChunk.findFirst({
    where: {
      policyVersionId: policy.version.id,
      heading: { in: ["Entitlement", "Rules"] },
    },
    orderBy: { ordinal: "asc" },
  });
  const primary = entitlement
    ? {
        id: entitlement.id,
        heading: entitlement.heading,
        content: entitlement.content,
        ordinal: entitlement.ordinal,
        rank: chunks.find((chunk) => chunk.id === entitlement.id)?.rank ?? 0,
      }
    : chunks[0];
  const supporting = chunks.find((chunk) => chunk.id !== primary.id) ?? null;

  const selected = supporting ? [primary, supporting] : [primary];
  const citations = await Promise.all(
    selected.map(async (chunk, index) => {
      const quote = buildQuote(chunk.content, index === 0 ? 340 : 260);
      const validation = await validateCitation({
        chunkId: chunk.id,
        policyVersionId: policy.version.id,
        quote,
        asOf: input.asOf,
        context: input.context,
      });
      return {
        chunkId: chunk.id,
        policyVersionId: policy.version.id,
        policyDocumentId: policy.document.id,
        documentCode: policy.document.code,
        documentTitle: policy.document.title,
        versionLabel: policy.version.versionLabel,
        effectiveFrom: dateKey(policy.version.effectiveFrom),
        effectiveTo: policy.version.effectiveTo ? dateKey(policy.version.effectiveTo) : null,
        heading: chunk.heading,
        quote,
        rank: index + 1,
        validated: validation.valid,
        validationNote: validation.note,
      } satisfies Citation;
    }),
  );

  const effective = formatInTimeZone(policy.version.effectiveFrom, "Asia/Kolkata", "dd MMM yyyy");
  const sections = citations
    .map(
      (citation, index) =>
        `${index === 0 ? "Key requirements" : "Additional context"} — ${citation.heading}:\n“${citation.quote}”`,
    )
    .join("\n\n");
  const answer =
    `Based on ${policy.document.title} (${policy.version.versionLabel}), effective ${effective}:\n\n` +
    `${sections}\n\n` +
    "This is general guidance from the applicable policy text, not legal advice.";

  return {
    mode: "answered",
    answer,
    policy,
    citations,
    retrieval: { candidates: chunks.length, matched: chunks.some((chunk) => chunk.rank > 0) },
  };
}
