"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronRight, Factory, Plus, Search, X } from "lucide-react";
import { api } from "@/lib/api";

export type TaxonomyEntry = {
  id: string;
  level: 2 | 3 | 6;
  code: string | null;
  label: string;
  parent_id: string | null;
  status: "official" | "approved" | "pending";
  path?: Array<{
    id: string;
    level: 2 | 3 | 6;
    code: string | null;
    label: string;
    parent_id: string | null;
  }>;
};

export type ProductFinderTaxonomyValue = {
  industry_entry_id: string | null;
  industry: string;
  industry_label: string;
  subindustry_entry_id: string | null;
  subindustry: string;
  subindustry_label: string;
  activity_entry_id: string | null;
  naics_code: string;
  naics_label: string;
  taxonomy_status: "official" | "pending" | "unclassified";
};

const EMPTY: ProductFinderTaxonomyValue = {
  industry_entry_id: null,
  industry: "",
  industry_label: "",
  subindustry_entry_id: null,
  subindustry: "",
  subindustry_label: "",
  activity_entry_id: null,
  naics_code: "",
  naics_label: "",
  taxonomy_status: "unclassified",
};

function entriesFromValue(value: ProductFinderTaxonomyValue): TaxonomyEntry[] {
  const status = value.taxonomy_status === "pending" ? "pending" : "official";
  const rows: TaxonomyEntry[] = [];
  if (value.industry_entry_id) rows.push({ id: value.industry_entry_id, level: 2, code: value.industry || null, label: value.industry_label, parent_id: null, status });
  if (value.subindustry_entry_id) rows.push({ id: value.subindustry_entry_id, level: 3, code: value.subindustry || null, label: value.subindustry_label, parent_id: value.industry_entry_id, status });
  if (value.activity_entry_id) rows.push({ id: value.activity_entry_id, level: 6, code: value.naics_code || null, label: value.naics_label, parent_id: value.subindustry_entry_id, status });
  return rows;
}

function resultPath(entry: TaxonomyEntry): TaxonomyEntry[] {
  if (!entry.path?.length) return [entry];
  return entry.path.map((item) => ({ ...item, status: item.id === entry.id ? entry.status : "official" }));
}

export default function ProductFinderTaxonomy({
  value = EMPTY,
  onChange,
  locale,
}: {
  value?: ProductFinderTaxonomyValue;
  onChange: (value: ProductFinderTaxonomyValue) => void;
  locale: "en" | "es";
}) {
  const { getToken } = useAuth();
  const dialog = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState<TaxonomyEntry[]>(() => entriesFromValue(value));
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [customOpen, setCustomOpen] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [customCode, setCustomCode] = useState("");
  const text = locale === "es" ? {
    label: "Industria y actividad NAICS", placeholder: "Seleccione la actividad comercial",
    title: "Buscar actividad comercial", help: "Explore por categoria o busque por nombre, actividad o codigo NAICS.",
    root: "Todas las industrias", search: "Buscar industria, actividad o codigo NAICS",
    category: "Categoria", subcategory: "Subcategoria", activity: "Actividad NAICS de 6 digitos",
    empty: "No se encontraron clasificaciones.", custom: "Sugerir una clasificacion",
    customName: "Nombre de la clasificacion", customCode: "Codigo NAICS de 6 digitos",
    cancel: "Cancelar", save: "Guardar sugerencia", selected: "Seleccion actual", clear: "Borrar",
    confirm: "Confirmar actividad", choose: "Seleccione una actividad de 6 digitos para continuar.",
  } : {
    label: "Industry and NAICS activity", placeholder: "Choose the business activity",
    title: "Find the business activity", help: "Drill down by category or search by industry name, activity, or NAICS code.",
    root: "All industries", search: "Search industry, activity, or NAICS code",
    category: "Category", subcategory: "Subcategory", activity: "Six-digit NAICS activity",
    empty: "No matching classifications.", custom: "Suggest a custom classification",
    customName: "Classification name", customCode: "Six-digit NAICS code",
    cancel: "Cancel", save: "Save suggestion", selected: "Current selection", clear: "Clear",
    confirm: "Confirm activity", choose: "Choose a six-digit activity to continue.",
  };

  useEffect(() => {
    if (!open) setPath(entriesFromValue(value));
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => searchInput.current?.focus(), 0);
    return () => { document.body.style.overflow = prior; };
  }, [open]);

  const search = query.trim();
  const currentLevel: 2 | 3 | 6 = path.length === 0 ? 2 : path.length === 1 ? 3 : 6;
  const parentId = currentLevel === 2 ? null : path[path.length - 1]?.id ?? null;
  const results = useQuery({
    queryKey: ["field-desk-taxonomy-drilldown", currentLevel, parentId, search],
    enabled: open,
    queryFn: async () => {
      const params = new URLSearchParams({ page_size: "100" });
      if (search) params.set("q", search);
      else {
        params.set("level", String(currentLevel));
        if (parentId) params.set("parent_id", parentId);
      }
      return api<{ items: TaxonomyEntry[] }>(`/application-profiles/taxonomy/search?${params}`, { authToken: (await getToken()) ?? undefined });
    },
  });
  const rows = results.data?.items ?? [];
  const selectedActivity = path.find((entry) => entry.level === 6) ?? null;
  const heading = currentLevel === 2 ? text.category : currentLevel === 3 ? text.subcategory : text.activity;

  const contribution = useMutation({
    mutationFn: async () => api<TaxonomyEntry>("/dealer-os/product-finder/taxonomy/contributions", {
      method: "POST",
      authToken: (await getToken()) ?? undefined,
      body: JSON.stringify({ level: currentLevel, label: customLabel.trim(), code: currentLevel === 6 ? customCode.trim() : null, parent_id: parentId }),
    }),
    onSuccess: (entry) => {
      setPath([...path.filter((item) => item.level < entry.level), entry]);
      setCustomOpen(false); setCustomLabel(""); setCustomCode(""); setQuery("");
    },
  });

  const choose = (entry: TaxonomyEntry) => {
    setPath(search ? resultPath(entry) : [...path.filter((item) => item.level < entry.level), entry]);
    setQuery(""); setActiveIndex(0);
  };

  const confirm = () => {
    const industry = path.find((entry) => entry.level === 2);
    const subindustry = path.find((entry) => entry.level === 3);
    const activity = path.find((entry) => entry.level === 6);
    if (!industry || !subindustry || !activity?.code) return;
    onChange({
      industry_entry_id: industry.id, industry: industry.code ?? "", industry_label: industry.label,
      subindustry_entry_id: subindustry.id, subindustry: subindustry.code ?? "", subindustry_label: subindustry.label,
      activity_entry_id: activity.id, naics_code: activity.code, naics_label: activity.label,
      taxonomy_status: path.some((entry) => entry.status === "pending") ? "pending" : "official",
    });
    setOpen(false);
  };

  const keyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(0, Math.min(rows.length - 1, current + (event.key === "ArrowDown" ? 1 : -1))));
    }
    if (event.key === "Enter" && document.activeElement === searchInput.current && rows[activeIndex]) { event.preventDefault(); choose(rows[activeIndex]); }
    if (event.key === "Tab" && dialog.current) {
      const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])"));
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  };

  const currentLabel = value.naics_code ? `${value.naics_code} · ${value.naics_label}` : text.placeholder;
  const pathLabel = useMemo(() => path.map((entry) => `${entry.code ? `${entry.code} · ` : ""}${entry.label}`).join(" / "), [path]);

  return (
    <div className="taxonomyDrilldown full">
      <label className="lbl">{text.label}</label>
      <button type="button" className="taxonomyDrilldownTrigger" onClick={() => setOpen(true)}>
        <span className="taxonomyTriggerIcon"><Factory size={19} /></span>
        <span><b>{currentLabel}</b><small>{value.naics_code ? `${value.industry_label} / ${value.subindustry_label}` : text.help}</small></span>
        <ChevronRight size={19} />
      </button>
      {open && (
        <div className="taxonomyOverlay" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <div ref={dialog} className="taxonomyDialog" role="dialog" aria-modal="true" aria-labelledby="taxonomy-dialog-title" onKeyDown={keyDown}>
            <header className="taxonomyDialogHeader">
              <div><span className="lbl">NAICS classification</span><h2 id="taxonomy-dialog-title">{text.title}</h2><p>{text.help}</p></div>
              <button type="button" className="iconAction" aria-label="Close NAICS finder" onClick={() => setOpen(false)}><X size={20} /></button>
            </header>
            <div className="taxonomyStickyTools">
              <div className="taxonomyGlobalSearch"><Search size={18} /><input ref={searchInput} value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} placeholder={text.search} /></div>
              <nav className="taxonomyBreadcrumb" aria-label="Classification path">
                <button type="button" onClick={() => { setPath([]); setQuery(""); }}><Factory size={15} /> {text.root}</button>
                {path.filter((entry) => entry.level < 6).map((entry) => <span key={entry.id}><ChevronRight size={14} /><button type="button" onClick={() => { setPath(path.filter((item) => item.level <= entry.level)); setQuery(""); }}>{entry.code || entry.label}</button></span>)}
              </nav>
            </div>
            <main className="taxonomyDialogBody">
              <div className="taxonomyLevelHeading">
                {path.length > 0 && <button type="button" aria-label="Back one classification level" onClick={() => { setPath((current) => current.slice(0, -1)); setQuery(""); }}><ArrowLeft size={18} /></button>}
                <div><span>{search ? "Search results" : `Step ${currentLevel === 2 ? 1 : currentLevel === 3 ? 2 : 3} of 3`}</span><h3>{search ? text.search : heading}</h3></div>
              </div>
              <div className="taxonomyDrillRows" role="listbox" aria-label={heading}>
                {results.isLoading && <div className="taxonomyEmpty">Searching classifications…</div>}
                {!results.isLoading && !rows.length && <div className="taxonomyEmpty">{text.empty}</div>}
                {rows.map((entry, index) => (
                  <button type="button" role="option" aria-selected={entry.id === selectedActivity?.id} className={index === activeIndex ? "active" : undefined} key={entry.id} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(entry)}>
                    <span className="taxonomyCodeBadge">{entry.code || "NEW"}</span>
                    <span><b>{entry.label}</b>{search && entry.path?.length ? <small>{entry.path.map((item) => item.label).join(" / ")}</small> : null}</span>
                    {entry.level === 6 ? <Check size={18} /> : <ChevronRight size={19} />}
                  </button>
                ))}
              </div>
              {!customOpen ? <button type="button" className="taxonomyCustomAction" onClick={() => setCustomOpen(true)}><Plus size={16} /> {text.custom}</button> : (
                <div className="taxonomyCustomForm">
                  <input value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} placeholder={text.customName} />
                  {currentLevel === 6 && <input value={customCode} inputMode="numeric" maxLength={6} onChange={(event) => setCustomCode(event.target.value.replace(/\D/g, ""))} placeholder={text.customCode} />}
                  {contribution.isError && <small>{contribution.error instanceof Error ? contribution.error.message : "Unable to save classification."}</small>}
                  <div><button type="button" onClick={() => setCustomOpen(false)}>{text.cancel}</button><button type="button" disabled={customLabel.trim().length < 2 || (currentLevel === 6 && customCode.length !== 6) || contribution.isPending} onClick={() => contribution.mutate()}>{text.save}</button></div>
                </div>
              )}
            </main>
            <footer className="taxonomyDialogFooter">
              <div><span>{text.selected}</span><b>{selectedActivity ? pathLabel : text.choose}</b></div>
              {value.activity_entry_id && <button type="button" className="btn" onClick={() => { onChange(EMPTY); setPath([]); setOpen(false); }}>{text.clear}</button>}
              <button type="button" className="btn pri" disabled={!selectedActivity?.code || path.length < 3} onClick={confirm}><Check size={17} /> {text.confirm}</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
