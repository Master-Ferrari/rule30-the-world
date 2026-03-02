/** Rule parser — syntax: left(center)right>output with 0/1/x input symbols. */

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

export interface RuleSyntaxError {
  line: number;
  message: string;
  raw: string;
}

const LINE_RE = /^([01x]*)\(([01x])\)([01x]*)$/;

/**
 * Parse a single rule line like `0(1)0>1` or `1(x)1>1`.
 * Returns null for blank/comment lines. Throws on bad syntax.
 */
export function parseRuleLine(raw: string): ParsedEntry[] | null {
  const trimmed = raw.trim();
  const hasSymmetry = /-{1,2}[sS]/.test(trimmed);
  const line = trimmed.replace(/-{1,2}[sS]/g, "").replace(/\s/g, "").toLowerCase();
  if (!line || line.startsWith("#")) return null;

  const m = line.match(LINE_RE);
  if (!m) throw new Error(`Bad syntax: '${raw.trim()}'`);

  const [, leftStr, centerStr, rightStr] = m;
  const leftCtx = leftStr.length;
  const rightCtx = rightStr.length;
  const output = 1;

  const entries: ParsedEntry[] = expandTokens([...leftStr, centerStr, ...rightStr]).map((pattern) => ({
    pattern, leftCtx, rightCtx, output,
  }));

  if (hasSymmetry) {
    const mirLeft = [...rightStr].reverse().join("");
    const mirRight = [...leftStr].reverse().join("");
    expandTokens([...mirLeft, centerStr, ...mirRight]).forEach((pattern) => {
      entries.push({ pattern, leftCtx: mirLeft.length, rightCtx: mirRight.length, output });
    });
  }

  return entries;
}

/**
 * Parse all lines, return valid entries + error count.
 */
export function parseText(text: string): { entries: ParsedEntry[]; errors: number; syntaxErrors: RuleSyntaxError[] } {
  const entries: ParsedEntry[] = [];
  const syntaxErrors: RuleSyntaxError[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    try {
      const e = parseRuleLine(line);
      if (e) entries.push(...e);
    } catch (error) {
      syntaxErrors.push({
        line: i + 1,
        message: error instanceof Error ? error.message : "Unknown syntax error",
        raw: line.trim(),
      });
    }
  }
  return { entries, errors: syntaxErrors.length, syntaxErrors };
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

  const name = computeRuleName(entries);
  return { leftCtx: effLeft, rightCtx: effRight, width, nPatterns, table, name };
}

/**
 * Compute rule name like "rule30base3".
 * Name numbering uses symmetric base: max offset on each side.
 */
function computeRuleName(entries: ParsedEntry[]): string {
  const base = computeNameBase(entries);
  const maxOffset = (base - 1) / 2;
  const nPatterns = 1 << base;
  const nameTable = new Uint8Array(nPatterns);

  // Expand each parsed rule to symmetric base by adding don't-care bits.
  for (const entry of entries) {
    const extraLeft = maxOffset - entry.leftCtx;
    const extraRight = maxOffset - entry.rightCtx;
    const nLeft = 1 << extraLeft;
    const nRight = 1 << extraRight;

    for (let lc = 0; lc < nLeft; lc++) {
      for (let rc = 0; rc < nRight; rc++) {
        let idx = 0;
        for (let j = 0; j < extraLeft; j++) {
          idx = (idx << 1) | ((lc >> (extraLeft - 1 - j)) & 1);
        }
        for (const bit of entry.pattern) {
          idx = (idx << 1) | bit;
        }
        for (let j = 0; j < extraRight; j++) {
          idx = (idx << 1) | ((rc >> (extraRight - 1 - j)) & 1);
        }
        nameTable[idx] = entry.output;
      }
    }
  }

  if (base <= 5) {
    let n = 0;
    for (let i = 0; i < nameTable.length; i++) {
      if (nameTable[i]) n += 2 ** i;
    }
    return `rule ${n} radius ${maxOffset}`;
  }

  let n = 0n;
  for (let i = 0; i < nameTable.length; i++) {
    if (nameTable[i]) n |= 1n << BigInt(i);
  }
  const s = n.toString();
  if (s.length > 22) {
    return `rule ${s.slice(0, 20)}.. radius ${maxOffset}`;
  }
  return `rule ${s} radius ${maxOffset}`;
}

function computeNameBase(entries: ParsedEntry[]): number {
  if (entries.length === 0) return 1;
  const maxOffset = Math.max(...entries.map((entry) => Math.max(entry.leftCtx, entry.rightCtx)));
  return maxOffset * 2 + 1;
}

function expandTokens(tokens: string[]): number[][] {
  let patterns: number[][] = [[]];
  for (const token of tokens) {
    if (token === "x") {
      const next: number[][] = [];
      for (const pattern of patterns) {
        next.push([...pattern, 0], [...pattern, 1]);
      }
      patterns = next;
      continue;
    }
    const bit = Number(token);
    patterns = patterns.map((pattern) => [...pattern, bit]);
  }
  return patterns;
}
