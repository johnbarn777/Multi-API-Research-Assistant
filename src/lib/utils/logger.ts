/* eslint-disable no-console */
export const logger = {
  info(message: string, metadata?: Record<string, unknown>) {
    console.log(JSON.stringify({ level: "info", message, ...metadata }));
  },
  error(message: string, metadata?: Record<string, unknown>) {
    console.error(JSON.stringify({ level: "error", message, ...metadata }));
  },
  warn(message: string, metadata?: Record<string, unknown>) {
    console.warn(JSON.stringify({ level: "warn", message, ...metadata }));
  }
};
