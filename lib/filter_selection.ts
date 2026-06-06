export function toggleSelection(current: Set<string>, key: string): Set<string> {
  const next = new Set(current);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export function retainAvailable(current: Set<string>, available: string[]): Set<string> {
  const allowed = new Set(available);
  const next = new Set([...current].filter((key) => allowed.has(key)));
  return next.size === current.size ? current : next;
}
