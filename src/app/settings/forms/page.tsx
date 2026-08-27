"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowUp, ExternalLink, FilePlus2, Files, Save, Trash2, Upload } from "lucide-react";
import { api, apiUpload } from "@/lib/api";
import { useMe } from "@/lib/useMe";

type TemplateVersion = {
  id: string;
  template_id: string;
  template_key: string;
  title: string;
  revision: number;
  sha256: string;
  page_count: number;
  active: boolean;
  created_at: string;
  preview_url: string | null;
};

type PackageItem = {
  id?: string;
  template_key: string;
  template_version_id: string | null;
  title: string;
  sort_order: number;
  required: boolean;
};

type ContractPackage = {
  id: string;
  key: string;
  program_key: string;
  title: string;
  version: number;
  active: boolean;
  items: PackageItem[];
};

type PackageDraft = { title: string; active: boolean; items: PackageItem[] };

const PROGRAMS = [
  { key: "term_loan_3_5_year", label: "EZ Term" },
  { key: "term_loan_10_year", label: "MicroCap" },
] as const;

function cleanTemplateKey(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
}

function packageDraft(source: ContractPackage | undefined, label: string): PackageDraft {
  return {
    title: source?.title ?? `${label} Application Package`,
    active: source?.active ?? true,
    items: (source?.items ?? []).map((item, index) => ({ ...item, sort_order: index })),
  };
}

export default function FormsAndPackagesPage() {
  const { getToken } = useAuth();
  const { isSuperAdmin, isResolving } = useMe();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadTitle, setUploadTitle] = useState("Supporting agreement");
  const [uploadKey, setUploadKey] = useState("supporting_agreement");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [drafts, setDrafts] = useState<Record<string, PackageDraft>>({});

  const authenticated = async <T,>(path: string, init?: RequestInit) => api<T>(path, {
    ...init,
    authToken: (await getToken()) ?? undefined,
  });
  const packages = useQuery({
    queryKey: ["contract-packages", "admin"],
    enabled: isSuperAdmin,
    queryFn: () => authenticated<ContractPackage[]>("/dealer-os/contract-packages"),
  });
  const versions = useQuery({
    queryKey: ["contract-template-versions", "admin"],
    enabled: isSuperAdmin,
    queryFn: () => authenticated<TemplateVersion[]>("/dealer-os/contract-template-versions"),
  });
  const activePackages = useMemo(() => new Map(PROGRAMS.map((program) => [
    program.key,
    (packages.data ?? []).find((row) => row.program_key === program.key && row.active)
      ?? (packages.data ?? []).find((row) => row.program_key === program.key),
  ])), [packages.data]);

  useEffect(() => {
    if (!packages.data) return;
    setDrafts(Object.fromEntries(PROGRAMS.map((program) => [
      program.key,
      packageDraft(activePackages.get(program.key), program.label),
    ])));
  }, [activePackages, packages.data]);

  const upload = useMutation({
    mutationFn: async () => {
      if (!uploadFile) throw new Error("Choose a PDF first.");
      const key = cleanTemplateKey(uploadKey);
      if (key.length < 3) throw new Error("Use a descriptive template key.");
      const form = new FormData();
      form.append("file", uploadFile);
      form.append("title", uploadTitle.trim() || uploadFile.name.replace(/\.pdf$/i, ""));
      return apiUpload<TemplateVersion>(`/dealer-os/contract-templates/${key}/versions`, form, {
        authToken: (await getToken()) ?? undefined,
      });
    },
    onSuccess: async () => {
      setMessage("Immutable template version uploaded. Add it to one or both packages below.");
      setUploadFile(null);
      if (fileInput.current) fileInput.current.value = "";
      await queryClient.invalidateQueries({ queryKey: ["contract-template-versions", "admin"] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Template upload failed."),
  });

  const publish = useMutation<ContractPackage, Error, { programKey: string; draft: PackageDraft }>({
    mutationFn: ({ programKey, draft }) => authenticated<ContractPackage>(`/dealer-os/contract-packages/${programKey}`, {
      method: "PUT",
      body: JSON.stringify({
        title: draft.title,
        active: draft.active,
        items: draft.items.map((item, index) => ({ ...item, sort_order: index })),
      }),
    }),
    onSuccess: async (saved) => {
      setMessage(`${saved.title} version ${saved.version} published. Existing sent and executed packages remain frozen.`);
      await queryClient.invalidateQueries({ queryKey: ["contract-packages", "admin"] });
    },
    onError: (error) => setMessage(error.message || "The package could not be published."),
  });

  const setDraft = (programKey: string, update: (draft: PackageDraft) => PackageDraft) => {
    setDrafts((current) => ({ ...current, [programKey]: update(current[programKey]) }));
  };
  const addDocument = (programKey: string) => {
    const currentKeys = new Set((drafts[programKey]?.items ?? []).map((item) => item.template_key));
    const latest = versions.data?.find((version) => !currentKeys.has(version.template_key));
    if (!latest) return setMessage("Upload or load a template version first.");
    setDraft(programKey, (draft) => ({
      ...draft,
      items: [...draft.items, {
        template_key: latest.template_key,
        template_version_id: latest.id,
        title: latest.title,
        sort_order: draft.items.length,
        required: false,
      }],
    }));
  };
  const updateItem = (programKey: string, index: number, patch: Partial<PackageItem>) => setDraft(programKey, (draft) => ({
    ...draft,
    items: draft.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
  }));
  const selectVersion = (programKey: string, index: number, versionId: string) => {
    const selected = versions.data?.find((row) => row.id === versionId);
    if (!selected) return;
    updateItem(programKey, index, {
      template_key: selected.template_key,
      template_version_id: selected.id,
      title: selected.title,
    });
  };
  const moveItem = (programKey: string, index: number, direction: -1 | 1) => setDraft(programKey, (draft) => {
    const target = index + direction;
    if (target < 0 || target >= draft.items.length) return draft;
    const items = [...draft.items];
    [items[index], items[target]] = [items[target], items[index]];
    return { ...draft, items };
  });

  if (isResolving) return <div className="panel"><div className="panel-b">Loading forms configuration...</div></div>;
  if (!isSuperAdmin) return <div className="panel"><div className="panel-b"><b>Super-admin access required</b><p className="sub">Only super admins can publish program forms and packages.</p></div></div>;

  return <div className="formsPackagesPage">
    <header className="hd"><div><a className="eyebrow formsBack" href="/settings"><ArrowLeft size={13} /> Settings</a><h2>Forms and Packages</h2><p className="lede">Control the exact immutable PDFs clients review and sign for each direct program.</p></div></header>
    {message && <div className="note mt" role="status">{message}</div>}

    <section className="formsWorkflowGuide mt" aria-label="How program packages work">
      <div><span>1</span><b>Upload a PDF version</b><small>Each upload is immutable and keeps its own hash and revision.</small></div>
      <div><span>2</span><b>Assign it to a program</b><small>Add the form to EZ Term, MicroCap, or both; then set order and requirement.</small></div>
      <div><span>3</span><b>Publish the package</b><small>New Step 4 drafts use the latest active package. Sent documents stay frozen.</small></div>
      <div><span>4</span><b>Rep reviews and sends</b><small>Step 4 fills the PDFs from the application and the client signs from their own device.</small></div>
    </section>

    <section className="panel mt"><div className="panelTitle"><div><h3>Template library</h3><span>Every upload creates a new immutable version. Sent and executed documents never change.</span></div></div><div className="formsTemplateGrid">
      <div className="formsUploadPanel">
        <label><span className="lbl">Document title</span><input className="field" value={uploadTitle} onChange={(event) => { setUploadTitle(event.target.value); if (uploadKey === "supporting_agreement") setUploadKey(cleanTemplateKey(event.target.value)); }} /></label>
        <label><span className="lbl">Template key</span><input className="field num" value={uploadKey} onChange={(event) => setUploadKey(cleanTemplateKey(event.target.value))} /></label>
        <label className="formsFilePicker"><Upload size={22} /><span>{uploadFile ? uploadFile.name : "Choose PDF template"}</span><input ref={fileInput} type="file" accept="application/pdf,.pdf" onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} /></label>
        <button type="button" className="btn pri" disabled={!uploadFile || upload.isPending} onClick={() => upload.mutate()}>{upload.isPending ? "Uploading version..." : "Upload immutable version"}</button>
        <p className="sub">The supplied business-loan application uses its verified overlay map. New supporting PDFs use a standard bottom signature/date anchor and remain otherwise verbatim.</p>
      </div>
      <div className="formsVersionList">
        {(versions.data ?? []).map((version) => <div key={version.id}><span><b>{version.title}</b><small>{version.template_key} · revision {version.revision} · {version.page_count} page{version.page_count === 1 ? "" : "s"}</small><small className="num">SHA-256 {version.sha256.slice(0, 20)}...</small></span><span className={`cellchip ${version.active ? "c-ok" : ""}`}>{version.active ? "Active" : "Inactive"}</span>{version.preview_url && <a className="iconBtn" href={version.preview_url} target="_blank" rel="noreferrer" title={`Preview ${version.title}`}><ExternalLink size={16} /></a>}</div>)}
        {versions.isLoading && <p className="sub">Loading immutable versions...</p>}
      </div>
    </div></section>

    <div className="formsPackageGrid mt">
      {PROGRAMS.map((program) => {
        const source = activePackages.get(program.key);
        const draft = drafts[program.key] ?? packageDraft(source, program.label);
        return <section className="panel formsPackageEditor" key={program.key}><div className="panelTitle"><div><span className="eyebrow">{program.label}</span><h3>{draft.title}</h3><span>Published version {source?.version ?? 0}</span></div><button type="button" className="btn pri" disabled={!draft.items.length || publish.isPending} onClick={() => publish.mutate({ programKey: program.key, draft })}><Save size={16} /> Publish new version</button></div><div className="formsPackageBody">
          <label><span className="lbl">Package title</span><input className="field" value={draft.title} onChange={(event) => setDraft(program.key, (current) => ({ ...current, title: event.target.value }))} /></label>
          <label className="formsPackageActive"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft(program.key, (current) => ({ ...current, active: event.target.checked }))} /><span><b>Package active</b><small>Agents can generate this package only while it is active.</small></span></label>
          <div className="formsPackageItems">
            {draft.items.map((item, index) => <div key={`${item.template_version_id}-${index}`} className="formsPackageItem">
              <span className="formsOrder">{index + 1}</span>
              <label className="grow"><span className="lbl">Document version</span><select className="field" value={item.template_version_id ?? ""} onChange={(event) => selectVersion(program.key, index, event.target.value)}>{(versions.data ?? []).filter((version) => version.template_key === item.template_key || !draft.items.some((candidate, candidateIndex) => candidateIndex !== index && candidate.template_key === version.template_key)).map((version) => <option key={version.id} value={version.id}>{version.title} · r{version.revision}</option>)}</select></label>
              <label className="grow"><span className="lbl">Title shown to signer</span><input className="field" value={item.title} onChange={(event) => updateItem(program.key, index, { title: event.target.value })} /></label>
              <label className="formsRequired"><input type="checkbox" checked={item.required} disabled={item.template_key === "qc_program_application"} onChange={(event) => updateItem(program.key, index, { required: event.target.checked })} /><span>Required</span></label>
              <div className="formsItemActions"><button type="button" className="iconBtn" disabled={index === 0} onClick={() => moveItem(program.key, index, -1)} title="Move up"><ArrowUp size={15} /></button><button type="button" className="iconBtn" disabled={index === draft.items.length - 1} onClick={() => moveItem(program.key, index, 1)} title="Move down"><ArrowDown size={15} /></button><button type="button" className="iconBtn danger" disabled={item.template_key === "qc_program_application"} onClick={() => setDraft(program.key, (current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))} title="Remove document"><Trash2 size={15} /></button></div>
            </div>)}
          </div>
          <button type="button" className="btn" onClick={() => addDocument(program.key)}><FilePlus2 size={16} /> Add supporting document</button>
          <div className="note"><Files size={17} /><span>The Business Loan Application remains the required primary form. Supporting agreements may be ordered and made required or optional.</span></div>
        </div></section>;
      })}
    </div>
  </div>;
}
