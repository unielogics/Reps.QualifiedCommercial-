// MIRROR: keep identical to QCRep/src/production-package/*
import { useState } from "react";
import type { PackageClient } from "./client";
import { dateLabel, errorDetail, errorMessage, whenLabel } from "./format";
import { IconLink } from "./icons";
import { Overlay, PBtn, PChip } from "./ui";
import type { ProductionPackage } from "./types";

export function ShareDrawer({ client, pkg, team, open, onClose, onPackage }: {
  client: PackageClient; pkg: ProductionPackage; team: Array<{ id: string; name: string; email: string; role: string }>;
  open: boolean; onClose: () => void; onPackage: (p: ProductionPackage) => void;
}) {
  const reps = team.filter((t) => t.role === "field_rep");
  const [repId, setRepId] = useState("");
  const [label, setLabel] = useState("");
  const [days, setDays] = useState(14);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outside, setOutside] = useState<{ rep_name?: string; message?: string } | null>(null);
  const [minted, setMinted] = useState<{ url: string; expires_at: string } | null>(null);

  const create = async (outsideBook = false) => {
    setBusy(true); setError(null);
    try {
      const res = await client.createShareLink!({ rep_user_id: repId, label: label || undefined, expires_in_days: days, outside_book: outsideBook });
      setMinted({ url: res.url, expires_at: res.expires_at });
      setOutside(null);
      onPackage(await client.load());
    } catch (err) {
      const detail = errorDetail(err);
      if (detail?.code === "outside_book") setOutside({ rep_name: String(detail.rep_name ?? ""), message: String(detail.message ?? "") });
      else setError(errorMessage(err, "The link could not be created."));
    } finally { setBusy(false); }
  };
  const revoke = async (id: string) => {
    setBusy(true);
    try { await client.revokeShareLink!(id); onPackage(await client.load()); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <Overlay open={open} onClose={onClose} title="Share with a field representative">
      <p className="pp-sub">The link opens in the rep app. The rep must be signed in, and only the rep it was issued to can use it. They can edit every step except the sponsor until the package is sent, generate the presentation PDF, and request the dealer&apos;s signature on stage one. The final is sent by the desk and is never shared.</p>
      {pkg.stage === 2 ? <PChip tone="warn">The final package is never shared with a rep.</PChip> : pkg.status !== "draft" ? <PChip tone="warn">This package is no longer a draft; existing links are read-only.</PChip> : null}
      <div className="pp-grid" style={{ marginTop: 10 }}>
        <label className="pp-field span-2"><span className="pp-lbl">Field representative</span>
          <select className="pp-input" value={repId} onChange={(e) => setRepId(e.target.value)}><option value="">Choose…</option>{reps.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.email}</option>)}</select></label>
        <label className="pp-field"><span className="pp-lbl">Expires in</span>
          <select className="pp-input" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[7, 14, 30].map((d) => <option key={d} value={d}>{d} days</option>)}</select></label>
        <label className="pp-field span-3"><span className="pp-lbl">Note (optional)</span><input className="pp-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Onsite review on Thursday" /></label>
      </div>
      {outside ? (
        <div className="pp-inline">
          <b>{outside.rep_name} does not own this dealer file.</b><p className="pp-sub">{outside.message}</p>
          <div className="pp-row"><PBtn variant="pri" size="sm" onClick={() => create(true)} busy={busy}>Share anyway</PBtn><PBtn size="sm" onClick={() => setOutside(null)}>Cancel</PBtn></div>
        </div>
      ) : null}
      <div className="pp-row" style={{ marginTop: 8 }}>
        <PBtn variant="pri" onClick={() => create(false)} busy={busy} disabled={!repId || pkg.status !== "draft" || !pkg.capabilities.can_share}>Create link</PBtn>
        {error ? <span className="pp-hint bad">{error}</span> : null}
      </div>
      {minted ? (
        <div className="pp-inline ok">
          <b><IconLink />Link created — copy it now; it is not shown again.</b>
          <div className="pp-row"><input className="pp-input" readOnly value={minted.url} onFocus={(e) => e.currentTarget.select()} /><PBtn size="sm" onClick={() => navigator.clipboard?.writeText(minted.url)}>Copy</PBtn></div>
          <span className="pp-sub">Expires {dateLabel(minted.expires_at)}.</span>
        </div>
      ) : null}
      <h4 className="pp-sect" style={{ marginTop: 16 }}>Links</h4>
      {pkg.share_links.length ? (
        <table className="pp-tbl"><thead><tr><th>Rep</th><th>Note</th><th>Expires</th><th>Used</th><th /></tr></thead>
          <tbody>{pkg.share_links.map((l) => <tr key={l.id} className={l.active ? "" : "off"}><td><b>{l.rep_name ?? l.rep_user_id}</b>{l.outside_book ? <PChip tone="warn">outside book</PChip> : null}</td><td className="muted">{l.label ?? "—"}</td><td>{l.revoked_at ? <PChip tone="mut">Revoked</PChip> : <>{dateLabel(l.expires_at)}{!l.active ? <PChip tone="mut">Expired</PChip> : null}</>}</td><td className="muted">{l.use_count ? `${l.use_count}× · last ${whenLabel(l.last_used_at)}` : "never"}</td><td className="n">{l.active ? <PBtn size="sm" variant="danger" onClick={() => revoke(l.id)} busy={busy}>Revoke</PBtn> : null}</td></tr>)}</tbody></table>
      ) : <p className="pp-sub">No links yet.</p>}
    </Overlay>
  );
}
