import type { Incident } from "./types";

export async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return (await r.json()) as T & { ok: boolean };
}

export async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return (await r.json()) as T & { ok: boolean };
}

export const inr = (paise: number): string => {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
};

export const rupees2 = (paise: number): string => {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export const timeOf = (iso: string): string => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
};

export const dateOf = (iso: string): string => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};

export const statusTone = (s: Incident["status"]): string => {
  switch (s) {
    case "RESOLVED": return "text-ok bg-ok-soft";
    case "PROPOSED": return "text-warn bg-warn-soft";
    case "PAGED": return "text-crit bg-crit-soft";
    case "TICKET": return "text-info bg-info-soft";
    default: return "text-muted bg-paper";
  }
};

export const sevTone = (s: Incident["severity"]): string => {
  switch (s) {
    case "SEV-1": return "text-crit bg-crit-soft";
    case "SEV-2": return "text-warn bg-warn-soft";
    default: return "text-info bg-info-soft";
  }
};

export const classLabel: Record<string, string> = {
  TIMING_GAP: "timing gap",
  AMOUNT_DRIFT: "amount drift",
  MISSING_ENTRY: "missing entry",
  DUPLICATE_CHARGE: "duplicate charge",
  FEE_MISMATCH: "fee mismatch",
  CURRENCY_MISMATCH: "currency mismatch",
};

export const classTone: Record<string, string> = {
  TIMING_GAP: "text-info bg-info-soft",
  AMOUNT_DRIFT: "text-warn bg-warn-soft",
  MISSING_ENTRY: "text-accent bg-accent-soft",
  DUPLICATE_CHARGE: "text-crit bg-crit-soft",
  FEE_MISMATCH: "text-accent bg-accent-soft",
  CURRENCY_MISMATCH: "text-crit bg-crit-soft",
};

export const runbookFor: Record<string, string> = {
  TIMING_GAP: "RBT-01",
  AMOUNT_DRIFT: "RBT-02",
  MISSING_ENTRY: "RBT-03",
  DUPLICATE_CHARGE: "RBT-04",
  FEE_MISMATCH: "RBT-05",
  CURRENCY_MISMATCH: "RBT-06",
};
