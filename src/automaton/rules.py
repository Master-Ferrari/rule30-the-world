"""Cellular automaton rules with configurable neighborhood width."""

import numpy as np


class Rule:
    """CA rule with variable left/right context.

    For left_ctx=1, right_ctx=1 — classic elementary CA (8 patterns).
    Wider contexts grow the truth table as 2^(left+1+right).
    """

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

    # ── pattern helpers ───────────────────────────────────────────

    def _index_to_pattern(self, index: int) -> tuple[int, ...]:
        """Convert integer index to pattern tuple (MSB-first)."""
        return tuple(
            (index >> (self.width - 1 - j)) & 1
            for j in range(self.width)
        )

    @property
    def table(self) -> dict[tuple[int, ...], int]:
        return dict(self._table)

    @property
    def patterns_descending(self) -> list[tuple[int, ...]]:
        """All patterns from highest to lowest index (Wolfram order)."""
        return [
            self._index_to_pattern(i)
            for i in range(self.n_patterns - 1, -1, -1)
        ]

    @property
    def number(self) -> int:
        """Decimal rule number (output bits read as binary, LSB = pattern 0)."""
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
        """Compute next row from current row. Wrapping boundary."""
        n = len(row)
        new_row = np.zeros(n, dtype=np.uint8)
        for i in range(n):
            pattern = tuple(
                int(row[(i - self.left_ctx + j) % n])
                for j in range(self.width)
            )
            new_row[i] = self._table.get(pattern, 0)
        return new_row

    # ── composition ───────────────────────────────────────────────

    def expand(self, new_left: int, new_right: int) -> "Rule":
        """Expand to wider context. Extra cell positions are wildcards."""
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
                left_prefix = tuple(
                    (lc >> (extra_left - 1 - j)) & 1
                    for j in range(extra_left)
                )
                for rc in range(2 ** extra_right):
                    right_suffix = tuple(
                        (rc >> (extra_right - 1 - j)) & 1
                        for j in range(extra_right)
                    )
                    new_table[left_prefix + pattern + right_suffix] = output
        return Rule(left_ctx=new_left, right_ctx=new_right, table=new_table)

    @classmethod
    def compose(cls, rules: list["Rule"]) -> "Rule":
        """Compose rules via OR: if any rule outputs 1 for a pattern, result is 1."""
        if not rules:
            return cls(left_ctx=0, right_ctx=0)

        eff_left = max(r.left_ctx for r in rules)
        eff_right = max(r.right_ctx for r in rules)

        effective = cls(left_ctx=eff_left, right_ctx=eff_right)
        for r in rules:
            expanded = r.expand(eff_left, eff_right)
            for pattern, output in expanded._table.items():
                if output == 1:
                    effective._table[pattern] = 1
        return effective

    def __repr__(self) -> str:
        return f"Rule(L={self.left_ctx}, R={self.right_ctx}, {self.n_patterns}p)"
