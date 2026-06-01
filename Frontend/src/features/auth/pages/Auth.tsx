"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Eye, EyeOff, CheckCircle2, RefreshCw, ArrowLeft, Loader2,
  ArrowRight, Lock, Mail, User, Shield,
} from "lucide-react";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import {
  registerPlayer, forgotPassword, resetPassword,
  verifyEmail, resendVerification,
  type RegisterPlayerRequest, type LoginRequest,
} from "@/lib/api";

/* ── Schemas (unchanged) ── */
const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1, "Password is required"),
});
const playerSchema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName:  z.string().min(1, "Required"),
  email:     z.string().email(),
  password:  z.string().min(6, "Min 6 characters"),
});
const forgotEmailSchema = z.object({ email: z.string().email() });
const otpSchema   = z.object({ code: z.string().length(6, "Must be 6 digits") });
const newPassSchema = z.object({
  password: z.string().min(6),
  confirm:  z.string().min(6),
}).refine((d) => d.password === d.confirm, { message: "Passwords don't match", path: ["confirm"] });

type Mode = "login" | "register" | "forgot";

/* ── Circuit corner decoration ── */
function CircuitCorner() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ width: "100%", height: "100%" }}>
      <path d="M0 14 L14 14 L18 10 L30 10" stroke="rgba(96,165,255,0.5)" strokeWidth="1"/>
      <path d="M0 22 L22 22" stroke="rgba(96,165,255,0.3)" strokeWidth="1"/>
      <path d="M10 0 L10 18 L14 22" stroke="rgba(96,165,255,0.4)" strokeWidth="1"/>
      <circle cx="14" cy="14" r="2" fill="rgba(96,165,255,0.6)"/>
      <circle cx="22" cy="22" r="1.5" fill="rgba(96,165,255,0.4)"/>
      <circle cx="30" cy="10" r="1.5" fill="rgba(96,165,255,0.5)"/>
    </svg>
  );
}

/* ── Auth Backdrop SVG ── */
function AuthBackdrop() {
  return (
    <svg
      width="100%" height="100%"
      viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.5, zIndex: 0 }}
    >
      <defs>
        <linearGradient id="cline" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%"   stopColor="rgba(96,165,255,0)"/>
          <stop offset="50%"  stopColor="rgba(96,165,255,0.35)"/>
          <stop offset="100%" stopColor="rgba(96,165,255,0)"/>
        </linearGradient>
      </defs>
      <g stroke="url(#cline)" strokeWidth="1" fill="none">
        <path d="M0 140 L160 140 L200 100 L320 100"/>
        <path d="M0 220 L120 220 L160 260 L240 260 L280 220 L420 220"/>
        <path d="M0 360 L80 360 L120 320 L260 320"/>
        <path d="M0 480 L200 480 L240 520 L380 520"/>
        <path d="M0 620 L100 620 L140 580 L300 580"/>
        <path d="M0 760 L180 760 L220 720 L360 720"/>
      </g>
      <g stroke="url(#cline)" strokeWidth="1" fill="none" transform="translate(1440,0) scale(-1,1)">
        <path d="M0 160 L140 160 L180 200 L300 200"/>
        <path d="M0 280 L220 280"/>
        <path d="M0 440 L80 440 L120 480 L240 480 L280 440 L400 440"/>
        <path d="M0 560 L160 560"/>
        <path d="M0 700 L120 700 L160 660 L300 660"/>
      </g>
      <g fill="rgba(96,165,255,0.6)">
        <circle cx="160" cy="140" r="2.5"/>
        <circle cx="280" cy="220" r="2.5"/>
        <circle cx="120" cy="320" r="2.5"/>
        <circle cx="240" cy="520" r="2.5"/>
        <circle cx="1260" cy="160" r="2.5"/>
        <circle cx="1320" cy="440" r="2.5"/>
        <circle cx="1340" cy="700" r="2.5"/>
      </g>
    </svg>
  );
}

/* ── Logo Lockup ── */
function ICodeLogo({ size = "md" }: { size?: "md" | "lg" }) {
  const isLg = size === "lg";
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: isLg ? 16 : 12 }}>
      <Image
        src="/icode-logo.svg"
        alt="iCODE"
        width={isLg ? 48 : 36}
        height={isLg ? 48 : 36}
        style={{ filter: "drop-shadow(0 0 10px rgba(96,165,255,0.55))" }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{
          fontFamily: "var(--ict-font-display, 'Chakra Petch', sans-serif)",
          fontWeight: 700, letterSpacing: "0.06em",
          fontSize: isLg ? 24 : 18, color: "#eaf0ff",
          display: "inline-flex", alignItems: "baseline",
        }}>
          <span style={{ color: "#60a5ff", textShadow: "0 0 12px rgba(96,165,255,0.6)", marginRight: 1 }}>i</span>
          CODE
        </span>
        <span style={{
          fontFamily: "var(--ict-font-display, 'Chakra Petch', sans-serif)",
          fontWeight: 600, fontSize: isLg ? 10 : 9,
          letterSpacing: "0.28em", textTransform: "uppercase" as const,
          color: "#6b7ea3", padding: "3px 8px",
          border: "1px solid rgba(130,165,255,0.22)", borderRadius: 4,
          width: "fit-content",
        }}>
          CTF
        </span>
      </div>
    </div>
  );
}

/* ── Styled input ── */
function IctInput({
  label, type = "text", placeholder, error, help, icon, rightIcon, onRightIconClick, ...props
}: {
  label?: string; type?: string; placeholder?: string; error?: string; help?: string;
  icon?: React.ReactNode; rightIcon?: React.ReactNode; onRightIconClick?: () => void;
  [k: string]: any;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {label && (
        <label className="ict-field-label" style={{ marginBottom: 6 }}>{label}</label>
      )}
      <div className="ict-input-wrap">
        {icon && <span className="ict-input-icon">{icon}</span>}
        <input
          type={type}
          placeholder={placeholder}
          className={`ict-input ict-mono${icon ? " ict-input-icon-input" : ""}${error ? " error" : ""}`}
          style={{
            fontFamily: type === "password" || placeholder?.startsWith("CTF") || placeholder?.includes("0000")
              ? "var(--ict-font-mono, monospace)"
              : "var(--ict-font-body, Inter, sans-serif)",
            paddingRight: rightIcon ? 42 : undefined,
          }}
          {...props}
        />
        {rightIcon && (
          <button
            type="button"
            onClick={onRightIconClick}
            aria-label="toggle"
            style={{
              position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
              background: "transparent", border: 0, color: "var(--ict-text-muted)",
              width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", borderRadius: 4,
            }}
          >
            {rightIcon}
          </button>
        )}
      </div>
      {error && <div className="ict-field-error">{error}</div>}
      {help  && <div className="ict-field-help">{help}</div>}
    </div>
  );
}

/* ── Auth Switch Tabs ── */
function AuthSwitch({ mode, setMode }: { mode: "login"|"register"; setMode: (m: "login"|"register") => void }) {
  const ref    = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState({ left: 3, width: 80 });

  useEffect(() => {
    if (!ref.current) return;
    const btn = ref.current.querySelector<HTMLButtonElement>(`[data-mode="${mode}"]`);
    if (btn) setPill({ left: btn.offsetLeft, width: btn.offsetWidth });
  }, [mode]);

  return (
    <div ref={ref} className="ict-auth-switch" style={{ position: "relative" }}>
      <span
        className="ict-auth-switch-pill"
        style={{ transform: `translateX(${pill.left - 3}px)`, width: pill.width }}
      />
      {(["login", "register"] as const).map(m => (
        <button
          key={m}
          data-mode={m}
          className={`ict-auth-switch-btn${mode === m ? " active" : ""}`}
          onClick={() => setMode(m)}
          type="button"
        >
          {m === "login" ? "Login" : "Register"}
        </button>
      ))}
    </div>
  );
}

/* ── Error Banner ── */
function ErrBanner({ msg }: { msg: string }) {
  return (
    <div className="ict-toast ict-toast-danger" role="alert" style={{ fontSize: 13 }}>
      <span>⚠</span> {msg}
    </div>
  );
}

/* ── LOGIN ── */
function LoginForm({ onForgot, onRegister }: { onForgot: () => void; onRegister: () => void }) {
  const { login } = useAuth();
  const router = useRouter();
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (v: any) => {
    setError(""); setLoading(true);
    try {
      const res = await login(v as LoginRequest);
      if (res.role === "ADMIN") router.push("/admin");
      else router.push("/welcome");
    } catch (e: any) { setError(e.message || "Login failed"); }
    finally { setLoading(false); }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="ict-auth-form">
      {error && <ErrBanner msg={error} />}
      <IctInput
        label="Email address"
        type="email"
        placeholder="player@icode.ma"
        icon={<Mail size={14} />}
        error={errors.email?.message}
        autoComplete="email"
        {...register("email")}
      />
      <IctInput
        label="Password"
        type={showPwd ? "text" : "password"}
        placeholder="••••••••••••"
        icon={<Lock size={14} />}
        rightIcon={showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
        onRightIconClick={() => setShowPwd(s => !s)}
        error={errors.password?.message}
        autoComplete="current-password"
        {...register("password")}
      />

      <div className="ict-auth-meta" style={{ fontSize: 13 }}>
        <label className="ict-checkbox">
          <span className="ict-checkbox-box" />
          <span style={{ color: "var(--ict-text-dim)" }}>Remember me</span>
        </label>
        <a
          onClick={onForgot}
          style={{ color: "var(--ict-accent-bright)", cursor: "pointer", fontSize: 12 }}
        >
          Forgot password?
        </a>
      </div>

      <button
        type="submit"
        className="ict-btn ict-btn-primary ict-btn-lg ict-btn-block"
        disabled={loading}
        style={{ marginTop: 4 }}
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : (
          <><span>Access Platform</span><ArrowRight size={14} /></>
        )}
      </button>

      <div className="ict-divider">or</div>

      <div style={{ textAlign: "center", fontSize: 13, color: "var(--ict-text-muted)" }}>
        Don&apos;t have an account?{" "}
        <a
          onClick={onRegister}
          style={{ color: "var(--ict-accent-bright)", cursor: "pointer", fontWeight: 500 }}
        >
          Create one
        </a>
      </div>
    </form>
  );
}

/* ── OTP VERIFY ── */
function EmailVerifyStep({ email, onBack }: { email: string; onBack: () => void }) {
  const [done, setDone]         = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [resending, setResending] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(z.object({ otpCode: z.string().length(6) })),
    defaultValues: { otpCode: "" },
  });

  if (done) return (
    <div style={{ textAlign: "center", padding: "24px 0" }}>
      <div style={{
        width: 56, height: 56,
        background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.35)",
        borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 16px", boxShadow: "0 0 24px rgba(52,211,153,0.3)",
      }}>
        <CheckCircle2 size={28} color="#34d399" />
      </div>
      <div className="ict-h3" style={{ marginBottom: 8, textTransform: "none", fontSize: 16 }}>Email verified!</div>
      <div style={{ fontSize: 13, color: "var(--ict-text-muted)", marginBottom: 20 }}>You can now sign in.</div>
      <button onClick={onBack} style={{
        color: "var(--ict-accent-bright)", background: "none", border: "none",
        cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 4, margin: "0 auto",
        fontFamily: "inherit",
      }}>
        <ArrowLeft size={13} /> Back to Sign In
      </button>
    </div>
  );

  return (
    <form onSubmit={handleSubmit(async (v: any) => {
      setError(""); setLoading(true);
      try { await verifyEmail(email, v.otpCode); setDone(true); }
      catch (e: any) { setError(e.message || "Invalid code"); }
      finally { setLoading(false); }
    })} className="ict-auth-form">
      <div style={{ fontSize: 13, color: "var(--ict-text-dim)", lineHeight: 1.6 }}>
        We sent a 6-digit code to{" "}
        <strong style={{ color: "var(--ict-text)", fontFamily: "var(--ict-font-mono)" }}>{email}</strong>.
      </div>
      <IctInput
        label="Verification Code"
        placeholder="000000"
        maxLength={6}
        style={{ textAlign: "center", letterSpacing: "0.4em", fontSize: 18 }}
        error={(errors as any).otpCode?.message}
        {...register("otpCode")}
      />
      {error && <ErrBanner msg={error} />}
      <button type="submit" className="ict-btn ict-btn-primary ict-btn-lg ict-btn-block" disabled={loading}>
        {loading ? <Loader2 size={14} className="animate-spin" /> : <><span>Verify Email</span><ArrowRight size={14} /></>}
      </button>
      <button
        type="button"
        onClick={async () => {
          setResending(true);
          try { await resendVerification(email); } finally { setResending(false); }
        }}
        style={{
          width: "100%", background: "none", border: "none",
          color: "var(--ict-text-muted)", fontSize: 12, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
          fontFamily: "inherit",
        }}
      >
        <RefreshCw size={12} className={resending ? "animate-spin" : ""} />
        {resending ? "Resending…" : "Resend code"}
      </button>
    </form>
  );
}

/* ── REGISTER ── */
function RegisterForm({ onLogin }: { onLogin: () => void }) {
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const form = useForm({
    resolver: zodResolver(playerSchema),
    defaultValues: { firstName: "", lastName: "", email: "", password: "" },
  });

  if (pendingEmail) return <EmailVerifyStep email={pendingEmail} onBack={() => setPendingEmail(null)} />;

  return (
    <form onSubmit={form.handleSubmit(async (v) => {
      setError(""); setLoading(true);
      try {
        const res = await registerPlayer(v as RegisterPlayerRequest);
        // If the server didn't ask us to verify email, go straight to login
        const needsVerify = res.message?.toLowerCase().includes("verify")
          || res.message?.toLowerCase().includes("check your email")
          || res.message?.toLowerCase().includes("verification");
        if (needsVerify) setPendingEmail(v.email);
        else onLogin();
      } catch (e: any) { setError(e.message || "Registration failed"); }
      finally { setLoading(false); }
    })} className="ict-auth-form">
      {error && <ErrBanner msg={error} />}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <IctInput
          label="First Name" placeholder="Ali"
          icon={<User size={14} />}
          error={form.formState.errors.firstName?.message}
          {...form.register("firstName")}
        />
        <IctInput
          label="Last Name" placeholder="Benali"
          error={form.formState.errors.lastName?.message}
          {...form.register("lastName")}
        />
      </div>
      <IctInput
        label="Email" type="email" placeholder="player@uae.ac.ma"
        icon={<Mail size={14} />}
        error={form.formState.errors.email?.message}
        autoComplete="email"
        {...form.register("email")}
      />
      <IctInput
        label="Password" type={showPwd ? "text" : "password"} placeholder="Min. 6 characters"
        icon={<Lock size={14} />}
        rightIcon={showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
        onRightIconClick={() => setShowPwd(s => !s)}
        help="Min 6 characters · mix letters & numbers."
        error={form.formState.errors.password?.message}
        autoComplete="new-password"
        {...form.register("password")}
      />
      <button type="submit" className="ict-btn ict-btn-primary ict-btn-lg ict-btn-block" disabled={loading}>
        {loading ? <Loader2 size={14} className="animate-spin" /> : <><span>Create Account</span><ArrowRight size={14} /></>}
      </button>
      <div style={{ textAlign: "center", fontSize: 13, color: "var(--ict-text-muted)" }}>
        Already have an account?{" "}
        <a onClick={onLogin} style={{ color: "var(--ict-accent-bright)", cursor: "pointer", fontWeight: 500 }}>Sign in</a>
      </div>
    </form>
  );
}

/* ── FORGOT PASSWORD ── */
function ForgotFlow({ onBack }: { onBack: () => void }) {
  const [step, setStep]     = useState<"email" | "otp" | "pass" | "done">("email");
  const [email, setEmail]   = useState("");
  const [otp, setOtp]       = useState("");
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const emailForm = useForm({ resolver: zodResolver(forgotEmailSchema), defaultValues: { email: "" } });
  const otpForm   = useForm({ resolver: zodResolver(otpSchema),         defaultValues: { code: "" } });
  const passForm  = useForm({ resolver: zodResolver(newPassSchema),     defaultValues: { password: "", confirm: "" } });

  if (step === "done") return (
    <div style={{ textAlign: "center", padding: "24px 0" }}>
      <div style={{
        width: 56, height: 56,
        background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.35)",
        borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 16px", boxShadow: "0 0 24px rgba(52,211,153,0.3)",
      }}>
        <CheckCircle2 size={28} color="#34d399" />
      </div>
      <div className="ict-h3" style={{ marginBottom: 8, textTransform: "none", fontSize: 16 }}>Password reset!</div>
      <div style={{ fontSize: 13, color: "var(--ict-text-muted)", marginBottom: 20 }}>You can now sign in with your new password.</div>
      <button onClick={onBack} style={{
        color: "var(--ict-accent-bright)", background: "none", border: "none",
        cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 4, margin: "0 auto", fontFamily: "inherit",
      }}>
        <ArrowLeft size={13} /> Back to Sign In
      </button>
    </div>
  );

  return (
    <div className="ict-auth-form">
      <button onClick={onBack} style={{
        display: "flex", alignItems: "center", gap: 4,
        fontSize: 13, color: "var(--ict-text-muted)",
        background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
      }}>
        <ArrowLeft size={13} /> Back to Sign In
      </button>

      {step === "email" && (
        <form onSubmit={emailForm.handleSubmit(async (v) => {
          setError(""); setLoading(true);
          try { await forgotPassword(v.email); setEmail(v.email); setStep("otp"); }
          catch (e: any) { setError(e.message || "Failed"); }
          finally { setLoading(false); }
        })} className="ict-auth-form">
          <div style={{ fontSize: 13, color: "var(--ict-text-dim)", lineHeight: 1.6 }}>Enter your email to receive a reset code.</div>
          <IctInput
            label="Email" type="email" placeholder="player@icode.ma"
            icon={<Mail size={14} />}
            error={emailForm.formState.errors.email?.message}
            {...emailForm.register("email")}
          />
          {error && <ErrBanner msg={error} />}
          <button type="submit" className="ict-btn ict-btn-primary ict-btn-block ict-btn-lg" disabled={loading}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <><span>Send Reset Code</span><ArrowRight size={14} /></>}
          </button>
        </form>
      )}
      {step === "otp" && (
        <form onSubmit={otpForm.handleSubmit(async (v) => { setOtp(v.code); setStep("pass"); })} className="ict-auth-form">
          <div style={{ fontSize: 13, color: "var(--ict-text-dim)", lineHeight: 1.6 }}>
            Code sent to <strong style={{ fontFamily: "var(--ict-font-mono)", color: "var(--ict-text)" }}>{email}</strong>.
          </div>
          <IctInput
            label="6-Digit Code" placeholder="000000" maxLength={6}
            style={{ textAlign: "center", letterSpacing: "0.4em", fontSize: 18 }}
            error={otpForm.formState.errors.code?.message}
            {...otpForm.register("code")}
          />
          <button type="submit" className="ict-btn ict-btn-primary ict-btn-block ict-btn-lg">
            <span>Verify Code</span><ArrowRight size={14} />
          </button>
        </form>
      )}
      {step === "pass" && (
        <form onSubmit={passForm.handleSubmit(async (v) => {
          setError(""); setLoading(true);
          try { await resetPassword(email, otp, v.password); setStep("done"); }
          catch (e: any) { setError(e.message || "Failed"); }
          finally { setLoading(false); }
        })} className="ict-auth-form">
          <IctInput
            label="New Password" type="password" placeholder="Min. 6 characters"
            icon={<Lock size={14} />}
            error={passForm.formState.errors.password?.message}
            {...passForm.register("password")}
          />
          <IctInput
            label="Confirm Password" type="password" placeholder="Same as above"
            icon={<Lock size={14} />}
            error={passForm.formState.errors.confirm?.message}
            {...passForm.register("confirm")}
          />
          {error && <ErrBanner msg={error} />}
          <button type="submit" className="ict-btn ict-btn-primary ict-btn-block ict-btn-lg" disabled={loading}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <><span>Reset Password</span><ArrowRight size={14} /></>}
          </button>
        </form>
      )}
    </div>
  );
}

/* ── PAGE ── */
export default function AuthPage() {
  const [mode, setMode] = useState<Mode>("login");

  return (
    <div className="icode-ctf ict-auth-wrap">
      <AuthBackdrop />

      <div className="ict-auth-card ict-enter">
        {/* Circuit corners */}
        <div className="ict-corner ict-corner-tl"><CircuitCorner /></div>
        <div className="ict-corner ict-corner-tr"><CircuitCorner /></div>
        <div className="ict-corner ict-corner-bl"><CircuitCorner /></div>
        <div className="ict-corner ict-corner-br"><CircuitCorner /></div>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <ICodeLogo size="lg" />
          </div>
          {mode !== "forgot" && (
            <div className="ict-auth-tagline">
              Prepare<span>·</span>Solve<span>·</span>Capture
            </div>
          )}
          {mode === "forgot" && (
            <div className="ict-auth-tagline">Password Recovery</div>
          )}
        </div>

        {/* Mode switch (login/register only) */}
        {mode !== "forgot" && (
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
            <AuthSwitch mode={mode as "login" | "register"} setMode={setMode} />
          </div>
        )}

        {/* Content */}
        {mode === "forgot"
          ? <ForgotFlow onBack={() => setMode("login")} />
          : mode === "login"
          ? <LoginForm onForgot={() => setMode("forgot")} onRegister={() => setMode("register")} />
          : <RegisterForm onLogin={() => setMode("login")} />
        }

        {/* Footer */}
        <div className="ict-auth-footer">
          <span className="pfx">$</span> icode-ctf · prep workshop 2026
        </div>
      </div>
    </div>
  );
}
