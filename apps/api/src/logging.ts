import pino, { type Logger } from "pino";

export function createLogger(level: string): Logger {
  return pino({
    level,
    base: null,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "request.headers.authorization",
        "request.headers.cookie",
        "sessionToken",
        "password",
        "secret",
      ],
      censor: "[REDACTED]",
    },
  });
}
