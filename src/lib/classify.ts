export type Classification = {
  categorySlug: string | null;
  confidence: number;
  isSensitive: boolean;
  sensitiveKeywords: string[];
  matchedKeywords: string[];
};

type Rule = { slug: string; keywords: string[] };

const SENSITIVE_TERMS = [
  "harassment",
  "harassed",
  "sexual",
  "discrimination",
  "discriminated",
  "discriminatory",
  "retaliation",
  "retaliated",
  "bullying",
  "bullied",
  "intimidation",
  "intimidated",
  "hostile work",
  "hostile environment",
  "posh",
  "disciplinary",
  "misconduct",
  "confidential workplace",
  "complaint against",
  "stalking",
  "stalked",
  "touched me",
  "touching me",
  "inappropriate touching",
  "groped",
  "groping",
  "unwelcome advances",
  "unwanted advances",
  "sexual advances",
  "quid pro quo",
  "sexual assault",
  "physical assault",
  "assaulted",
  "rape",
  "raped",
  "molest",
  "molested",
  "threatened",
  "threatening",
  "threatens",
  "blackmail",
  "blackmailed",
  "coerced",
  "coercion",
  "verbally abused",
  "physical abuse",
  "abusive behavior",
  "abusive behaviour",
  "domestic violence",
  "violent",
  "self-harm",
  "suicidal",
  "suicide",
  "kill me",
  "hurt me",
];

const CATEGORY_RULES: Rule[] = [
  {
    slug: "harassment-posh",
    keywords: [
      "harassment",
      "harassed",
      "posh",
      "sexual",
      "discrimination",
      "retaliation",
      "bullying",
      "stalking",
      "threatened",
      "blackmail",
      "unwelcome advances",
    ],
  },
  {
    slug: "leave",
    keywords: ["annual leave", "sick leave", "vacation", "time off", "carry over", "carryover", "leave days", "leave"],
  },
  {
    slug: "remote-work",
    keywords: ["remote", "hybrid", "work from home", "wfh", "home office"],
  },
  {
    slug: "travel",
    keywords: ["travel", "per diem", "per-diem", "flight", "hotel", "premium economy", "airfare"],
  },
  {
    slug: "expenses",
    keywords: ["expense", "reimburse", "receipt", "meal limit", "claim"],
  },
  {
    slug: "code-of-conduct",
    keywords: ["gift", "conflict of interest", "ethics", "bribe", "code of conduct", "vendor"],
  },
  {
    slug: "benefits",
    keywords: ["insurance", "health cover", "dependant", "dependent", "benefits", "enrollment", "enrolment"],
  },
  {
    slug: "compensation",
    keywords: ["salary", "payroll", "overtime", "payslip", "compensation", "paid"],
  },
  {
    slug: "performance",
    keywords: ["performance", "review cycle", "appraisal", "improvement plan", "pip", "check-in"],
  },
  {
    slug: "separation",
    keywords: ["resignation", "notice period", "final settlement", "exit", "separation", "resign"],
  },
  {
    slug: "data-privacy",
    keywords: ["personal data", "data privacy", "privacy", "retention", "my records", "data access"],
  },
  {
    slug: "health-safety",
    keywords: ["injury", "safety", "emergency", "fire", "first aid", "incident"],
  },
];

const WORD_CHAR = /[a-z0-9]/;

function containsTerm(text: string, term: string): boolean {
  let index = text.indexOf(term);
  while (index !== -1) {
    const before = index === 0 ? "" : text[index - 1];
    const after = text[index + term.length] ?? "";
    if (!WORD_CHAR.test(before) && !WORD_CHAR.test(after)) return true;
    index = text.indexOf(term, index + 1);
  }
  return false;
}

export function sensitivityFor(
  isSensitive: boolean,
  categorySensitiveDefault: boolean | null | undefined,
): "ER_RESTRICTED" | "CONFIDENTIAL" | "INTERNAL" {
  if (isSensitive) return "ER_RESTRICTED";
  return categorySensitiveDefault ? "CONFIDENTIAL" : "INTERNAL";
}

export function classifyQuestion(input: string): Classification {
  const text = input.toLowerCase().replace(/\s+/g, " ").trim();
  const sensitiveKeywords = SENSITIVE_TERMS.filter((term) => containsTerm(text, term));

  let best: { slug: string; matches: string[] } | null = null;
  for (const rule of CATEGORY_RULES) {
    const matches = rule.keywords.filter((term) => containsTerm(text, term));
    if (matches.length === 0) continue;
    if (!best || matches.length > best.matches.length) {
      best = { slug: rule.slug, matches };
    }
  }

  const isSensitive = sensitiveKeywords.length > 0;
  const matchedKeywords = [...new Set([...(best?.matches ?? []), ...sensitiveKeywords])];

  if (isSensitive) {
    return {
      categorySlug: "harassment-posh",
      confidence: 0.95,
      isSensitive: true,
      sensitiveKeywords,
      matchedKeywords,
    };
  }

  if (!best) {
    return {
      categorySlug: null,
      confidence: 0.35,
      isSensitive: false,
      sensitiveKeywords: [],
      matchedKeywords: [],
    };
  }

  return {
    categorySlug: best.slug,
    confidence: Math.min(0.94, 0.62 + best.matches.length * 0.08),
    isSensitive: false,
    sensitiveKeywords: [],
    matchedKeywords,
  };
}
