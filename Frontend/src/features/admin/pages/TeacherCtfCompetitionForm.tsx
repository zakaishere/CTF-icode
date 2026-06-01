"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { Trophy, KeyRound, AlertCircle, Save, FilePlus, RefreshCw, Loader2, Calendar, Timer, Hand, UserPlus, Upload, X as XIcon } from "lucide-react";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { toast } from "@/components/ui/PSPToast";
import {
  createTeacherCtfCompetition, updateTeacherCtfCompetition, getTeacherCtfCompetition,
  uploadCtfCoverImage,
  type CTFCompetitionCreateRequest,
} from "@/lib/api";
import { ApiException } from "@/lib/api";

// ── Helpers ────────────────────────────────────────────────────────────────────

function toLocalIso(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}
function defaultStart() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return toLocalIso(d).slice(0, 16);
}
function defaultEnd() {
  const d = new Date(Date.now() + 25 * 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return toLocalIso(d).slice(0, 16);
}
function durationLabel(startIso: string, endIso: string) {
  const start = new Date(startIso).getTime();
  const end   = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return "Invalid window";
  const totalMin = Math.round((end - start) / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} minute${m !== 1 ? "s" : ""}`;
  if (m === 0) return `${h} hour${h !== 1 ? "s" : ""}`;
  return `${h}h ${m}m`;
}

function fmtComputedEnd(startIso: string, totalMinutes: number): string {
  const start = new Date(startIso);
  if (isNaN(start.getTime()) || totalMinutes < 1) return "—";
  const end = new Date(start.getTime() + totalMinutes * 60_000);
  return end.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function generateAccessCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

// Banner colors live as bannerUrl in the backend — we store them as `color:#hex`
// so the field can hold either a real URL or a swatch token without a migration.
const BANNER_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#14b8a6",
  "#f59e0b", "#10b981", "#3b82f6", "#ef4444",
];

const SCORING: Array<{ value: "DYNAMIC" | "STATIC"; label: string; hint: string }> = [
  { value: "DYNAMIC", label: "Dynamic", hint: "Points decay as more teams solve" },
  { value: "STATIC",  label: "Static",  hint: "Fixed points per challenge" },
];
const VISIBILITY: Array<{ value: "PUBLIC" | "ACCESS_CODE"; label: string; hint: string }> = [
  { value: "PUBLIC",      label: "Public",       hint: "Appears in /ctf for everyone" },
  { value: "ACCESS_CODE", label: "Access code",  hint: "Only people with the code can join" },
];

// ── Page ───────────────────────────────────────────────────────────────────────

export default function TeacherCtfCompetitionFormPage({ editId, embedded }: { editId?: string; embedded?: boolean }) {
  const router = useRouter();
  const isEdit = Boolean(editId);

  const [loadingEdit, setLoadingEdit] = useState(isEdit);
  const [bannerColor, setBannerColor] = useState<string>(BANNER_COLORS[0]);
  const [timingMode, setTimingMode] = useState<"SCHEDULED" | "DURATION" | "MANUAL" | "REGISTRATION">("SCHEDULED");
  const [durationH, setDurationH] = useState(24);
  const [durationM, setDurationM] = useState(0);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [form, setForm] = useState<CTFCompetitionCreateRequest>({
    title:        "",
    description:  "",
    startTime:    defaultStart(),
    endTime:      defaultEnd(),
    maxTeamSize:  4,
    minTeamSize:  1,
    scoringMode:  "DYNAMIC",
    dynamicMinPoints:   50,
    dynamicDecayFactor: 0.08,
    visibility:   "PUBLIC",
    accessCode:   "",
    bannerUrl:    `color:${BANNER_COLORS[0]}`,
  });

  const [submitting, setSubmitting] = useState<"draft" | "publish" | null>(null);

  // Cover image state
  const [coverFile, setCoverFile]       = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  function handleImageSelect(file: File) {
    if (file.size > 2 * 1024 * 1024) { toast.error("Image too large", "Max 2 MB."); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Invalid format", "Use JPG, PNG, or WebP.");
      return;
    }
    setCoverFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setCoverPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  function removeCoverImage() {
    setCoverFile(null);
    setCoverPreview(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  }
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [topError, setTopError] = useState<string | null>(null);

  // Pre-populate form when editing an existing competition.
  useEffect(() => {
    if (!editId) return;
    setLoadingEdit(true);
    getTeacherCtfCompetition(editId)
      .then(c => {
        const color = c.bannerUrl?.startsWith("color:") ? c.bannerUrl.slice(6) : BANNER_COLORS[0];
        setBannerColor(color);
        const mode = (c.timingMode ?? "SCHEDULED") as "SCHEDULED" | "DURATION" | "MANUAL" | "REGISTRATION";
        setTimingMode(mode);
        setRegistrationOpen(c.registrationOpen ?? false);
        if ((mode === "DURATION" || mode === "REGISTRATION") && c.durationHours) {
          setDurationH(Math.floor(c.durationHours / 60));
          setDurationM(c.durationHours % 60);
        }
        setForm({
          title:              c.title,
          description:        c.description ?? "",
          startTime:          c.startTime ? c.startTime.slice(0, 16) : defaultStart(),
          endTime:            c.endTime ? c.endTime.slice(0, 16) : defaultEnd(),
          maxTeamSize:        c.maxTeamSize,
          minTeamSize:        c.minTeamSize,
          scoringMode:        c.scoringMode,
          dynamicMinPoints:   50,
          dynamicDecayFactor: 0.08,
          visibility:         c.visibility,
          accessCode:         "",
          bannerUrl:          c.bannerUrl ?? undefined,
        });
      })
      .catch(() => setTopError("Failed to load competition."))
      .finally(() => setLoadingEdit(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  function update<K extends keyof CTFCompetitionCreateRequest>(key: K, value: CTFCompetitionCreateRequest[K]) {
    setForm((p) => ({ ...p, [key]: value }));
    if (fieldErrors[key as string]) {
      setFieldErrors((p) => { const n = { ...p }; delete n[key as string]; return n; });
    }
  }

  // Dynamic-scoring preview: keeps the same formula as the backend so what the
  // teacher sees is what students will get.
  const decayPreview = useMemo(() => {
    const base = 300;
    const solves = 10;
    const raw = base * Math.exp(-(form.dynamicDecayFactor ?? 0.08) * solves);
    const floor = form.dynamicMinPoints ?? 50;
    const value = Math.max(floor, Math.round(raw));
    return `After ${solves} solves, ${base}pt challenge ≈ ${value} pts`;
  }, [form.dynamicDecayFactor, form.dynamicMinPoints]);

  async function submitForm(mode: "draft" | "publish") {
    setTopError(null);
    setFieldErrors({});

    const errs: Record<string, string> = {};
    if (!form.title.trim() || form.title.trim().length < 3) errs.title = "Title must be at least 3 characters.";
    if (timingMode === "SCHEDULED") {
      if (!form.startTime) errs.startTime = "Start time is required.";
      if (!form.endTime)   errs.endTime   = "End time is required.";
      if (form.startTime && form.endTime && new Date(form.endTime) <= new Date(form.startTime)) {
        errs.endTime = "End time must be after start time.";
      }
    }
    if (timingMode === "DURATION") {
      if (!form.startTime) errs.startTime = "Start time is required.";
      if (durationH === 0 && durationM === 0) errs.durationHours = "Duration must be at least 1 minute.";
    }
    // REGISTRATION: duration is optional; if provided must be >= 1 min
    if (timingMode === "REGISTRATION" && (durationH > 0 || durationM > 0) && durationH * 60 + durationM < 1) {
      errs.durationHours = "Duration must be at least 1 minute.";
    }
    if (form.visibility === "ACCESS_CODE" && !form.accessCode?.trim()) {
      errs.accessCode = "Access code is required for non-public competitions.";
    }
    if (form.minTeamSize && form.maxTeamSize && form.minTeamSize > form.maxTeamSize) {
      errs.minTeamSize = "Min team size cannot exceed max team size.";
    }
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }

    const totalMinutes = durationH * 60 + durationM;
    const noFixedTime = timingMode === "MANUAL" || timingMode === "REGISTRATION";

    const payload: CTFCompetitionCreateRequest = {
      ...form,
      title: form.title.trim(),
      description: form.description?.trim() || undefined,
      timingMode,
      registrationOpen,
      startTime: (!noFixedTime && form.startTime)
        ? (form.startTime.length === 16 ? form.startTime + ":00" : form.startTime)
        : (noFixedTime ? undefined : form.startTime),
      endTime: timingMode === "SCHEDULED" && form.endTime
        ? (form.endTime.length === 16 ? form.endTime + ":00" : form.endTime)
        : undefined,
      durationHours: (timingMode === "DURATION" || (timingMode === "REGISTRATION" && totalMinutes > 0))
        ? totalMinutes : undefined,
      accessCode: form.visibility === "PUBLIC" ? undefined : form.accessCode?.trim() || undefined,
      bannerUrl: `color:${bannerColor}`,
    };

    setSubmitting(mode);
    try {
      let competitionId: string;

      if (isEdit && editId) {
        const updated = await updateTeacherCtfCompetition(editId, payload);
        competitionId = editId;
        if (coverFile) {
          await uploadCtfCoverImage(competitionId, coverFile).catch(() =>
            toast.error("Cover image failed", "Competition saved but image upload failed."));
        }
        toast.success("Competition updated", `"${updated.title}" has been saved.`);
        router.push(`/admin/ctf/${editId}/manage`);
      } else {
        const created = await createTeacherCtfCompetition(payload);
        competitionId = created.id;
        if (coverFile) {
          await uploadCtfCoverImage(competitionId, coverFile).catch(() =>
            toast.error("Cover image failed", "Competition created but image upload failed."));
        }
        if (mode === "draft") {
          await updateTeacherCtfCompetition(created.id, { isActive: false });
          toast.success("Saved as draft", `"${created.title}" stays hidden from /ctf until you publish.`);
        } else {
          toast.success("Competition published", `"${created.title}" is live.`);
        }
        router.push(`/admin/ctf/${created.id}/manage`);
      }
    } catch (err) {
      if (err instanceof ApiException) {
        if (err.isValidationError()) {
          setFieldErrors(err.fieldErrors ?? {});
          setTopError("Please correct the highlighted fields.");
        } else {
          setTopError(err.message || isEdit ? "Failed to update competition." : "Failed to create competition.");
        }
      } else {
        setTopError(isEdit ? "Failed to update competition." : "Failed to create competition.");
      }
    } finally {
      setSubmitting(null);
    }
  }

  if (loadingEdit) {
    if (embedded) {
      return (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <Loader2 size={28} style={{ animation: "spin 1s linear infinite", color: "#6366f1" }} />
        </div>
      );
    }
    return (
      <>
        <Navbar />
        <div className="psp-main" style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <Loader2 size={28} style={{ animation: "spin 1s linear infinite", color: "#6366f1" }} />
        </div>
      </>
    );
  }

  const formContent = (
    <div style={{ maxWidth: embedded ? undefined : 820 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <Trophy size={20} color="#a78bfa" />
          <span style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>
            {isEdit ? "Edit Competition" : "New CTF Competition"}
          </span>
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>
          {isEdit
            ? "Update the competition settings. Challenges can be managed from the dashboard."
            : "Define the time window, scoring rules, and access policy. You can attach challenges from the Manage dashboard."
          }
        </div>

        <form onSubmit={(e) => { e.preventDefault(); submitForm("publish"); }}>
          {topError && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "var(--red-light)", color: "var(--red)",
              border: "1px solid var(--red)", borderRadius: 4,
              padding: "10px 14px", marginBottom: 16, fontSize: 13,
            }}>
              <AlertCircle size={14} /> {topError}
            </div>
          )}

          {/* ── 1. Basic info ── */}
          <Section title="1. Basic info">
            <Field label="Title" required error={fieldErrors.title}>
              <input className="input"
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                maxLength={255}
                placeholder="Winter CTF 2026"
              />
            </Field>

            <Field label="Description" error={fieldErrors.description}>
              <textarea className="input"
                value={form.description ?? ""}
                onChange={(e) => update("description", e.target.value)}
                rows={3}
                maxLength={5000}
                placeholder="Decode. Exploit. Capture."
              />
            </Field>

            <Field label="Banner color">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {BANNER_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setBannerColor(c)}
                    aria-label={`Banner color ${c}`}
                    style={{
                      width: 30, height: 30, borderRadius: "50%",
                      background: c, padding: 0,
                      border: bannerColor === c ? "2px solid var(--text-primary)" : "2px solid transparent",
                      cursor: "pointer", transition: "border 120ms",
                    }}
                  />
                ))}
              </div>
            </Field>

            <Field label="Cover image">
              {coverPreview ? (
                <div style={{ position: "relative", width: "100%", height: 160, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}>
                  <img src={coverPreview} alt="Cover preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button
                    type="button"
                    onClick={removeCoverImage}
                    style={{
                      position: "absolute", top: 8, right: 8,
                      background: "rgba(239,68,68,0.9)", border: "none", borderRadius: 6,
                      padding: "4px 8px", cursor: "pointer", color: "#fff",
                      display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12,
                    }}
                  >
                    <XIcon size={12} /> Remove
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => imageInputRef.current?.click()}
                  onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleImageSelect(f); }}
                  onDragOver={(e) => e.preventDefault()}
                  style={{
                    border: "2px dashed var(--border)", borderRadius: 8, padding: "28px 16px",
                    textAlign: "center", cursor: "pointer", transition: "border-color 150ms",
                  }}
                >
                  <Upload size={22} style={{ margin: "0 auto 8px", display: "block", color: "#64748b" }} />
                  <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>
                    Drag & drop or <span style={{ color: "#6366f1", fontWeight: 600 }}>click to upload</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    JPG, PNG, WebP · max 2 MB · recommended 1200×400 px
                  </div>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: "none" }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageSelect(f); }}
                  />
                </div>
              )}
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                Optional — shown on player competition cards.
              </div>
            </Field>
          </Section>

          {/* ── 2. Schedule ── */}
          <Section title="2. Schedule">
            {/* Timing mode cards */}
            <Field label="Timing mode" required>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {/* SCHEDULED */}
                <TimingCard
                  icon={<Calendar size={16} />}
                  selected={timingMode === "SCHEDULED"}
                  onClick={() => setTimingMode("SCHEDULED")}
                  title="Scheduled"
                  desc="Set exact start and end date/time"
                >
                  {timingMode === "SCHEDULED" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                      <Field label="Start time" required error={fieldErrors.startTime}>
                        <input className="input" type="datetime-local"
                          value={(form.startTime ?? "").slice(0, 16)}
                          onChange={(e) => update("startTime", e.target.value)}
                        />
                      </Field>
                      <Field label="End time" required error={fieldErrors.endTime}>
                        <input className="input" type="datetime-local"
                          value={(form.endTime ?? "").slice(0, 16)}
                          onChange={(e) => update("endTime", e.target.value)}
                        />
                      </Field>
                      {form.startTime && form.endTime && (
                        <div style={{
                          gridColumn: "1 / -1", fontSize: 12, color: "var(--text-muted)",
                          padding: "6px 10px", background: "var(--bg-secondary)", borderRadius: 6,
                        }}>
                          Runs for <strong style={{ color: "var(--text-primary)" }}>
                            {durationLabel(form.startTime, form.endTime)}
                          </strong>
                        </div>
                      )}
                    </div>
                  )}
                </TimingCard>

                {/* DURATION */}
                <TimingCard
                  icon={<Timer size={16} />}
                  selected={timingMode === "DURATION"}
                  onClick={() => setTimingMode("DURATION")}
                  title="Duration"
                  desc="Set start time and how long it runs"
                >
                  {timingMode === "DURATION" && (
                    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                      <Field label="Start time" required error={fieldErrors.startTime}>
                        <input className="input" type="datetime-local"
                          value={(form.startTime ?? "").slice(0, 16)}
                          onChange={(e) => update("startTime", e.target.value)}
                        />
                      </Field>
                      <Field label="Duration" error={fieldErrors.durationHours}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <input className="input" type="number" min={0} max={999}
                              value={durationH}
                              onChange={(e) => setDurationH(Math.max(0, parseInt(e.target.value) || 0))}
                              style={{ width: 80 }}
                            />
                            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>hours</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <input className="input" type="number" min={0} max={59}
                              value={durationM}
                              onChange={(e) => setDurationM(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                              style={{ width: 80 }}
                            />
                            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>minutes</span>
                          </div>
                        </div>
                      </Field>
                      {form.startTime && (durationH > 0 || durationM > 0) && (
                        <div style={{
                          fontSize: 12, color: "var(--text-muted)",
                          padding: "6px 10px", background: "var(--bg-secondary)", borderRadius: 6,
                        }}>
                          Ends at: <strong style={{ color: "var(--text-primary)" }}>
                            {fmtComputedEnd(form.startTime, durationH * 60 + durationM)}
                          </strong>
                        </div>
                      )}
                    </div>
                  )}
                </TimingCard>

                {/* MANUAL */}
                <TimingCard
                  icon={<Hand size={16} />}
                  selected={timingMode === "MANUAL"}
                  onClick={() => setTimingMode("MANUAL")}
                  title="Manual"
                  desc="You start and stop the competition — no automatic transitions"
                >
                  {timingMode === "MANUAL" && (
                    <div style={{
                      marginTop: 10, fontSize: 12, color: "var(--text-muted)",
                      padding: "8px 12px", background: "var(--bg-secondary)", borderRadius: 6,
                    }}>
                      You will press <strong style={{ color: "var(--text-primary)" }}>▶ Start Competition</strong> in
                      the control panel when ready. The competition stays UPCOMING until you do.
                    </div>
                  )}
                </TimingCard>

                {/* REGISTRATION */}
                <TimingCard
                  icon={<UserPlus size={16} />}
                  selected={timingMode === "REGISTRATION"}
                  onClick={() => setTimingMode("REGISTRATION")}
                  title="Registration"
                  desc="Open for team sign-ups first, then you launch when ready"
                >
                  {timingMode === "REGISTRATION" && (
                    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{
                        fontSize: 12, color: "var(--text-muted)",
                        padding: "8px 12px", background: "var(--bg-secondary)", borderRadius: 6,
                      }}>
                        Students can create or join teams while the competition shows as{" "}
                        <strong style={{ color: "#60a5fa" }}>UPCOMING</strong>. Press{" "}
                        <strong style={{ color: "var(--text-primary)" }}>▶ Start Competition</strong> in
                        the control panel when everyone is ready to begin.
                      </div>
                      <Field label="Auto-end after (optional)" error={fieldErrors.durationHours}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <input className="input" type="number" min={0} max={999}
                              value={durationH}
                              onChange={(e) => setDurationH(Math.max(0, parseInt(e.target.value) || 0))}
                              style={{ width: 80 }}
                            />
                            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>hours</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <input className="input" type="number" min={0} max={59}
                              value={durationM}
                              onChange={(e) => setDurationM(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                              style={{ width: 80 }}
                            />
                            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>minutes</span>
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                          Leave at 0 to end manually from the control panel.
                        </div>
                      </Field>
                    </div>
                  )}
                </TimingCard>
              </div>
            </Field>
          </Section>

          {/* ── 2b. Team Registration ── */}
          <Section title="2b. Team Registration">
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
              <button
                type="button"
                onClick={() => setRegistrationOpen(o => !o)}
                style={{
                  width: 42, height: 24, borderRadius: 12, position: "relative", flexShrink: 0,
                  background: registrationOpen ? "var(--blue, #3b82f6)" : "var(--border)",
                  border: "none", cursor: "pointer", padding: 0, marginTop: 2,
                  transition: "background 0.2s ease",
                }}
              >
                <div style={{
                  position: "absolute", top: 2, left: registrationOpen ? 20 : 2,
                  width: 20, height: 20, borderRadius: 10, background: "#fff",
                  transition: "left 0.2s ease", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }} />
              </button>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                  Open registration after competition starts
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.5 }}>
                  {registrationOpen
                    ? "Teams can join at any time until the competition ends."
                    : "Teams lock the moment the competition starts. New teams cannot join."}
                </div>
              </div>
            </div>
          </Section>

          {/* ── 3. Teams ── */}
          <Section title="3. Teams">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 12 }}>
              <Field label={`Min team size: ${form.minTeamSize ?? 1}`} error={fieldErrors.minTeamSize}>
                <input type="range" min={1} max={10} step={1}
                  value={form.minTeamSize ?? 1}
                  onChange={(e) => update("minTeamSize", Number(e.target.value))}
                  style={{ width: "100%" }}
                />
              </Field>
              <Field label={`Max team size: ${form.maxTeamSize ?? 4}`} error={fieldErrors.maxTeamSize}>
                <input type="range" min={1} max={10} step={1}
                  value={form.maxTeamSize ?? 4}
                  onChange={(e) => update("maxTeamSize", Number(e.target.value))}
                  style={{ width: "100%" }}
                />
              </Field>
            </div>

            <Field label="Access code (optional)">
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="input"
                  value={form.accessCode ?? ""}
                  onChange={(e) => update("accessCode", e.target.value.toUpperCase().replace(/\s+/g, ""))}
                  placeholder="WINTER26"
                  maxLength={30}
                  style={{ fontFamily: "ui-monospace, monospace", letterSpacing: "0.06em", flex: 1 }}
                />
                <button
                  type="button"
                  className="psp-btn psp-btn-secondary"
                  style={{ gap: 4 }}
                  onClick={() => update("accessCode", generateAccessCode())}
                >
                  <RefreshCw size={12} /> Generate
                </button>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                Leave blank for public access. Visibility section below controls whether the code is required.
              </div>
            </Field>
          </Section>

          {/* ── 4. Scoring ── */}
          <Section title="4. Scoring">
            <Field label="Scoring mode" required>
              <div style={{ display: "flex", gap: 8 }}>
                {SCORING.map((s) => (
                  <Pill
                    key={s.value}
                    active={form.scoringMode === s.value}
                    onClick={() => update("scoringMode", s.value)}
                    label={s.label}
                    hint={s.hint}
                  />
                ))}
              </div>
            </Field>

            {form.scoringMode === "DYNAMIC" && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
                  <Field label={`Min points floor: ${form.dynamicMinPoints ?? 50}`} error={fieldErrors.dynamicMinPoints}>
                    <input type="range" min={10} max={100} step={5}
                      value={form.dynamicMinPoints ?? 50}
                      onChange={(e) => update("dynamicMinPoints", Number(e.target.value))}
                      style={{ width: "100%" }}
                    />
                  </Field>
                  <Field label={`Decay factor: ${(form.dynamicDecayFactor ?? 0.08).toFixed(2)}`} error={fieldErrors.dynamicDecayFactor}>
                    <input type="range" min={0.01} max={0.2} step={0.01}
                      value={form.dynamicDecayFactor ?? 0.08}
                      onChange={(e) => update("dynamicDecayFactor", Number(e.target.value))}
                      style={{ width: "100%" }}
                    />
                  </Field>
                </div>
                <div style={{
                  fontSize: 12, color: "var(--text-muted)", marginTop: 6,
                  padding: "8px 12px", background: "var(--bg-secondary)", borderRadius: 6,
                  fontFamily: "ui-monospace, monospace",
                }}>
                  {decayPreview}
                </div>
              </>
            )}
          </Section>

          {/* ── 5. Visibility ── */}
          <Section title="5. Visibility">
            <Field label="Who can see this competition?" required>
              <div style={{ display: "flex", gap: 8 }}>
                {VISIBILITY.map((v) => (
                  <Pill
                    key={v.value}
                    active={form.visibility === v.value}
                    onClick={() => update("visibility", v.value)}
                    label={v.label}
                    hint={v.hint}
                  />
                ))}
              </div>
            </Field>

            {form.visibility === "ACCESS_CODE" && !form.accessCode?.trim() && (
              <div style={{
                marginTop: 10, fontSize: 12, color: "#fbbf24",
                background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)",
                borderRadius: 6, padding: "8px 12px",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <KeyRound size={12} /> Add an access code in step 3 — required for non-public competitions.
              </div>
            )}
          </Section>

          {/* ── Footer actions ── */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
            {!embedded && (
              <Link href={isEdit && editId ? `/admin/ctf/${editId}/manage` : "/admin/ctf"}>
                <button type="button" className="psp-btn psp-btn-secondary">Cancel</button>
              </Link>
            )}
            {!isEdit && (
              <LoadingButton
                type="button"
                loading={submitting === "draft"}
                className="psp-btn psp-btn-secondary"
                style={{ gap: 6 }}
                onClick={() => submitForm("draft")}
              >
                <FilePlus size={13} /> Save as Draft
              </LoadingButton>
            )}
            <LoadingButton
              type="submit"
              loading={submitting === "publish"}
              className="psp-btn psp-btn-primary"
              style={{ gap: 6 }}
            >
              <Save size={13} /> {isEdit ? "Save Changes" : "Publish Competition"}
            </LoadingButton>
          </div>
        </form>
      </div>
  );

  if (embedded) return formContent;

  return (
    <>
      <Navbar />
      <div className="psp-breadcrumb">
        <Link href="/admin">icode-ctf</Link> ›{" "}
        <Link href="/admin/ctf">CTF</Link> ›{" "}
        {isEdit && editId
          ? <><Link href={`/admin/ctf/${editId}/manage`}>Manage</Link> › <span style={{ color: "var(--text-primary)" }}>Edit</span></>
          : <span style={{ color: "var(--text-primary)" }}>New</span>
        }
      </div>
      <div className="psp-main" style={{ maxWidth: 820 }}>
        {formContent}
      </div>
    </>
  );
}

// ── Small UI helpers ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="psp-card" style={{ padding: 18, marginBottom: 14 }}>
      <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 13, color: "var(--text-primary)" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({
  label, required, error, children,
}: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 5 }}>
        {label} {required && <span style={{ color: "var(--red)" }}>*</span>}
      </label>
      {children}
      {error && (
        <div style={{ fontSize: 11, color: "var(--red)", marginTop: 4 }}>
          {error}
        </div>
      )}
    </div>
  );
}

function TimingCard({
  icon, selected, onClick, title, desc, children,
}: {
  icon: React.ReactNode;
  selected: boolean;
  onClick: () => void;
  title: string;
  desc: string;
  children?: React.ReactNode;
}) {
  return (
    <div style={{
      border: `1px solid ${selected ? "var(--blue, #3b82f6)" : "var(--border)"}`,
      borderRadius: 8, overflow: "hidden",
      background: selected ? "rgba(59,130,246,0.04)" : "var(--bg-secondary)",
      transition: "border-color 120ms, background 120ms",
    }}>
      <button
        type="button"
        onClick={onClick}
        style={{
          width: "100%", padding: "12px 16px", background: "transparent",
          border: "none", cursor: "pointer", textAlign: "left",
          display: "flex", alignItems: "center", gap: 10,
        }}
      >
        <span style={{ color: selected ? "var(--blue, #3b82f6)" : "var(--text-muted)", flexShrink: 0 }}>{icon}</span>
        <span style={{
          width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
          border: `2px solid ${selected ? "var(--blue, #3b82f6)" : "var(--border)"}`,
          background: selected ? "var(--blue, #3b82f6)" : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {selected && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
        </span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{title}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{desc}</div>
        </div>
      </button>
      {selected && children && (
        <div style={{ padding: "0 16px 14px" }}>
          {children}
        </div>
      )}
    </div>
  );
}

function Pill({
  active, onClick, label, hint,
}: { active: boolean; onClick: () => void; label: string; hint: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        background: active ? "var(--blue-light)" : "var(--bg-secondary)",
        color:      active ? "var(--blue)"        : "var(--text-secondary)",
        border:     `1px solid ${active ? "var(--blue)" : "var(--border)"}`,
        borderRadius: 6,
        padding: "10px 12px",
        cursor: "pointer",
        textAlign: "left",
        transition: "all 120ms ease",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{hint}</div>
    </button>
  );
}
