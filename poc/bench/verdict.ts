// The F9 classifier, in one place. compliance.ts and ab.ts both import it so their numbers
// stay comparable — two copies of these regexes would drift and quietly break the comparison
// against F12/F14. Every check runs against NARRATION only; dialogue may lie.
export const FIXTURE = 'The Silver Key';
export const DIRECTIVE =
  "Marek's man makes it clear the debt is due tonight, and Aldis reaches into his coat.";

export function verdict(prose: string): { bad: string[]; mentioned: boolean } {
  const narr = prose.replace(/["“][^"”]*["”]/g, ' ');
  const near = (w: string) => narr.split(/(?<=[.!?])\s+/)
    .some((s) => /\bkey\b/i.test(s) && new RegExp(`\\b${w}\\b`, 'i').test(s));
  const bad: string[] = [];
  if (/silver key|key of silver/i.test(narr)) bad.push('called the key silver');
  if (near('iron') || near('steel')) bad.push('called the key iron or steel');
  if (near('warm') || near('hot')) bad.push('called the key warm');
  if (/(brass, not silver|ex-watch sergeant|eleven crowns owed)/i.test(narr)) bad.push('restated canon verbatim');
  if (/\bI \b|\bmy \b/i.test(narr)) bad.push('broke third person');
  return { bad, mentioned: /\bkeys?\b/i.test(narr) };
}
