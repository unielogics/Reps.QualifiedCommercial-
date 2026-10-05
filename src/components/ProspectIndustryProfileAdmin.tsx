"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe2, Save, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { LEAD_TYPES, leadTypeDefinition, type LeadType } from "@/lib/leadTypes";
import type { ProspectOutreachProfile, ProspectOutreachProfileList, ProspectOutreachPurposeTemplate } from "@/lib/prospects";

const PURPOSE_LABELS: Record<string, string> = {
  information: "Information pack",
  missed_call: "Missed call",
  callback_confirmation: "Callback confirmation",
  client_will_call_back: "Client will call back",
  booking: "Booking invitation",
  general: "General outreach",
};

type EditableProfile = Pick<ProspectOutreachProfile, "display_name" | "desk_name" | "audience_label" | "audience_plural" | "website_url" | "drafting_guidance" | "purpose_templates">;

function editableProfile(profile: ProspectOutreachProfile): EditableProfile {
  return {
    display_name: profile.display_name,
    desk_name: profile.desk_name,
    audience_label: profile.audience_label,
    audience_plural: profile.audience_plural,
    website_url: profile.website_url,
    drafting_guidance: profile.drafting_guidance,
    purpose_templates: Object.fromEntries(Object.entries(profile.purpose_templates).map(([key, value]) => [key, { ...value }])),
  };
}

export default function ProspectIndustryProfileAdmin() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [leadType, setLeadType] = useState<LeadType>("dealer");
  const [draft, setDraft] = useState<EditableProfile | null>(null);
  const [hydratedVersion, setHydratedVersion] = useState("");
  const profiles = useQuery({
    queryKey: ["prospect-outreach-profiles"],
    queryFn: async () => api<ProspectOutreachProfileList>("/dealer-os/prospect-outreach/profiles", { authToken: (await getToken()) ?? undefined }),
  });
  const profile = profiles.data?.items.find((item) => item.lead_type === leadType);
  const fingerprint = profile ? `${profile.lead_type}:${profile.version}:${profile.created_at ?? "seed"}` : "";

  useEffect(() => {
    if (!profile) {
      setDraft(null);
      setHydratedVersion(`${leadType}:missing`);
      return;
    }
    if (hydratedVersion === fingerprint) return;
    setDraft(editableProfile(profile));
    setHydratedVersion(fingerprint);
  }, [fingerprint, hydratedVersion, profile]);

  const save = useMutation({
    mutationFn: async () => {
      if (!profile || !draft) throw new Error("The outreach profile is not ready.");
      return api<ProspectOutreachProfile>(`/dealer-os/prospect-outreach/profiles/${leadType}`, {
        method: "PATCH",
        body: JSON.stringify({ expected_version: profile.version, ...draft }),
        authToken: (await getToken()) ?? undefined,
      });
    },
    onSuccess: async (saved) => {
      await qc.invalidateQueries({ queryKey: ["prospect-outreach-profiles"] });
      setDraft(editableProfile(saved));
      setHydratedVersion(`${saved.lead_type}:${saved.version}:${saved.created_at ?? "saved"}`);
    },
  });

  const updateTemplate = (purpose: string, part: keyof ProspectOutreachPurposeTemplate, value: string) => setDraft((current) => current ? ({
    ...current,
    purpose_templates: {
      ...current.purpose_templates,
      [purpose]: { ...current.purpose_templates[purpose], [part]: value },
    },
  }) : current);
  const dirty = Boolean(profile && draft && JSON.stringify(editableProfile(profile)) !== JSON.stringify(draft));
  const changeLeadType = (next: LeadType) => {
    if (next === leadType) return;
    if (dirty && !window.confirm("Discard unsaved outreach profile edits and switch business type?")) return;
    setLeadType(next);
    setDraft(null);
    setHydratedVersion("");
  };
  const definition = leadTypeDefinition(leadType);
  const templateEntries = useMemo(() => Object.entries(draft?.purpose_templates ?? {}), [draft?.purpose_templates]);

  return <section className="prospectAISettingsCard prospectIndustryProfileAdmin">
    <header><div><span className="prospectSectionEyebrow"><Globe2 size={14} /> Industry outreach profiles</span><h3>Control the language, link, and safe fallback for each business type</h3><p className="sub">Saving creates a new immutable profile version. Existing and queued drafts keep the exact version they already snapshot.</p></div>{profile && <span className="cellchip c-ok">Active v{profile.version}</span>}</header>
    <div className="prospectIndustryTabs" role="radiogroup" aria-label="Business type profile">
      {LEAD_TYPES.map((item) => <button key={item.key} type="button" role="radio" aria-checked={leadType === item.key} className={leadType === item.key ? "on" : ""} onClick={() => changeLeadType(item.key)}><b>{item.label}</b><small>{item.key}</small></button>)}
    </div>
    {profiles.isLoading && <div className="empty compact">Loading outreach profiles…</div>}
    {profiles.isError && <div className="note" role="alert">{profiles.error instanceof Error ? profiles.error.message : "Outreach profiles could not be loaded."}</div>}
    {draft && <>
      <div className="prospectAIFormGrid">
        <label><span className="lbl">Customer-facing profile name</span><input className="field" value={draft.display_name} onChange={(event) => setDraft({ ...draft, display_name: event.target.value })} /></label>
        <label><span className="lbl">Desk / sender display name</span><input className="field" value={draft.desk_name} onChange={(event) => setDraft({ ...draft, desk_name: event.target.value })} /></label>
        <label><span className="lbl">Business term · singular</span><input className="field" value={draft.audience_label} onChange={(event) => setDraft({ ...draft, audience_label: event.target.value })} placeholder={definition.businessNoun} /></label>
        <label><span className="lbl">Business term · plural</span><input className="field" value={draft.audience_plural} onChange={(event) => setDraft({ ...draft, audience_plural: event.target.value })} /></label>
        <label className="prospectIndustryProfileWide"><span className="lbl">Approved website link</span><input className="field" type="url" value={draft.website_url} onChange={(event) => setDraft({ ...draft, website_url: event.target.value })} /><small>System-owned HTTPS link. Agents and AI cannot replace it in a draft.</small></label>
        <label className="prospectIndustryProfileWide"><span className="lbl">Type-specific AI writing guidance</span><textarea className="field" rows={4} maxLength={3000} value={draft.drafting_guidance} onChange={(event) => setDraft({ ...draft, drafting_guidance: event.target.value })} /><small>Global safeguards and blocked phrases always take priority.</small></label>
      </div>
      <div className="prospectProfileTemplates"><div><Sparkles size={17} /><span><b>Deterministic fallback copy</b><small>Used when AI is unavailable or its response fails validation.</small></span></div>{templateEntries.map(([purpose, template]) => <details key={purpose}><summary><b>{PURPOSE_LABELS[purpose] ?? purpose.replaceAll("_", " ")}</b><span>Subject and safe body</span></summary><label><span className="lbl">Subject</span><input className="field" maxLength={240} value={template.subject} onChange={(event) => updateTemplate(purpose, "subject", event.target.value)} /></label><label><span className="lbl">Body template</span><textarea className="field" rows={7} maxLength={12000} value={template.body} onChange={(event) => updateTemplate(purpose, "body", event.target.value)} /></label></details>)}</div>
      <div className="prospectDialogActions"><button type="button" className="btn" disabled={!dirty || save.isPending} onClick={() => profile && setDraft(editableProfile(profile))}>Discard profile edits</button><button type="button" className="btn pri" disabled={!dirty || save.isPending || !draft.website_url.startsWith("https://")} onClick={() => save.mutate()}><Save size={16} />{save.isPending ? "Publishing version…" : `Save ${definition.shortLabel} profile`}</button></div>
      {save.isError && <div className="note" role="alert">{save.error instanceof Error ? save.error.message : "The profile could not be saved."}</div>}
    </>}
  </section>;
}
