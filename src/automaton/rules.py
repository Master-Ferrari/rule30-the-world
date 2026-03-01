"""Cellular automaton rules with configurable neighborhood width."""

import re
import numpy as np

_LINE_RE = re.compile(r'^([01]*)\(([01])\)([01]*)>([01])$')


def parse_rule_line(raw: str):
    """Parse a rule line like '0(1)0>1'.

    Returns (pattern_tuple, left_ctx, right_ctx, output) or None
    for blank/comment lines.  Raises ValueError on bad syntax.
    """
    line = raw.strip().replace(' ', '')
    if not line or line.startswith('#'):
        return None
    m = _LINE_RE.match(line)
    if not m:
        raise ValueError(f"Bad syntax: '{raw.strip()}'")
    left_s, center_s, right_s, out_s = m.groups()
    pattern = (
        tuple(int(c) for c in left_s)
        + (int(center_s),)
        + tuple(int(c) for c in right_s)
    )
    return pattern, len(left_s), len(right_s), int(out_s)


class Rule:
    """CA rule with variable left/right context."""

    def __init__(
        self,
        left_ctx: int = 1,
        right_ctx: int = 1,
        table: dict[tuple[int, ...], int] | None = None,
    ):
        self.left_ctx = left_ctx
        self.right_ctx = right_ctx
        self.width = left_ctx + 1 + right_ctx
        self.n_patterns = 2 ** self.width

        if table is not None:
            self._table = dict(table)
        else:
            self._table = {
                self._index_to_pattern(i): 0
                for i in range(self.n_patterns)
            }

    # ── constructors ──────────────────────────────────────────────

    @classmethod
    def elementary(cls, number: int) -> "Rule":
        """Classic Wolfram elementary CA rule (0-255)."""
        if not 0 <= number <= 255:
            raise ValueError(f"Rule number must be 0-255, got {number}")
        rule = cls(left_ctx=1, right_ctx=1)
        for i in range(8):
            pattern = rule._index_to_pattern(i)
            rule._table[pattern] = (number >> i) & 1
        return rule

    @classmethod
    def from_entries(
        cls,
        entries: list[tuple[tuple[int, ...], int, int, int]],
    ) -> "Rule":
        """Build composed rule from parsed text entries.

        Each entry is (pattern, left_ctx, right_ctx, output).
        Narrower patterns applied first; wider ones override.
        """
        if not entries:
            return cls(left_ctx=0, right_ctx=0)

        eff_left = max(e[1] for e in entries)
        eff_right = max(e[2] for e in entries)
        effective = cls(left_ctx=eff_left, right_ctx=eff_right)

        # Sort by width ascending (narrow = general, wide = specific override)
        sorted_entries = sorted(entries, key=lambda e: e[1] + 1 + e[2])

        for pattern, left_ctx, right_ctx, output in sorted_entries:
            extra_left = eff_left - left_ctx
            extra_right = eff_right - right_ctx
            for lc in range(2 ** extra_left):
                left_prefix = tuple(
                    (lc >> (extra_left - 1 - j)) & 1
                    for j in range(extra_left)
                )
                for rc in range(2 ** extra_right):
                    right_suffix = tuple(
                        (rc >> (extra_right - 1 - j)) & 1
                        for j in range(extra_right)
                    )
                    effective._table[
                        left_prefix + pattern + right_suffix
                    ] = output
        return effective

    # ── pattern helpers ───────────────────────────────────────────

    def _index_to_pattern(self, index: int) -> tuple[int, ...]:
        return tuple(
            (index >> (self.width - 1 - j)) & 1
            for j in range(self.width)
        )

    @property
    def table(self) -> dict[tuple[int, ...], int]:
        return dict(self._table)

    @property
    def patterns_descending(self) -> list[tuple[int, ...]]:
        return [
            self._index_to_pattern(i)
            for i in range(self.n_patterns - 1, -1, -1)
        ]

    @property
    def number(self) -> int:
        n = 0
        for i in range(self.n_patterns):
            pattern = self._index_to_pattern(i)
            if self._table.get(pattern, 0):
                n |= (1 << i)
        return n

    @property
    def name(self) -> str:
        n = self.number
        s = str(n)
        if len(s) > 12:
            s = s[:10] + ".."
        return f"rule{s}base{self.width}"

    # ── simulation ────────────────────────────────────────────────

    def apply(self, row: np.ndarray) -> np.ndarray:
        n = len(row)
        new_row = np.zeros(n, dtype=np.uint8)
        for i in range(n):
            pattern = tuple(
                int(row[(i - self.left_ctx + j) % n])
                for j in range(self.width)
            )
            new_row[i] = self._table.get(pattern, 0)
        return new_row

    # ── expansion (kept for utility) ──────────────────────────────

    def expand(self, new_left: int, new_right: int) -> "Rule":
        extra_left = new_left - self.left_ctx
        extra_right = new_right - self.right_ctx
        if extra_left < 0 or extra_right < 0:
            raise ValueError("Cannot shrink context")
        if extra_left == 0 and extra_right == 0:
            return Rule(
                left_ctx=new_left, right_ctx=new_right, table=self._table,
            )
        new_table: dict[tuple[int, ...], int] = {}
        for pattern, output in self._table.items():
            for lc in range(2 ** extra_left):
                lp = tuple(
                    (lc >> (extra_left - 1 - j)) & 1
                    for j in range(extra_left)
                )
                for rc in range(2 ** extra_right):
                    rs = tuple(
                        (rc >> (extra_right - 1 - j)) & 1
                        for j in range(extra_right)
                    )
                    new_table[lp + pattern + rs] = output
        return Rule(left_ctx=new_left, right_ctx=new_right, table=new_table)

    def __repr__(self) -> str:
        return f"Rule(L={self.left_ctx}, R={self.right_ctx}, {self.n_patterns}p)"
