type LogLevel = "debug" | "info" | "warn" | "error";

const isDev = process.env.NODE_ENV === "development";

function formatMessage(level: LogLevel, context: string, message: string): string {
  const time = new Date().toLocaleTimeString("en-GB", { hour12: false });
  return `[${time}] [PSP/${context}] ${message}`;
}

const STYLES: Record<LogLevel, string> = {
  debug: "color:#6554c0;font-weight:normal",
  info:  "color:#0052cc;font-weight:600",
  warn:  "color:#ff8b00;font-weight:600",
  error: "color:#de350b;font-weight:700",
};

export const logger = {
  debug(context: string, message: string, data?: unknown) {
    if (!isDev) return;
    console.debug(`%c${formatMessage("debug", context, message)}`, STYLES.debug, data ?? "");
  },

  info(context: string, message: string, data?: unknown) {
    if (!isDev) return;
    console.info(`%c${formatMessage("info", context, message)}`, STYLES.info, data ?? "");
  },

  warn(context: string, message: string, data?: unknown) {
    console.warn(`%c${formatMessage("warn", context, message)}`, STYLES.warn, data ?? "");
  },

  error(context: string, message: string, error?: unknown) {
    console.error(`%c${formatMessage("error", context, message)}`, STYLES.error, error ?? "");
  },

  api(method: string, url: string, status: number, durationMs: number) {
    if (!isDev) return;
    const level: LogLevel = status >= 500 ? "error" : status >= 400 ? "warn" : "debug";
    const icon = status >= 500 ? "❌" : status >= 400 ? "⚠️" : "✓";
    console.log(
      `%c${icon} [API] ${method} ${url} → ${status} (${durationMs}ms)`,
      STYLES[level]
    );
  },
};
