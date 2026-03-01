/** Rule parser — same syntax as the Python version: left(center)right>output */

export interface ParsedEntry {
  pattern: number[];
  leftCtx: number;
  rightCtx: number;
  output: number;
}

export interface ComposedRule {
  leftCtx: number;
  rightCtx: number;
  width: number;
  nPatterns: number;
  table: Uint8Array;
  name: string;
}

const LINE_RE = /^([01]*)\(([01])\)([01]*)>([01])$/;

/**
 * Parse a single rule line like `0(1)0>1`.
 * Returns null for blank/comment lines. Throws on bad syntax.
 */
export function parseRuleLine(raw: string): ParsedEntry | null {
  const line = raw.trim().replace(/\s/g, "");
  if (!line || line.startsWith("#")) return null;

  const m = line.match(LINE_RE);
  if (!m) throw new Error(`Bad syntax: '${raw.trim()}'`);

  const [, leftStr, centerStr, rightStr, outStr] = m;
  const pattern = [
    ...leftStr.split("").map(Number),
    Number(centerStr),
    ...rightStr.split("").map(Number),
  ];

  return {
    pattern,
    leftCtx: leftStr.length,
    rightCtx: rightStr.length,
    output: Number(outStr),
  };
}

/**
 * Parse all lines, return valid entries + error count.
 */
export function parseText(text: string): { entries: ParsedEntry[]; errors: number } {
  const entries: ParsedEntry[] = [];
  let errors = 0;
  for (const line of text.split("\n")) {
    try {
      const e = parseRuleLine(line);
      if (e) entries.push(e);
    } catch {
      errors++;
    }
  }
  return { entries, errors };
}

/**
 * Compose parsed entries into a single truth table.
 * Narrower patterns applied first, wider ones override.
 */
export function fromEntries(entries: ParsedEntry[]): ComposedRule {
  if (entries.length === 0) {
    return { leftCtx: 0, rightCtx: 0, width: 1, nPatterns: 2, table: new Uint8Array(2), name: "rule0base1" };
  }

  const effLeft = Math.max(...entries.map((e) => e.leftCtx));
  const effRight = Math.max(...entries.map((e) => e.rightCtx));
  const width = effLeft + 1 + effRight;
  const nPatterns = 1 << width;
  const table = new Uint8Array(nPatterns); // all zeros

  // Sort by ascending width (narrow = general, wide = specific override)
  const sorted = [...entries].sort(
    (a, b) => a.leftCtx + 1 + a.rightCtx - (b.leftCtx + 1 + b.rightCtx)
  );

  for (const entry of sorted) {
    const extraLeft = effLeft - entry.leftCtx;
    const extraRight = effRight - entry.rightCtx;
    const nLeft = 1 << extraLeft;
    const nRight = 1 << extraRight;

    for (let lc = 0; lc < nLeft; lc++) {
      for (let rc = 0; rc < nRight; rc++) {
        // Build expanded pattern index (MSB-first)
        let idx = 0;
        // Left prefix bits
        for (let j = 0; j < extraLeft; j++) {
          idx = (idx << 1) | ((lc >> (extraLeft - 1 - j)) & 1);
        }
        // Original pattern bits
        for (const bit of entry.pattern) {
          idx = (idx << 1) | bit;
        }
        // Right suffix bits
        for (let j = 0; j < extraRight; j++) {
          idx = (idx << 1) | ((rc >> (extraRight - 1 - j)) & 1);
        }
        table[idx] = entry.output;
      }
    }
  }

  const name = computeRuleName(table, width);
  return { leftCtx: effLeft, rightCtx: effRight, width, nPatterns, table, name };
}

/**
 * Compute rule name like "rule30base3".
 */
function computeRuleName(table: Uint8Array, width: number): string {
  // Rule number = decimal value of output bits (bit i = output for pattern i)
  // For large tables this is a BigInt
  if (width <= 5) {
    let n = 0;
    for (let i = 0; i < table.length; i++) {
      if (table[i]) n |= 1 << i;
    }
    return `rule${n}base${width}`;
  }
  // For larger tables, use BigInt
  let n = 0n;
  for (let i = 0; i < table.length; i++) {
    if (table[i]) n |= 1n << BigInt(i);
  }
  const s = n.toString();
  if (s.length > 12) {
    return `rule${s.slice(0, 10)}..base${width}`;
  }
  return `rule${s}base${width}`;
}
