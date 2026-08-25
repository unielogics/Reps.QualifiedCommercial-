"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, ExternalLink, Save, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { useMe } from "@/lib/useMe";

type Profile = {
  id: string;
  user_id: string;
  display_name: string | null;
  title: string | null;
  phone: string | null;
  display_email: string | null;
  short_bio: string | null;
  preferred_locale: "en" | "es";
  card_visible: boolean;
  headshot_s3_key: string | null;
  headshot_url: string | null;
  booking_url: string | null;
  application_url: string;
  updated_at: string;
};

type UploadContract = { upload_url: string; headers: Record<string, string>; s3_key: string };

type ProfileForm = {
  display_name: string;
  title: string;
  phone: string;
  display_email: string;
  short_bio: string;
  preferred_locale: "en" | "es";
  card_visible: boolean;
  headshot_s3_key: string | null;
};

const EMPTY: ProfileForm = { display_name: "", title: "", phone: "", display_email: "", short_bio: "", preferred_locale: "en", card_visible: true, headshot_s3_key: null };

export default function FieldDeskSettingsPage() {
  const { getToken } = useAuth();
  const { isSuperAdmin } = useMe();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<ProfileForm>(EMPTY);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);

  const profile = useQuery({
    queryKey: ["field-desk-profile"],
    queryFn: async () => api<Profile>("/dealer-os/me/profile", { authToken: (await getToken()) ?? undefined }),
  });
  const teamProfiles = useQuery({
    queryKey: ["field-desk-profiles", "admin"],
    enabled: isSuperAdmin,
    queryFn: async () => api<{ items: Profile[] }>("/dealer-os/admin/rep-profiles", { authToken: (await getToken()) ?? undefined }),
  });

  useEffect(() => {
    if (!profile.data) return;
    setForm({
      display_name: profile.data.display_name ?? "",
      title: profile.data.title ?? "",
      phone: profile.data.phone ?? "",
      display_email: profile.data.display_email ?? "",
      short_bio: profile.data.short_bio ?? "",
      preferred_locale: profile.data.preferred_locale,
      card_visible: profile.data.card_visible,
      headshot_s3_key: profile.data.headshot_s3_key,
    });
  }, [profile.data]);

  const save = useMutation<Profile, Error, ProfileForm>({
    mutationFn: async (next) => api<Profile>("/dealer-os/me/profile", { method: "PUT", authToken: (await getToken()) ?? undefined, body: JSON.stringify(next) }),
    onSuccess: async () => { setMessage("Profile saved. New business-card shares will use these details."); await queryClient.invalidateQueries({ queryKey: ["field-desk-profile"] }); },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Profile could not be saved."),
  });

  const uploadHeadshot = async (file: File) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return setMessage("Use a JPEG, PNG, or WebP image.");
    if (file.size > 8 * 1024 * 1024) return setMessage("Headshot must be 8 MB or smaller.");
    setUploading(true);
    setMessage("");
    try {
      const contract = await api<UploadContract>("/dealer-os/me/profile/headshot/upload-init", { method: "POST", authToken: (await getToken()) ?? undefined, body: JSON.stringify({ filename: file.name, content_type: file.type }) });
      const response = await fetch(contract.upload_url, { method: "PUT", headers: contract.headers, body: file });
      if (!response.ok) throw new Error("Secure image upload failed.");
      const next = { ...form, headshot_s3_key: contract.s3_key };
      setForm(next);
      await save.mutateAsync(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Headshot could not be uploaded.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const cardName = form.display_name || "Your name";
  return <div className="settingsPage">
    <header className="hd"><div><span className="eyebrow">Field Desk identity</span><h2>Settings</h2><p className="lede">Manage the profile used by Inbox business cards, booking links, and client presentations.</p></div><button className="btn pri" disabled={save.isPending || uploading} onClick={() => save.mutate(form)}><Save size={17} /> {save.isPending ? "Saving…" : "Save profile"}</button></header>
    <div className="settingsLayout mt">
      <section className="panel settingsFormPanel"><div className="panelTitle"><div><h3>Business-card profile</h3><span>Visible only when you share your card.</span></div></div><div className="settingsForm">
        <div className="headshotEditor"><button type="button" className="headshotButton" onClick={() => fileInput.current?.click()} disabled={uploading}>{profile.data?.headshot_url ? <img src={profile.data.headshot_url} alt={cardName} /> : <UserRound size={34} />}<span><Camera size={15} /></span></button><div><b>Agent headshot</b><p>JPEG, PNG, or WebP. Square photos work best.</p><button className="btn" type="button" onClick={() => fileInput.current?.click()} disabled={uploading}>{uploading ? "Uploading…" : "Choose photo"}</button></div><input ref={fileInput} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={(event) => event.target.files?.[0] && void uploadHeadshot(event.target.files[0])} /></div>
        <div className="fieldGrid"><label><span>Display name</span><input className="field" value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} /></label><label><span>Title</span><input className="field" placeholder="Commercial Funding Advisor" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label><span>Display email</span><input className="field" type="email" value={form.display_email} onChange={(event) => setForm({ ...form, display_email: event.target.value })} /></label><label><span>Phone</span><input className="field" inputMode="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label><label><span>Preferred card language</span><select className="field" value={form.preferred_locale} onChange={(event) => setForm({ ...form, preferred_locale: event.target.value as "en" | "es" })}><option value="en">English</option><option value="es">Español</option></select></label><label className="settingsToggle"><span><b>Public card enabled</b><small>Allow active shared links to show your current corrections.</small></span><input type="checkbox" checked={form.card_visible} onChange={(event) => setForm({ ...form, card_visible: event.target.checked })} /></label><label className="full"><span>Short bio</span><textarea className="field" rows={5} value={form.short_bio} onChange={(event) => setForm({ ...form, short_bio: event.target.value })} placeholder="A concise introduction for clients receiving your card." /></label></div>
        {message && <div className="settingsMessage" role="status">{message}</div>}
      </div></section>
      <aside className="businessCardPreview"><span className="eyebrow">Live preview</span><div className="digitalCard"><div className="digitalCardBrand"><img src="/qc-icon.svg" alt="" /><span>Qualified Commercial</span></div><div className="digitalCardIdentity">{profile.data?.headshot_url ? <img src={profile.data.headshot_url} alt="" /> : <span><UserRound size={30} /></span>}<div><h3>{cardName}</h3><p>{form.title || "Commercial Funding Advisor"}</p></div></div><p>{form.short_bio || "Your short professional introduction will appear here."}</p><dl><div><dt>Email</dt><dd>{form.display_email || "Not displayed"}</dd></div><div><dt>Phone</dt><dd>{form.phone || "Not displayed"}</dd></div></dl><div className="digitalCardActions">{profile.data?.booking_url && <a className="btn pri" href={profile.data.booking_url} target="_blank" rel="noreferrer">Book a time <ExternalLink size={14} /></a>}<a className="btn" href={profile.data?.application_url ?? "/?new=1"}>Open application</a></div></div></aside>
    </div>
    {isSuperAdmin && <section className="panel mt"><div className="panelTitle"><div><h3>Team card readiness</h3><span>Review which Field Desk identities are complete.</span></div></div><div className="settingsTeamList">{(teamProfiles.data?.items ?? []).map((row) => <div key={row.user_id}><span className="teamAvatar">{row.headshot_url ? <img src={row.headshot_url} alt="" /> : <UserRound size={17} />}</span><span><b>{row.display_name || row.display_email}</b><small>{row.title || "Title missing"}</small></span><span className={`cellchip ${row.card_visible && row.headshot_url && row.phone ? "c-ok" : "c-warn"}`}>{row.card_visible && row.headshot_url && row.phone ? "Ready" : "Needs setup"}</span></div>)}</div></section>}
  </div>;
}
