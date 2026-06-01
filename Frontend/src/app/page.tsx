"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import AmbientBackdrop from "@/features/ctf/shared/AmbientBackdrop";

export default function RootSplash() {
  const router = useRouter();
  const { isAuthenticated, role } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      router.replace(role === "ADMIN" ? "/admin" : "/welcome");
    }
  }, [isAuthenticated, role, router]);

  return (
    <div className="icode-ctf ict-splash">
      <AmbientBackdrop />

      <div className="ict-splash-inner">
        <Image
          src="/icode-full-logo.svg"
          alt="iCODE"
          width={96}
          height={96}
          priority
          style={{ filter: "drop-shadow(0 0 22px rgba(96,165,255,0.55))" }}
        />

        <h1 className="ict-splash-title">iCODE CTF</h1>

        <p className="ict-splash-tagline">
          The competitive hacking arena. Capture the flag. Prove yourself.
        </p>

        <button
          type="button"
          className="ict-btn ict-btn-outline ict-btn-lg ict-splash-cta"
          onClick={() => router.push("/auth")}
        >
          <span>Access the platform</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
