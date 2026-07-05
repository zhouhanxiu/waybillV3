import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(d: string | Date | number) {
  return new Date(d).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}秒`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}分钟`;
  if (ms < 86400000) return `${Math.round(ms / 3600000)}小时`;
  return `${Math.round(ms / 86400000)}天`;
}
