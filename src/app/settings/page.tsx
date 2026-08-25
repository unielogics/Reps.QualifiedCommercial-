"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, ExternalLink, Pencil, Save, ShieldCheck, UserRound, X } from "lucide-react";
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

function toForm(profile: Profile): ProfileForm {
  return {
    display_name: profile.display_name ?? "",
    title: profile.title ?? "",
    phone: profile.phone ?? "",
    display_email: profile.display_email ?? "",
    short_bio: profile.short_bio ?? "",
    preferred_locale: profile.preferred_locale,
    card_visible: profile.card_visible,
    headshot_s3_key: profile.headshot_s3_key,
  };
}

function profilePayload(form: ProfileForm) {
  return { ...form, display_email: form.display_email.trim() || null };
}

export default function FieldDeskSettingsPage() {
  const { getToken } = useAuth();
  const { isSuperAdmin } = useMe();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const teamFileInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<ProfileForm>(EMPTY);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [selectedTeamProfile, setSelectedTeamProfile] = useState<Profile | null>(null);
  const [teamForm, setTeamForm] = useState<ProfileForm>(EMPTY);
  const [teamMessage, setTeamMessage] = useState("");
  const [teamUploading, setTeamUploading] = useState(false);

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
    setForm(toForm(profile.data));
  }, [profile.data]);

  const save = useMutation<Profile, Error, ProfileForm>({
    mutationFn: async (next) => api<Profile>("/dealer-os/me/profile", { method: "PUT", authToken: (await getToken()) ?? undefined, body: JSON.stringify(profilePayload(next)) }),
    onSuccess: async () => { setMessage("Profile saved. New business-card shares will use these details."); await queryClient.invalidateQueries({ queryKey: ["field-desk-profile"] }); },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Profile could not be saved."),
  });

  const saveTeamProfile = useMutation<Profile, Error, { userId: string; form: ProfileForm }>({
    mutationFn: async ({ userId, form: next }) => api<Profile>(`/dealer-os/admin/rep-profiles/${userId}`, {
      method: "PUT",
      authToken: (await getToken()) ?? undefined,
      body: JSON.stringify(profilePayload(next)),
    }),
    onSuccess: async (updated) => {
      setSelectedTeamProfile(updated);
      setTeamForm(toForm(updated));
      setTeamMessage("Employee card saved. Existing public card links now show these corrections.");
      await queryClient.invalidateQueries({ queryKey: ["field-desk-profiles", "admin"] });
    },
    onError: (error) => setTeamMessage(error.message || "Employee card could not be saved."),
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

  const openTeamEditor = (row: Profile) => {
    setSelectedTeamProfile(row);
    setTeamForm(toForm(row));
    setTeamMessage("");
  };

  const uploadTeamHeadshot = async (file: File) => {
    if (!selectedTeamProfile) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setTeamMessage("Use a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setTeamMessage("Headshot must be 8 MB or smaller.");
      return;
    }
    setTeamUploading(true);
    setTeamMessage("");
    try {
      const contract = await api<UploadContract>(`/dealer-os/admin/rep-profiles/${selectedTeamProfile.user_id}/headshot/upload-init`, {
        method: "POST",
        authToken: (await getToken()) ?? undefined,
        body: JSON.stringify({ filename: file.name, content_type: file.type }),
      });
      const response = await fetch(contract.upload_url, { method: "PUT", headers: contract.headers, body: file });
      if (!response.ok) throw new Error("Secure image upload failed.");
      const next = { ...teamForm, headshot_s3_key: contract.s3_key };
      setTeamForm(next);
      await saveTeamProfile.mutateAsync({ userId: selectedTeamProfile.user_id, form: next });
    } catch (error) {
      setTeamMessage(error instanceof Error ? error.message : "Headshot could not be uploaded.");
    } finally {
      setTeamUploading(false);
      if (teamFileInput.current) teamFileInput.current.value = "";
    }
  };

  const cardName = form.display_name || "Your name";
  return <div className="settingsPage">
    <header className="hd"><div><span className="eyebrow">Field Desk identity</span><h2>Settings</h2><p className="lede">Manage the profile used by Inbox business cards, booking links, and client presentations.</p></div><button className="btn pri" disabled={save.isPending || uploading} onClick={() => save.mutate(form)}><Save size={17} /> {save.isPending ? "Saving…" : "Save profile"}</button></header>
    <div className="settingsLayout mt">
      <section className="panel settingsFormPanel"><div className="panelTitle"><div><h3>Business-card profile</h3><span>Visible only when you share your card.</span></div></div><div className="settingsForm">
        <div className="headshotEditor"><label className={`headshotButton${uploading ? " isDisabled" : ""}`} htmlFor="profile-headshot-input" aria-label="Choose agent headshot">{profile.data?.headshot_url ? <img src={profile.data.headshot_url} alt={cardName} /> : <UserRound size={34} />}<span><Camera size={15} /></span></label><div><b>Agent headshot</b><p>JPEG, PNG, or WebP. Square photos work best.</p><label className={`btn settingsFileTrigger${uploading ? " isDisabled" : ""}`} htmlFor="profile-headshot-input">{uploading ? "Uploading…" : "Choose photo"}</label></div><input ref={fileInput} id="profile-headshot-input" className="nativeFileInput" type="file" disabled={uploading} accept="image/*,.jpg,.jpeg,.png,.webp" onChange={(event) => event.target.files?.[0] && void uploadHeadshot(event.target.files[0])} /></div>
        <div className="fieldGrid"><label><span>Display name</span><input className="field" value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} /></label><label><span>Title</span><input className="field" placeholder="Commercial Funding Advisor" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label><span>Display email</span><input className="field" type="email" value={form.display_email} onChange={(event) => setForm({ ...form, display_email: event.target.value })} /></label><label><span>Phone</span><input className="field" inputMode="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label><label><span>Preferred card language</span><select className="field" value={form.preferred_locale} onChange={(event) => setForm({ ...form, preferred_locale: event.target.value as "en" | "es" })}><option value="en">English</option><option value="es">Español</option></select></label><label className="settingsToggle"><span><b>Public card enabled</b><small>Allow active shared links to show your current corrections.</small></span><input type="checkbox" checked={form.card_visible} onChange={(event) => setForm({ ...form, card_visible: event.target.checked })} /></label><label className="full"><span>Short bio</span><textarea className="field" rows={5} value={form.short_bio} onChange={(event) => setForm({ ...form, short_bio: event.target.value })} placeholder="A concise introduction for clients receiving your card." /></label></div>
        {message && <div className="settingsMessage" role="status">{message}</div>}
      </div></section>
      <aside className="businessCardPreview"><span className="eyebrow">Live preview</span><div className="digitalCard"><div className="digitalCardBrand"><img src="/qc-icon.svg" alt="" /><span>Qualified Commercial</span></div><div className="digitalCardIdentity">{profile.data?.headshot_url ? <img src={profile.data.headshot_url} alt="" /> : <span><UserRound size={30} /></span>}<div><h3>{cardName}</h3><p>{form.title || "Commercial Funding Advisor"}</p></div></div><p>{form.short_bio || "Your short professional introduction will appear here."}</p><dl><div><dt>Email</dt><dd>{form.display_email || "Not displayed"}</dd></div><div><dt>Phone</dt><dd>{form.phone || "Not displayed"}</dd></div></dl><div className="digitalCardActions">{profile.data?.booking_url && <a className="btn pri" href={profile.data.booking_url} target="_blank" rel="noreferrer">Book a time <ExternalLink size={14} /></a>}<a className="btn" href={profile.data?.application_url ?? "/?new=1"}>Open application</a></div></div></aside>
    </div>
    {isSuperAdmin && <section className="panel mt"><div className="panelTitle"><div><h3>Employee business cards</h3><span>Super admins can review and correct every Field Desk profile.</span></div><span className="settingsAdminBadge"><ShieldCheck size={15} /> Super-admin controls</span></div><div className="settingsTeamList">{(teamProfiles.data?.items ?? []).map((row) => <div key={row.user_id}><span className="teamAvatar">{row.headshot_url ? <img src={row.headshot_url} alt="" /> : <UserRound size={17} />}</span><span><b>{row.display_name || row.display_email || "Unnamed employee"}</b><small>{row.title || "Title missing"}</small></span><span className={`cellchip ${row.card_visible && row.headshot_url && row.phone ? "c-ok" : "c-warn"}`}>{row.card_visible && row.headshot_url && row.phone ? "Ready" : "Needs setup"}</span><button className="iconBtn" type="button" title={`Edit ${row.display_name || "employee"} card`} onClick={() => openTeamEditor(row)}><Pencil size={16} /></button></div>)}</div>
      {selectedTeamProfile && <div className="settingsAdminEditor"><header><div><span className="eyebrow">Editing employee card</span><h3>{teamForm.display_name || selectedTeamProfile.display_email || "Field Desk employee"}</h3></div><button className="iconBtn" type="button" title="Close editor" onClick={() => setSelectedTeamProfile(null)}><X size={18} /></button></header><div className="settingsAdminEditorBody"><div className="headshotEditor"><label className={`headshotButton${teamUploading ? " isDisabled" : ""}`} htmlFor="team-profile-headshot-input" aria-label="Choose employee headshot">{selectedTeamProfile.headshot_url ? <img src={selectedTeamProfile.headshot_url} alt={teamForm.display_name} /> : <UserRound size={34} />}<span><Camera size={15} /></span></label><div><b>Employee headshot</b><p>Upload a corrected JPEG, PNG, or WebP image.</p><label className={`btn settingsFileTrigger${teamUploading ? " isDisabled" : ""}`} htmlFor="team-profile-headshot-input">{teamUploading ? "Uploading…" : "Choose photo"}</label></div><input ref={teamFileInput} id="team-profile-headshot-input" className="nativeFileInput" type="file" disabled={teamUploading} accept="image/*,.jpg,.jpeg,.png,.webp" onChange={(event) => event.target.files?.[0] && void uploadTeamHeadshot(event.target.files[0])} /></div><div className="fieldGrid"><label><span>Display name</span><input className="field" value={teamForm.display_name} onChange={(event) => setTeamForm({ ...teamForm, display_name: event.target.value })} /></label><label><span>Title</span><input className="field" value={teamForm.title} onChange={(event) => setTeamForm({ ...teamForm, title: event.target.value })} /></label><label><span>Display email</span><input className="field" type="email" value={teamForm.display_email} onChange={(event) => setTeamForm({ ...teamForm, display_email: event.target.value })} /></label><label><span>Phone</span><input className="field" inputMode="tel" value={teamForm.phone} onChange={(event) => setTeamForm({ ...teamForm, phone: event.target.value })} /></label><label><span>Preferred language</span><select className="field" value={teamForm.preferred_locale} onChange={(event) => setTeamForm({ ...teamForm, preferred_locale: event.target.value as "en" | "es" })}><option value="en">English</option><option value="es">Español</option></select></label><label className="settingsToggle"><span><b>Public card enabled</b><small>Disable to hide all active links for this employee.</small></span><input type="checkbox" checked={teamForm.card_visible} onChange={(event) => setTeamForm({ ...teamForm, card_visible: event.target.checked })} /></label><label className="full"><span>Short bio</span><textarea className="field" rows={4} value={teamForm.short_bio} onChange={(event) => setTeamForm({ ...teamForm, short_bio: event.target.value })} /></label></div>{teamMessage && <div className="settingsMessage" role="status">{teamMessage}</div>}<div className="settingsAdminActions"><button className="btn" type="button" onClick={() => setSelectedTeamProfile(null)}>Cancel</button><button className="btn pri" type="button" disabled={saveTeamProfile.isPending || teamUploading} onClick={() => saveTeamProfile.mutate({ userId: selectedTeamProfile.user_id, form: teamForm })}><Save size={16} /> {saveTeamProfile.isPending ? "Saving…" : "Save employee card"}</button></div></div></div>}
    </section>}
  </div>;
}
