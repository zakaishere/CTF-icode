"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import {
  ArrowLeft, Plus, Trash2, Flag, Server, FileText,
  Lightbulb, ChevronDown, ChevronUp, Copy, Terminal, Info,
} from "lucide-react";
import { toast } from "@/components/ui/PSPToast";
import { FieldError } from "@/components/ui/FieldError";
import {
  getTeacherCTFChallenge,
  createTeacherCTFChallenge,
  updateTeacherCTFChallenge,
  CTFHintRequest,
} from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HintDraft {
  _key: string;
  cost: number;
  text: string;
}

interface EnvVarEntry { key: string; value: string; _key: string; }

interface FormState {
  title:               string;
  description:         string;
  category:            string;
  difficulty:          string;
  basePoints:          string;
  plainFlag:           string;
  flagType:            "STATIC" | "DYNAMIC";
  flagFormat:          string;
  requiresInstance:    boolean;
  dockerImage:         string;
  containerEnvVars:    string;
  dockerFlagEnv:       string;
  connectionType:      "HTTP" | "TCP";
  dockerMemoryMb:      string;
  dockerCpuPercent:    string;
  dockerPidsLimit:     string;
  downloadableFileUrl: string;
  downloadableFileName: string;
  maxAttempts:         string;
  attemptsMode:        "limited" | "unlimited";
  isActive:            boolean;
}

const emptyForm = (): FormState => ({
  title:               "",
  description:         "",
  category:            "MISC",
  difficulty:          "EASY",
  basePoints:          "100",
  plainFlag:           "",
  flagType:            "STATIC",
  flagFormat:          "",
  requiresInstance:    false,
  dockerImage:         "",
  containerEnvVars:    "",
  dockerFlagEnv:       "FLAG",
  connectionType:      "HTTP",
  dockerMemoryMb:      "",
  dockerCpuPercent:    "",
  dockerPidsLimit:     "",
  downloadableFileUrl: "",
  downloadableFileName: "",
  maxAttempts:         "10",
  attemptsMode:        "limited",
  isActive:            false,
});

const emptyHint = (): HintDraft => ({
  _key: `h-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  cost: 10,
  text: "",
});

// ─── DockerTemplates ─────────────────────────────────────────────────────────

const TEMPLATES = [
  {
    id: "flask",
    label: "Python Flask (HTTP)",
    dockerfile: `FROM python:3.11-slim
RUN pip install flask
WORKDIR /app
COPY app.py .
CMD ["python", "app.py"]`,
    appCode: `import os, flask
app = flask.Flask(__name__)
FLAG = os.environ.get("FLAG", "PSP{flag_not_set}")

@app.route("/")
def index():
    return "<h1>Solve the challenge</h1>"

@app.route("/flag")
def flag():
    # Replace with your real challenge logic
    return FLAG

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)`,
  },
  {
    id: "nodejs",
    label: "Node.js (HTTP)",
    dockerfile: `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["node", "server.js"]`,
    appCode: `const http = require("http");
const FLAG = process.env.FLAG ?? "PSP{flag_not_set}";

http.createServer((req, res) => {
  if (req.url === "/flag") {
    // Replace with your real challenge logic
    res.end(FLAG);
  } else {
    res.end("Solve the challenge");
  }
}).listen(8080);`,
  },
  {
    id: "tcp",
    label: "Bash / netcat (TCP)",
    dockerfile: `FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y socat
COPY challenge.sh /challenge.sh
RUN chmod +x /challenge.sh
CMD ["socat", "TCP-LISTEN:1337,reuseaddr,fork", "EXEC:/challenge.sh"]`,
    appCode: `#!/bin/bash
# challenge.sh — injected flag via env var
FLAG="\${FLAG:-PSP{flag_not_set}}"
echo "Welcome to the challenge!"
echo "Answer: "
read answer
if [ "$answer" = "correct_secret" ]; then
    echo "$FLAG"
else
    echo "Wrong!"
fi`,
  },
] as const;

function DockerTemplates({ connectionType, flagEnv }: { connectionType: "HTTP" | "TCP"; flagEnv: string }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<"flask" | "nodejs" | "tcp">("flask");
  const [copied, setCopied] = useState<string | null>(null);

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    });
  };

  const tpl = TEMPLATES.find(t => t.id === active) ?? TEMPLATES[0];

  return (
    <div style={{ borderRadius: 6, border: "1px solid var(--border)", overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 14px", background: "var(--bg-secondary)", border: "none", cursor: "pointer",
          fontSize: 12, color: "var(--text-secondary)",
        }}
      >
        <span style={{ fontWeight: 600 }}>Starter templates</span>
        {open ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
      </button>

      {open && (
        <div style={{ padding: 14, background: "var(--bg-primary)", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Tab row */}
          <div style={{ display: "flex", gap: 6 }}>
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActive(t.id)}
                style={{
                  padding: "4px 10px", borderRadius: 4, border: "1px solid",
                  borderColor: active === t.id ? "var(--purple)" : "var(--border)",
                  background: active === t.id ? "rgba(167,139,250,0.1)" : "transparent",
                  color: active === t.id ? "var(--purple)" : "var(--text-muted)",
                  fontSize: 11, cursor: "pointer",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Dockerfile */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>Dockerfile</span>
              <button type="button" onClick={() => copyText(tpl.dockerfile, "df")}
                style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-muted)" }}>
                <Copy size={11} />{copied === "df" ? "Copied!" : "Copy"}
              </button>
            </div>
            <pre style={{
              margin: 0, padding: "10px 12px", borderRadius: 4,
              background: "var(--bg-tertiary)", fontSize: 11,
              color: "var(--text-secondary)", fontFamily: "monospace",
              overflowX: "auto", lineHeight: 1.6,
            }}>{tpl.dockerfile}</pre>
          </div>

          {/* App code */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>
                {active === "flask" ? "app.py" : active === "nodejs" ? "server.js" : "challenge.sh"}
              </span>
              <button type="button" onClick={() => copyText(tpl.appCode.replace(/FLAG/g, flagEnv), "app")}
                style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-muted)" }}>
                <Copy size={11} />{copied === "app" ? "Copied!" : "Copy"}
              </button>
            </div>
            <pre style={{
              margin: 0, padding: "10px 12px", borderRadius: 4,
              background: "var(--bg-tertiary)", fontSize: 11,
              color: "var(--text-secondary)", fontFamily: "monospace",
              overflowX: "auto", lineHeight: 1.6,
            }}>{tpl.appCode.replace(/FLAG/g, flagEnv)}</pre>
          </div>

          <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0 }}>
            These are minimal starters — adapt to your challenge. The <code>{flagEnv}</code> env var is injected automatically at spawn time.
            {connectionType === "TCP" && <> For TCP challenges, expose port 1337 (or whatever your socat listens on).</>}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { editId?: string }

const TeacherCTFForm = ({ editId }: Props) => {
  const router  = useRouter();
  const isEdit  = !!editId;

  const [form, setForm]         = useState<FormState>(emptyForm());
  const [hints, setHints]       = useState<HintDraft[]>([]);
  const [envVars, setEnvVars]   = useState<EnvVarEntry[]>([]);
  const [errors, setErrors]     = useState<Record<string, string>>({});
  const [saving, setSaving]     = useState(false);
  const [saveMode, setSaveMode] = useState<"draft" | "publish" | null>(null);
  const [loading, setLoading]   = useState(isEdit);
  // Read-only: auto-detected from Dockerfile EXPOSE after build — never submitted by the form
  const [detectedPort, setDetectedPort] = useState<number | null>(null);

  const addEnvVar = () => setEnvVars(p => [...p, { key: "", value: "", _key: `ev-${Date.now()}` }]);
  const removeEnvVar = (i: number) => setEnvVars(p => p.filter((_, idx) => idx !== i));
  const setEnvVar = (i: number, field: "key" | "value", v: string) =>
    setEnvVars(p => p.map((e, idx) => idx === i ? { ...e, [field]: v } : e));

  useEffect(() => {
    if (!editId) return;
    (async () => {
      try {
        const c = await getTeacherCTFChallenge(editId);
        setDetectedPort(c.dockerExposedPort ?? null);
        setForm({
          title:               c.title,
          description:         c.description,
          category:            c.category,
          difficulty:          c.difficulty,
          basePoints:          String(c.basePoints),
          plainFlag:           "",
          flagType:            (c.flagType === "DYNAMIC" ? "DYNAMIC" : "STATIC") as "STATIC" | "DYNAMIC",
          flagFormat:          c.flagFormat ?? "",
          requiresInstance:    c.requiresInstance ?? false,
          dockerImage:         c.dockerImage ?? "",
          containerEnvVars:    c.containerEnvVars ?? "",
          dockerFlagEnv:       c.dockerFlagEnv ?? "FLAG",
          connectionType:      (c.connectionType === "TCP" ? "TCP" : "HTTP") as "HTTP" | "TCP",
          dockerMemoryMb:      c.dockerMemoryMb ? String(c.dockerMemoryMb) : "",
          dockerCpuPercent:    c.dockerCpuPercent ? String(c.dockerCpuPercent) : "",
          dockerPidsLimit:     c.dockerPidsLimit ? String(c.dockerPidsLimit) : "",
          downloadableFileUrl: c.downloadableFileUrl ?? "",
          downloadableFileName: c.downloadableFileName ?? "",
          maxAttempts:         c.maxAttempts != null ? String(c.maxAttempts) : "10",
          attemptsMode:        c.maxAttempts == null ? "unlimited" : "limited",
          isActive:            c.isActive,
        });
        const existingEnvVars = c.dockerEnvVars;
        if (existingEnvVars) {
          setEnvVars(Object.entries(existingEnvVars).map(([k, v]) => ({
            key: k, value: v as string, _key: `ev-${k}`
          })));
        }
        setHints(
          (c.hints ?? []).map(h => ({ _key: h.id, cost: h.cost, text: h.text }))
        );
      } catch {
        toast.error("Failed to load challenge", "Please try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, [editId]);

  // ── Field helpers ──────────────────────────────────────────────────────────

  const set = (field: keyof FormState, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => { const e = { ...prev }; delete e[field]; return e; });
  };

  // ── Validation ─────────────────────────────────────────────────────────────

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.title.trim())       e.title       = "Title is required";
    if (!form.description.trim()) e.description = "Description is required";
    if (!form.category)           e.category    = "Category is required";
    if (!form.difficulty)         e.difficulty  = "Difficulty is required";

    const pts = parseInt(form.basePoints);
    if (isNaN(pts) || pts < 1)    e.basePoints  = "Points must be a positive number";

    if (form.flagType === "STATIC") {
      if (!isEdit && !form.plainFlag.trim()) {
        e.plainFlag = "Flag is required";
      } else if (form.plainFlag.trim() && /\s/.test(form.plainFlag)) {
        e.plainFlag = "Flag cannot contain spaces";
      } else if (form.plainFlag.trim() && form.plainFlag.trim().length < 3) {
        e.plainFlag = "Flag must be at least 3 characters";
      }
    }

    if (form.attemptsMode === "limited") {
      const maxAt = parseInt(form.maxAttempts);
      if (isNaN(maxAt) || maxAt < 1) e.maxAttempts = "Max attempts must be at least 1";
    }

    if (form.requiresInstance) {
      if (!form.dockerImage.trim()) e.dockerImage = "Docker image is required for instance challenges";
    }

    hints.forEach((h, i) => {
      if (!h.text.trim()) e[`hint_${i}_text`] = "Hint text is required";
      if (h.cost < 0)     e[`hint_${i}_cost`] = "Cost cannot be negative";
    });

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSave = async (publish: boolean) => {
    const withActive = { ...form, isActive: publish };
    setForm(withActive);

    // Re-run validation with the updated active state
    const prevErrors: Record<string, string> = {};
    if (!withActive.title.trim())       prevErrors.title       = "Title is required";
    if (!withActive.description.trim()) prevErrors.description = "Description is required";
    if (withActive.flagType === "STATIC") {
      if (!isEdit && !withActive.plainFlag.trim()) prevErrors.plainFlag = "Flag is required";
      else if (withActive.plainFlag.trim() && /\s/.test(withActive.plainFlag))
        prevErrors.plainFlag = "Flag cannot contain spaces";
      else if (withActive.plainFlag.trim() && withActive.plainFlag.trim().length < 3)
        prevErrors.plainFlag = "Flag must be at least 3 characters";
    }
    if (!withActive.category)           prevErrors.category    = "Category is required";
    if (!withActive.difficulty)         prevErrors.difficulty  = "Difficulty is required";
    const pts = parseInt(withActive.basePoints);
    if (isNaN(pts) || pts < 1)          prevErrors.basePoints  = "Points must be a positive number";
    if (withActive.attemptsMode === "limited") {
      const maxAt = parseInt(withActive.maxAttempts);
      if (isNaN(maxAt) || maxAt < 1) prevErrors.maxAttempts = "Max attempts must be at least 1";
    }
    if (withActive.requiresInstance) {
      if (!withActive.dockerImage.trim()) prevErrors.dockerImage = "Docker image is required";
    }
    hints.forEach((h, i) => {
      if (!h.text.trim()) prevErrors[`hint_${i}_text`] = "Hint text is required";
      if (h.cost < 0)     prevErrors[`hint_${i}_cost`] = "Cost cannot be negative";
    });

    if (Object.keys(prevErrors).length > 0) { setErrors(prevErrors); return; }

    setSaving(true);
    setSaveMode(publish ? "publish" : "draft");
    try {
      const hintPayload: CTFHintRequest[] = hints.map(h => ({ cost: h.cost, text: h.text }));

      const dockerEnvVarsMap = envVars.length > 0
        ? Object.fromEntries(envVars.filter(e => e.key.trim()).map(e => [e.key.trim(), e.value]))
        : undefined;

      const dockerPayload = withActive.requiresInstance ? {
        dockerImage:      withActive.dockerImage || undefined,
        // dockerExposedPort is NOT submitted — it is auto-detected from the
        // Dockerfile EXPOSE instruction at build time and written by the server.
        containerEnvVars: withActive.containerEnvVars || undefined,
        dockerFlagEnv:    withActive.dockerFlagEnv || "FLAG",
        connectionType:   withActive.connectionType,
        dockerEnvVars:    dockerEnvVarsMap,
        dockerMemoryMb:   withActive.dockerMemoryMb ? parseInt(withActive.dockerMemoryMb) : undefined,
        dockerCpuPercent: withActive.dockerCpuPercent ? parseInt(withActive.dockerCpuPercent) : undefined,
        dockerPidsLimit:  withActive.dockerPidsLimit ? parseInt(withActive.dockerPidsLimit) : undefined,
      } : {};

      if (isEdit) {
        await updateTeacherCTFChallenge(editId!, {
          title:               withActive.title,
          description:         withActive.description,
          category:            withActive.category,
          difficulty:          withActive.difficulty,
          basePoints:          parseInt(withActive.basePoints),
          flagType:            withActive.flagType,
          plainFlag:           withActive.flagType === "STATIC" ? (withActive.plainFlag.trim() || undefined) : undefined,
          flagFormat:          withActive.flagFormat || undefined,
          requiresInstance:    withActive.requiresInstance,
          ...dockerPayload,
          downloadableFileUrl: withActive.downloadableFileUrl || undefined,
          downloadableFileName: withActive.downloadableFileName || undefined,
          maxAttempts:         withActive.attemptsMode === "unlimited" ? 0 : parseInt(withActive.maxAttempts),
          isActive:            publish,
          hints:               hintPayload,
        });
        toast.success("Challenge updated", publish ? "Challenge is now live." : "Saved as draft.");
      } else {
        await createTeacherCTFChallenge({
          title:               withActive.title,
          description:         withActive.description,
          category:            withActive.category,
          difficulty:          withActive.difficulty,
          basePoints:          parseInt(withActive.basePoints),
          flagType:            withActive.flagType,
          plainFlag:           withActive.flagType === "STATIC" ? withActive.plainFlag.trim() : undefined,
          flagFormat:          withActive.flagFormat || undefined,
          requiresInstance:    withActive.requiresInstance,
          ...dockerPayload,
          downloadableFileUrl: withActive.downloadableFileUrl || undefined,
          downloadableFileName: withActive.downloadableFileName || undefined,
          maxAttempts:         withActive.attemptsMode === "unlimited" ? 0 : parseInt(withActive.maxAttempts),
          isActive:            publish,
          hints:               hintPayload,
        });
        toast.success("Challenge created", publish ? "Challenge is now live." : "Saved as draft.");
      }
      router.push("/admin/ctf");
    } catch (err: unknown) {
      const apiErr = err as { fieldErrors?: Record<string, string>; message?: string };
      if (apiErr?.fieldErrors) {
        setErrors(apiErr.fieldErrors);
      } else {
        toast.error("Save failed", apiErr?.message ?? "An unexpected error occurred.");
      }
    } finally {
      setSaving(false);
      setSaveMode(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="psp-breadcrumb">
          <Link href="/admin">icode-ctf</Link> ›{" "}
          <Link href="/admin/ctf">CTF Challenges</Link> ›{" "}
          <span style={{ color: "var(--text-primary)" }}>Loading…</span>
        </div>
        <div className="psp-main">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skel" style={{ height: 140, borderRadius: 6, marginBottom: 12 }} />
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="psp-breadcrumb">
        <Link href="/admin">icode-ctf</Link> ›{" "}
        <Link href="/admin/ctf">CTF Challenges</Link> ›{" "}
        <span style={{ color: "var(--text-primary)" }}>{isEdit ? "Edit Challenge" : "New Challenge"}</span>
      </div>

      <div className="psp-main" style={{ maxWidth: 780 }}>

        {/* ── Page header ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>
              {isEdit ? "Edit CTF Challenge" : "New CTF Challenge"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
              {isEdit ? "Update the challenge details below." : "Fill out the form to create a new challenge for your students."}
            </div>
          </div>
        </div>

        {/* ═══ Card 1: Basic Info ═══════════════════════════════════════════ */}
        <div className="psp-card" style={{ marginBottom: 16, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <FileText size={15} color="var(--blue)" />
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Basic Information</h2>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Title */}
            <div>
              <label className="psp-form-label">Title *</label>
              <input
                className="psp-form-input"
                value={form.title}
                onChange={e => set("title", e.target.value)}
                placeholder="e.g. RSA Warmup"
              />
              <FieldError errors={errors} fieldName="title" />
            </div>

            {/* Description */}
            <div>
              <label className="psp-form-label">Description *</label>
              <textarea
                className="psp-form-textarea"
                rows={6}
                value={form.description}
                onChange={e => set("description", e.target.value)}
                placeholder="Describe the challenge. Markdown and pre-formatted text are preserved."
              />
              <FieldError errors={errors} fieldName="description" />
            </div>

            {/* Category + Difficulty row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label className="psp-form-label">Category *</label>
                <select className="psp-form-select" value={form.category} onChange={e => set("category", e.target.value)}>
                  {["CRYPTO","FORENSICS","REVERSE","WEB","MISC","OSINT","PWN"].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <FieldError errors={errors} fieldName="category" />
              </div>
              <div>
                <label className="psp-form-label">Difficulty *</label>
                <select className="psp-form-select" value={form.difficulty} onChange={e => set("difficulty", e.target.value)}>
                  {["EASY","MEDIUM","HARD"].map(d => (
                    <option key={d} value={d}>{d.charAt(0) + d.slice(1).toLowerCase()}</option>
                  ))}
                </select>
                <FieldError errors={errors} fieldName="difficulty" />
              </div>
            </div>

            {/* Points + Max Attempts */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label className="psp-form-label">Points *</label>
                <input
                  className="psp-form-input"
                  type="number"
                  min={1}
                  value={form.basePoints}
                  onChange={e => set("basePoints", e.target.value)}
                />
                <FieldError errors={errors} fieldName="basePoints" />
              </div>
              <div>
                <label className="psp-form-label">Attempts per team</label>
                <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                  {(["limited", "unlimited"] as const).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => set("attemptsMode", mode)}
                      style={{
                        flex: 1, padding: "7px 0", borderRadius: 6, cursor: "pointer",
                        border: form.attemptsMode === mode ? "1px solid #6366f1" : "1px solid #334155",
                        background: form.attemptsMode === mode ? "rgba(99,102,241,0.15)" : "transparent",
                        color: form.attemptsMode === mode ? "#a5b4fc" : "#64748b",
                        fontSize: 12, fontWeight: 600, textTransform: "capitalize",
                      }}
                    >
                      {mode === "unlimited" ? "Unlimited ∞" : "Limited"}
                    </button>
                  ))}
                </div>
                {form.attemptsMode === "limited" && (
                  <>
                    <input
                      className="psp-form-input"
                      type="number"
                      min={1}
                      placeholder="e.g. 10"
                      value={form.maxAttempts}
                      onChange={e => set("maxAttempts", e.target.value)}
                    />
                    <FieldError errors={errors} fieldName="maxAttempts" />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ═══ Card 2: Flag ════════════════════════════════════════════════ */}
        <div className="psp-card" style={{ marginBottom: 16, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <Flag size={15} color="var(--green)" />
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Flag</h2>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Flag type toggle */}
            <div>
              <label className="psp-form-label">Flag Type *</label>
              <div style={{ display: "flex", gap: 8 }}>
                {(["STATIC", "DYNAMIC"] as const).map(type => (
                  <label key={type} style={{
                    flex: 1, display: "flex", alignItems: "flex-start", gap: 10,
                    padding: "10px 14px", borderRadius: 6, cursor: "pointer",
                    border: `1px solid ${form.flagType === type ? "var(--blue)" : "var(--border)"}`,
                    background: form.flagType === type ? "rgba(96,165,250,0.08)" : "var(--bg-secondary)",
                  }}>
                    <input
                      type="radio"
                      name="flagType"
                      value={type}
                      checked={form.flagType === type}
                      onChange={() => set("flagType", type)}
                      style={{ marginTop: 2, accentColor: "var(--blue)" }}
                    />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                        {type === "STATIC" ? "Static" : "Dynamic"}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                        {type === "STATIC"
                          ? "One flag for all teams — you set it now."
                          : "Per-team unique flag — auto-generated, injected into the Docker container."}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Plain flag input — only for STATIC */}
            {form.flagType === "STATIC" && (
              <div>
                <label className="psp-form-label">
                  {isEdit ? "New Flag (leave blank to keep current)" : "Flag *"}
                </label>
                <input
                  className="psp-form-input"
                  value={form.plainFlag}
                  onChange={e => set("plainFlag", e.target.value)}
                  placeholder="e.g. CTF{example_flag}"
                  spellCheck={false}
                  autoComplete="off"
                />
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  Any format you want — e.g. <code style={{ background: "var(--bg-tertiary)", padding: "0 4px", borderRadius: 2 }}>HTB{"{...}"}</code>, <code style={{ background: "var(--bg-tertiary)", padding: "0 4px", borderRadius: 2 }}>UNICTF{"{...}"}</code>, or any string.
                  Stored as SHA-256 — never visible again after saving.
                </p>
                <FieldError errors={errors} fieldName="plainFlag" />
              </div>
            )}

            {/* Dynamic flag info */}
            {form.flagType === "DYNAMIC" && (
              <div style={{
                padding: "10px 14px", borderRadius: 6,
                background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.2)",
                fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5,
              }}>
                Each team receives a unique flag automatically generated by the server using your format template (e.g. <code style={{ fontFamily: "monospace" }}>UNICTF{"{…}"}</code>). It will be injected into the Docker container via environment variables — make sure your challenge reads and exposes it to the player.
              </div>
            )}

            <div>
              <label className="psp-form-label">Flag Format Hint (shown to students)</label>
              <input
                className="psp-form-input"
                value={form.flagFormat}
                onChange={e => set("flagFormat", e.target.value)}
                placeholder="e.g. FLAG{?} or HTB{web_?}"
              />
            </div>
          </div>
        </div>

        {/* ═══ Card 3: Downloads & Resources ═══════════════════════════════ */}
        <div className="psp-card" style={{ marginBottom: 16, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <FileText size={15} color="var(--orange)" />
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Downloadable File</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
            <div>
              <label className="psp-form-label">File URL</label>
              <input
                className="psp-form-input"
                value={form.downloadableFileUrl}
                onChange={e => set("downloadableFileUrl", e.target.value)}
                placeholder="https://…/challenge.zip"
              />
            </div>
            <div>
              <label className="psp-form-label">Display Name</label>
              <input
                className="psp-form-input"
                value={form.downloadableFileName}
                onChange={e => set("downloadableFileName", e.target.value)}
                placeholder="challenge.zip"
              />
            </div>
          </div>
        </div>

        {/* ═══ Card 4: Docker Instance ════════════════════════════════════ */}
        <div className="psp-card" style={{ marginBottom: 16, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <Server size={15} color="var(--purple)" />
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Docker Instance</h2>
            {form.requiresInstance && (
              <span className="psp-badge b-tp" style={{ fontSize: 10 }}>Enabled</span>
            )}
          </div>

          {/* Enable toggle — always visible */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
              padding: "12px 14px", borderRadius: 6,
              border: `1px solid ${form.requiresInstance ? "var(--purple)" : "var(--border)"}`,
              background: form.requiresInstance ? "rgba(167,139,250,0.06)" : "var(--bg-secondary)",
            }}>
              <input
                type="checkbox"
                checked={form.requiresInstance}
                onChange={e => {
                  setForm(prev => ({ ...prev, requiresInstance: e.target.checked }));
                }}
                style={{ width: 16, height: 16, accentColor: "var(--purple)", cursor: "pointer" }}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                  Requires Docker instance (WEB / PWN)
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                  Players will get a personal live container for this challenge.
                </div>
              </div>
            </label>
          </div>

          {/* Config fields — only when enabled */}
          <div style={{ display: form.requiresInstance ? "flex" : "none", flexDirection: "column", gap: 14 }}>
            {true && (
                <>
                  {/* Connection type */}
                  <div>
                    <label className="psp-form-label">Connection Type *</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      {(["HTTP", "TCP"] as const).map(ct => (
                        <label key={ct} style={{
                          flex: 1, display: "flex", alignItems: "flex-start", gap: 10,
                          padding: "10px 14px", borderRadius: 6, cursor: "pointer",
                          border: `1px solid ${form.connectionType === ct ? "var(--purple)" : "var(--border)"}`,
                          background: form.connectionType === ct ? "rgba(167,139,250,0.08)" : "var(--bg-secondary)",
                        }}>
                          <input type="radio" name="connType" value={ct}
                            checked={form.connectionType === ct}
                            onChange={() => set("connectionType", ct)}
                            style={{ marginTop: 2, accentColor: "var(--purple)" }}
                          />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{ct}</div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                              {ct === "HTTP" ? "Web app — player opens a URL in browser." : "netcat / TCP socket — player runs nc host port."}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Image (full width) */}
                  <div>
                    <label className="psp-form-label">Docker Image *</label>
                    <input
                      className="psp-form-input"
                      value={form.dockerImage}
                      onChange={e => set("dockerImage", e.target.value)}
                      placeholder="registry.example.com/ctf-pwn:latest"
                    />
                    <FieldError errors={errors} fieldName="dockerImage" />
                  </div>

                  {/* Container port — read-only, auto-detected from Dockerfile EXPOSE */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "9px 12px",
                    borderRadius: 6, border: "1px solid var(--border)",
                    background: "var(--bg-secondary)", fontSize: 12,
                  }}>
                    <Terminal size={13} color="var(--text-muted)" />
                    <span style={{ color: "var(--text-muted)" }}>Container port:</span>
                    {detectedPort != null ? (
                      <>
                        <span style={{ fontWeight: 700, color: "var(--text-primary)", fontFamily: "monospace" }}>
                          {detectedPort}
                        </span>
                        <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                          (auto-detected from Dockerfile EXPOSE)
                        </span>
                      </>
                    ) : (
                      <span style={{ color: "var(--text-muted)", fontSize: 11, fontStyle: "italic" }}>
                        auto-detected from <code>EXPOSE</code> in your Dockerfile after upload
                      </span>
                    )}
                  </div>

                  {/* FLAG env var name */}
                  <div>
                    <label className="psp-form-label">Flag Env Var Name</label>
                    <input
                      className="psp-form-input"
                      value={form.dockerFlagEnv}
                      onChange={e => set("dockerFlagEnv", e.target.value)}
                      placeholder="FLAG"
                      style={{ maxWidth: 200 }}
                    />
                    <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                      The server injects the static flag as this env var at spawn time — default is <code>FLAG</code>.
                      Your challenge binary should read it:
                    </p>
                    <div style={{
                      marginTop: 8, padding: "10px 12px", borderRadius: 4,
                      background: "var(--bg-tertiary)", fontFamily: "monospace", fontSize: 11,
                      color: "var(--text-secondary)", lineHeight: 1.7,
                    }}>
                      <span style={{ color: "var(--text-muted)" }}># Python</span><br />
                      {"flag = os.environ.get('FLAG', 'FLAG{flag_not_set}')"}<br />
                      <span style={{ color: "var(--text-muted)", marginTop: 4, display: "block" }}># Node.js</span>
                      {"const flag = process.env.FLAG ?? 'FLAG{flag_not_set}';"}<br />
                      <span style={{ color: "var(--text-muted)", marginTop: 4, display: "block" }}># Bash</span>
                      {'echo "${FLAG:-FLAG{flag_not_set}}"'}
                    </div>
                  </div>

                  {/* Extra env vars */}
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <label className="psp-form-label" style={{ marginBottom: 0 }}>Extra Environment Variables</label>
                      <button className="psp-btn psp-btn-secondary"
                        style={{ height: 26, padding: "0 10px", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}
                        onClick={addEnvVar} type="button">
                        <Plus size={11} /> Add
                      </button>
                    </div>
                    {envVars.length === 0 && (
                      <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        No extra vars. The server automatically injects the FLAG — do not add it here.
                      </p>
                    )}
                    {envVars.map((ev, i) => (
                      <div key={ev._key} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                        <input className="psp-form-input" placeholder="KEY"
                          value={ev.key} onChange={e => setEnvVar(i, "key", e.target.value)}
                          style={{ flex: "0 0 35%" }} spellCheck={false} />
                        <input className="psp-form-input" placeholder="value"
                          value={ev.value} onChange={e => setEnvVar(i, "value", e.target.value)}
                          style={{ flex: 1 }} spellCheck={false} />
                        <button style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)" }}
                          onClick={() => removeEnvVar(i)} type="button">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Resource limits */}
                  <div>
                    <label className="psp-form-label">Resource Limits (optional — leave blank for defaults)</label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Memory (MB)</label>
                        <input className="psp-form-input" type="number" min={16} placeholder="128"
                          value={form.dockerMemoryMb} onChange={e => set("dockerMemoryMb", e.target.value)} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: "var(--text-muted)" }}>CPU %</label>
                        <input className="psp-form-input" type="number" min={1} max={100} placeholder="50"
                          value={form.dockerCpuPercent} onChange={e => set("dockerCpuPercent", e.target.value)} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: "var(--text-muted)" }}>PID Limit</label>
                        <input className="psp-form-input" type="number" min={10} placeholder="200"
                          value={form.dockerPidsLimit} onChange={e => set("dockerPidsLimit", e.target.value)} />
                      </div>
                    </div>
                  </div>

                  {/* How it works info */}
                  <div style={{
                    padding: "12px 14px", borderRadius: 6,
                    background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.18)",
                    fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <Info size={12} color="var(--blue)" />
                      <strong style={{ color: "var(--text-secondary)", fontSize: 12 }}>How it works</strong>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      <li>The <strong>static flag</strong> you entered above is stored and injected into the container as the <code>{form.dockerFlagEnv || "FLAG"}</code> env var at spawn time.</li>
                      <li>Each player instance gets a <strong>30-minute TTL</strong> — the container is destroyed after that.</li>
                      <li>Players may <strong>renew twice</strong> before they must request a fresh instance.</li>
                      <li>Containers run on an <strong>isolated internal network</strong> (no internet). <code>CAP_NET_ADMIN</code> and <code>CAP_SYS_ADMIN</code> are dropped. PID limit prevents fork bombs.</li>
                      {form.connectionType === "TCP" && (
                        <li>TCP mode: player connects with <code>nc &lt;host&gt; &lt;port&gt;</code>. Your binary should print the flag to stdout when solved.</li>
                      )}
                    </ul>
                  </div>

                  {/* Starter templates — collapsible */}
                  <DockerTemplates connectionType={form.connectionType} flagEnv={form.dockerFlagEnv || "FLAG"} />
                </>
              )}
          </div>
        </div>

        {/* ═══ Card 5: Hints ══════════════════════════════════════════════ */}
        <div className="psp-card" style={{ marginBottom: 24, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Lightbulb size={15} color="#d97706" />
              <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                Hints ({hints.length})
              </h2>
            </div>
            <button
              className="psp-btn psp-btn-secondary"
              style={{ height: 30, padding: "0 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}
              onClick={() => setHints(prev => [...prev, emptyHint()])}
            >
              <Plus size={13} /> Add Hint
            </button>
          </div>

          {hints.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: "16px 0" }}>
              No hints yet. Students will solve this without help.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {hints.map((h, i) => (
                <div key={h._key} style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 14, background: "var(--bg-secondary)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Hint #{i + 1}</span>
                    <button
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)", display: "flex", alignItems: "center" }}
                      onClick={() => setHints(prev => prev.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div>
                      <label className="psp-form-label">Hint Text *</label>
                      <textarea
                        className="psp-form-textarea"
                        rows={2}
                        value={h.text}
                        onChange={e => setHints(prev => prev.map((x, idx) => idx === i ? { ...x, text: e.target.value } : x))}
                        placeholder="The hint text shown when unlocked…"
                      />
                      <FieldError errors={errors} fieldName={`hint_${i}_text`} />
                    </div>
                    <div style={{ maxWidth: 180 }}>
                      <label className="psp-form-label">Point Cost</label>
                      <input
                        className="psp-form-input"
                        type="number"
                        min={0}
                        value={h.cost}
                        onChange={e => setHints(prev => prev.map((x, idx) => idx === i ? { ...x, cost: parseInt(e.target.value) || 0 } : x))}
                      />
                      <FieldError errors={errors} fieldName={`hint_${i}_cost`} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ═══ Footer actions ══════════════════════════════════════════════ */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 32 }}>
          <Link href="/admin/ctf">
            <button className="psp-btn psp-btn-secondary" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <ArrowLeft size={14} /> Cancel
            </button>
          </Link>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="psp-btn psp-btn-secondary"
              style={{ borderColor: "#d97706", color: "#d97706", opacity: saving ? 0.6 : 1 }}
              disabled={saving}
              onClick={() => handleSave(false)}
            >
              {saving && saveMode === "draft" ? "Saving…" : "Save as Draft"}
            </button>
            <button
              className="psp-btn psp-btn-primary"
              style={{ opacity: saving ? 0.6 : 1 }}
              disabled={saving}
              onClick={() => handleSave(true)}
            >
              {saving && saveMode === "publish" ? "Publishing…" : (isEdit ? "Update & Publish" : "Create & Publish")}
            </button>
          </div>
        </div>

      </div>
    </>
  );
};

export default TeacherCTFForm;
