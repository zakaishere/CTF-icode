import React from "react";

interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
  variant?: "primary" | "secondary" | "danger" | "success" | "ghost" | "urgent";
  size?: "sm" | "md" | "lg" | "xl";
  icon?: React.ReactNode;
}

export function LoadingButton({
  loading,
  loadingText,
  variant = "primary",
  size = "md",
  icon,
  children,
  className = "",
  disabled,
  ...props
}: LoadingButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`btn btn-${variant} btn-${size} ${loading ? "btn-loading" : ""} ${className}`}
    >
      {loading ? (
        <>
          <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
            <circle
              cx="12" cy="12" r="10"
              stroke="currentColor" strokeWidth="3" strokeDasharray="30 70"
            />
          </svg>
          <span>{loadingText ?? "Loading..."}</span>
        </>
      ) : (
        <>
          {icon && <span>{icon}</span>}
          {children}
        </>
      )}
    </button>
  );
}
