"use client";
import { useEffect, useState } from "react";

export type ToastType = "error" | "warning" | "success" | "info";

export interface ToastItem {
  id:       string;
  type:     ToastType;
  title:    string;
  message:  string;
  duration: number;
}

// Module-level singleton — works across the entire app without a Provider
let _listeners: Array<(items: ToastItem[]) => void> = [];
let _items:     ToastItem[] = [];

function _notify() {
  _listeners.forEach(fn => fn([..._items]));
}

export const toast = {
  show(type: ToastType, title: string, message: string, duration = 5000): string {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    _items = [..._items, { id, type, title, message, duration }];
    _notify();
    if (duration > 0) setTimeout(() => toast.dismiss(id), duration);
    return id;
  },
  error  (title: string, message: string) { return toast.show("error",   title, message, 6000); },
  warning(title: string, message: string) { return toast.show("warning", title, message, 5000); },
  success(title: string, message: string) { return toast.show("success", title, message, 4000); },
  info   (title: string, message: string) { return toast.show("info",    title, message, 4000); },
  dismiss(id: string) {
    _items = _items.filter(t => t.id !== id);
    _notify();
  },
};

const ICONS: Record<ToastType, string> = {
  error:   "❌",
  warning: "⚠️",
  success: "✅",
  info:    "ℹ️",
};

const LEFT_BORDER: Record<ToastType, string> = {
  error:   "#de350b",
  warning: "#ff8b00",
  success: "#00875a",
  info:    "#0052cc",
};

const TITLE_COLOR: Record<ToastType, string> = {
  error:   "#de350b",
  warning: "#ff8b00",
  success: "#00875a",
  info:    "#0052cc",
};

export function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    _listeners.push(setItems);
    setItems([..._items]); // sync initial state
    return () => { _listeners = _listeners.filter(l => l !== setItems); };
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Notifications"
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        width: 320,
        maxWidth: "calc(100vw - 2rem)",
      }}
    >
      {items.map(item => (
        <div
          key={item.id}
          role="alert"
          className="psp-toast"
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            background: "var(--bg-primary)",
            borderRadius: 3,
            border: "1px solid var(--border)",
            borderLeft: `4px solid ${LEFT_BORDER[item.type]}`,
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
            padding: "12px 14px",
            animation: "psp-slide-in 0.2s cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>{ICONS[item.type]}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: TITLE_COLOR[item.type], margin: 0 }}>
              {item.title}
            </p>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "3px 0 0", lineHeight: 1.5 }}>
              {item.message}
            </p>
          </div>
          <button
            onClick={() => toast.dismiss(item.id)}
            aria-label="Dismiss"
            style={{
              background: "none",
              border: "none",
              color: "#b3bac5",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              flexShrink: 0,
              marginTop: 0,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
