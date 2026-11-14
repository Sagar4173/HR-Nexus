"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Send, Sparkles } from "lucide-react";

import { askAction } from "./actions";

const SUGGESTIONS = [
  "How many annual leave days do I get, and can unused days carry over?",
  "What is the remote work entitlement for my department?",
  "What are the meal limits when I travel for work?",
  "How does the performance improvement plan process work?",
  "What is the notice period if I resign?",
  "I want to report harassment by my manager confidentially.",
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? (
        <>
          <span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          Creating ticket…
        </>
      ) : (
        <>
          <Send className="size-4" /> Get grounded answer
        </>
      )}
    </button>
  );
}

export function AskForm() {
  const [question, setQuestion] = useState("");

  return (
    <form action={askAction} className="space-y-4">
      <div>
        <label htmlFor="question" className="text-xs font-semibold text-slate-700">
          Your question
        </label>
        <textarea
          id="question"
          name="question"
          required
          minLength={8}
          maxLength={4000}
          rows={6}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Describe what you need to know. Include dates if your question depends on when a policy applied."
          className="input mt-1.5 h-auto resize-y py-3 leading-relaxed"
        />
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
          <span>Never include passwords, bank details or identity documents.</span>
          <span className="tabular-nums">{question.length}/4000</span>
        </div>
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
          <Sparkles className="size-3.5 text-indigo-500" /> Example questions
        </p>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setQuestion(suggestion)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-left text-[11px] text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <p className="max-w-md text-[11px] leading-relaxed text-slate-500">
          Answering is deterministic: the applicable policy version is resolved first, then a
          verbatim passage is extracted and validated against the document, effective dates and
          audience rules.
        </p>
        <SubmitButton />
      </div>
    </form>
  );
}
