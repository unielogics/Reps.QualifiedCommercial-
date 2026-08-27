"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";

export type BusinessQuestion = {
  key: string;
  label: string;
  show_when?: Record<string, boolean>;
  show_when_any?: Record<string, boolean>;
};

export type BusinessQuestionGroup = {
  key: string;
  title: string;
  questions: BusinessQuestion[];
};

function isVisible(question: BusinessQuestion, answers: Record<string, unknown>): boolean {
  const all = Object.entries(question.show_when ?? {});
  if (all.length && !all.every(([key, value]) => answers[key] === value)) return false;
  const any = Object.entries(question.show_when_any ?? {});
  if (any.length && !any.some(([key, value]) => answers[key] === value)) return false;
  return true;
}

export default function Step4BusinessQuestions({
  dealerId,
  groups,
  initialAnswers,
}: {
  dealerId: string;
  groups: BusinessQuestionGroup[];
  initialAnswers: Record<string, unknown>;
}) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, unknown>>(initialAnswers);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => setAnswers(initialAnswers), [initialAnswers]);

  const save = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: boolean }) => {
      setSavingKey(key);
      return api(`/dealer-os/dealers/${dealerId}/pre-screen`, {
        method: "PATCH",
        body: JSON.stringify({ file_answers: { [key]: value } }),
        authToken: (await getToken()) ?? undefined,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["application-pre-screen", dealerId] });
      void qc.invalidateQueries({ queryKey: ["underwriting-resolution", dealerId] });
      void qc.invalidateQueries({ queryKey: ["submission-readiness", dealerId] });
    },
    onSettled: () => setSavingKey(null),
  });

  const visibleGroups = useMemo(() => groups.map((group) => ({
    ...group,
    questions: group.questions.filter((question) => isVisible(question, answers)),
  })).filter((group) => group.questions.length), [answers, groups]);

  if (!visibleGroups.length) {
    return (
      <div className="note">
        <div className="row" style={{ gap: 8 }}><CheckCircle2 size={18} /><b>No additional business questions apply</b></div>
        <p className="sub" style={{ marginBottom: 0 }}>The canonical NAICS classification and current candidate routes do not require another business questionnaire.</p>
      </div>
    );
  }

  return (
    <div className="step4QuestionGroups">
      {visibleGroups.map((group) => (
        <section key={group.key} className="step4QuestionGroup">
          <h4>{group.title}</h4>
          <div className="step4QuestionList">
            {group.questions.map((question) => {
              const selected = typeof answers[question.key] === "boolean" ? Boolean(answers[question.key]) : null;
              return (
                <div key={question.key} className={`step4Question${selected === null ? " unanswered" : ""}`}>
                  <div>
                    <b>{question.label}</b>
                    <span className="sub">Business-level answer · used only for applicable program rules</span>
                  </div>
                  <div className="step4YesNo" role="group" aria-label={question.label}>
                    {[true, false].map((value) => (
                      <button
                        key={String(value)}
                        type="button"
                        className={`btn${selected === value ? " pri" : ""}`}
                        aria-pressed={selected === value}
                        disabled={save.isPending && savingKey === question.key}
                        onClick={() => {
                          setAnswers((current) => ({ ...current, [question.key]: value }));
                          save.mutate({ key: question.key, value });
                        }}
                      >
                        {value ? "Yes" : "No"}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {save.error && <div className="warnline">{save.error instanceof Error ? save.error.message : "The answer could not be saved."}</div>}
    </div>
  );
}
