/** Case-insensitive column lookup: col('Entry time') -> index or -1. */
export function columns(header: string[]): (name: string) => number {
  const norm = header.map((h) => h.trim().toLowerCase());
  return (name: string) => norm.indexOf(name.toLowerCase());
}

export const hasColumns = (header: string[], names: string[]) => names.every((n) => columns(header)(n) >= 0);
