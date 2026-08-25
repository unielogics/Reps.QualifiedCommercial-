"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import { api } from "@/lib/api";

export type TaxonomyEntry = {
  id: string;
  level: 2 | 3 | 6;
  code: string | null;
  label: string;
  parent_id: string | null;
  status: "official" | "approved" | "pending";
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

function TaxonomyCombobox({
  label,
  placeholder,
  level,
  parentId,
  value,
  disabled,
  locale,
  onSelect,
}: {
  label: string;
  placeholder: string;
  level: 2 | 3 | 6;
  parentId?: string | null;
  value: TaxonomyEntry | null;
  disabled?: boolean;
  locale: "en" | "es";
  onSelect: (entry: TaxonomyEntry | null) => void;
}) {
  const { getToken } = useAuth();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [addingCustom, setAddingCustom] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [customCode, setCustomCode] = useState("");
  const search = query.trim();
  const rows = useQuery({
    queryKey: ["field-desk-taxonomy", level, parentId ?? null, search],
    enabled: !disabled && (level === 2 || Boolean(parentId)),
    queryFn: async () => {
      const params = new URLSearchParams({ level: String(level), page_size: "100" });
      if (parentId) params.set("parent_id", parentId);
      if (search) params.set("q", search);
      return api<{ items: TaxonomyEntry[] }>(`/application-profiles/taxonomy/search?${params}`, {
        authToken: (await getToken()) ?? undefined,
      });
    },
  });
  const contribute = useMutation({
    mutationFn: async () => api<TaxonomyEntry>("/dealer-os/product-finder/taxonomy/contributions", {
      method: "POST",
      authToken: (await getToken()) ?? undefined,
      body: JSON.stringify({
        level,
        label: customLabel.trim(),
        code: level === 6 ? customCode.trim() : null,
        parent_id: parentId || null,
      }),
    }),
    onSuccess: (entry) => {
      onSelect(entry);
      setAddingCustom(false);
      setCustomLabel("");
      setCustomCode("");
      setOpen(false);
    },
  });

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  useEffect(() => {
    setQuery("");
    setOpen(false);
  }, [parentId]);

  return (
    <div className="taxonomyField" ref={root}>
      <label className="lbl">{label}</label>
      <button
        type="button"
        className="taxonomyTrigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{value ? `${value.code ? `${value.code} · ` : ""}${value.label}` : placeholder}</span>
        {value ? (
          <X
            size={15}
            aria-label={`Clear ${label}`}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(null);
            }}
          />
        ) : <ChevronDown size={16} />}
      </button>
      {open && !disabled && (
        <div className="taxonomyMenu">
          <div className="taxonomySearch"><Search size={15} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or NAICS code" /></div>
          <div className="taxonomyOptions" role="listbox">
            {rows.isLoading && <div className="taxonomyEmpty">Searching classifications…</div>}
            {!rows.isLoading && !(rows.data?.items.length) && <div className="taxonomyEmpty">No matching classification.</div>}
            {(rows.data?.items ?? []).map((entry) => (
              <button
                type="button"
                role="option"
                aria-selected={entry.id === value?.id}
                key={entry.id}
                onClick={() => { onSelect(entry); setQuery(""); setOpen(false); }}
              >
                <span><b>{entry.code || "Custom"}</b><small>{entry.label}</small></span>
                {entry.id === value?.id && <Check size={16} />}
              </button>
            ))}
          </div>
          {!addingCustom ? (
            <button type="button" className="taxonomyCustomAction" onClick={() => setAddingCustom(true)}>
              <Plus size={15} /> {locale === "es" ? "Sugerir una clasificacion" : "Suggest a custom classification"}
            </button>
          ) : (
            <div className="taxonomyCustomForm">
              <input value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} placeholder={locale === "es" ? "Nombre de la actividad" : "Classification name"} />
              {level === 6 && <input value={customCode} inputMode="numeric" maxLength={6} onChange={(event) => setCustomCode(event.target.value.replace(/\D/g, ""))} placeholder={locale === "es" ? "Codigo NAICS de 6 digitos" : "6-digit NAICS code"} />}
              {contribute.isError && <small>{contribute.error instanceof Error ? contribute.error.message : "Unable to save classification."}</small>}
              <div><button type="button" onClick={() => setAddingCustom(false)}>{locale === "es" ? "Cancelar" : "Cancel"}</button><button type="button" disabled={customLabel.trim().length < 2 || (level === 6 && customCode.length !== 6) || contribute.isPending} onClick={() => contribute.mutate()}>{contribute.isPending ? "Saving…" : locale === "es" ? "Guardar sugerencia" : "Save suggestion"}</button></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
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
  const [industryEntry, setIndustryEntry] = useState<TaxonomyEntry | null>(null);
  const [subindustryEntry, setSubindustryEntry] = useState<TaxonomyEntry | null>(null);
  const [activityEntry, setActivityEntry] = useState<TaxonomyEntry | null>(null);
  const labels = locale === "es" ? {
    category: "Categoria de industria",
    subcategory: "Subcategoria",
    activity: "NAICS / actividad comercial",
    chooseCategory: "Seleccione una categoria",
    chooseSubcategory: "Seleccione primero una categoria",
    chooseActivity: "Seleccione primero una subcategoria",
    final: "Clasificacion seleccionada",
  } : {
    category: "Industry category",
    subcategory: "Industry subcategory",
    activity: "NAICS / business activity",
    chooseCategory: "Select a category",
    chooseSubcategory: "Select a category first",
    chooseActivity: "Select a subcategory first",
    final: "Selected classification",
  };

  useEffect(() => {
    const status = value.taxonomy_status === "pending" ? "pending" : "official";
    setIndustryEntry(value.industry_entry_id ? {
      id: value.industry_entry_id,
      level: 2,
      code: value.industry || null,
      label: value.industry_label,
      parent_id: null,
      status,
    } : null);
    setSubindustryEntry(value.subindustry_entry_id ? {
      id: value.subindustry_entry_id,
      level: 3,
      code: value.subindustry || null,
      label: value.subindustry_label,
      parent_id: value.industry_entry_id,
      status,
    } : null);
    setActivityEntry(value.activity_entry_id ? {
      id: value.activity_entry_id,
      level: 6,
      code: value.naics_code || null,
      label: value.naics_label,
      parent_id: value.subindustry_entry_id,
      status,
    } : null);
  }, [
    value.activity_entry_id,
    value.industry,
    value.industry_entry_id,
    value.industry_label,
    value.naics_code,
    value.naics_label,
    value.subindustry,
    value.subindustry_entry_id,
    value.subindustry_label,
    value.taxonomy_status,
  ]);

  const selectIndustry = (entry: TaxonomyEntry | null) => {
    setIndustryEntry(entry);
    setSubindustryEntry(null);
    setActivityEntry(null);
    onChange({
      ...EMPTY,
      industry_entry_id: entry?.id ?? null,
      industry: entry?.code ?? "",
      industry_label: entry?.label ?? "",
      taxonomy_status: entry?.status === "pending" ? "pending" : "unclassified",
    });
  };
  const selectSubindustry = (entry: TaxonomyEntry | null) => {
    setSubindustryEntry(entry);
    setActivityEntry(null);
    onChange({
      ...value,
      subindustry_entry_id: entry?.id ?? null,
      subindustry: entry?.code ?? "",
      subindustry_label: entry?.label ?? "",
      activity_entry_id: null,
      naics_code: "",
      naics_label: "",
      taxonomy_status: entry?.status === "pending" || industryEntry?.status === "pending" ? "pending" : "unclassified",
    });
  };
  const selectActivity = (entry: TaxonomyEntry | null) => {
    setActivityEntry(entry);
    onChange({
      ...value,
      activity_entry_id: entry?.id ?? null,
      naics_code: entry?.code ?? "",
      naics_label: entry?.label ?? "",
      taxonomy_status: entry
        ? [industryEntry, subindustryEntry, entry].some((item) => item?.status === "pending") ? "pending" : "official"
        : "unclassified",
    });
  };

  return (
    <div className="taxonomyCascade full">
      <TaxonomyCombobox label={labels.category} placeholder={labels.chooseCategory} level={2} value={industryEntry} locale={locale} onSelect={selectIndustry} />
      <TaxonomyCombobox label={labels.subcategory} placeholder={labels.chooseSubcategory} level={3} parentId={industryEntry?.id} value={subindustryEntry} disabled={!industryEntry} locale={locale} onSelect={selectSubindustry} />
      <TaxonomyCombobox label={labels.activity} placeholder={labels.chooseActivity} level={6} parentId={subindustryEntry?.id} value={activityEntry} disabled={!subindustryEntry} locale={locale} onSelect={selectActivity} />
      {value.naics_code && <div className="taxonomySelection"><Check size={16} /><span><small>{labels.final}</small><b>{value.naics_code} · {value.naics_label}</b></span></div>}
    </div>
  );
}
