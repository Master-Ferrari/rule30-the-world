"""Grid state management for cellular automaton."""

import numpy as np
from .rules import Rule


class Grid:
    """Manages the 2D history of a 1D cellular automaton.

    Stores all generations as rows in a 2D numpy array.
    """

    def __init__(self, width: int, rule: Rule):
        self.width = width
        self.rule = rule
        self.rows: list[np.ndarray] = []
        self.generation = 0

    @property
    def current_row(self) -> np.ndarray:
        return self.rows[-1]

    def init_single_cell(self):
        """Initialize with a single active cell in the center."""
        row = np.zeros(self.width, dtype=np.uint8)
        row[self.width // 2] = 1
        self.rows = [row]
        self.generation = 0

    def init_random(self, density: float = 0.5):
        """Initialize with random state."""
        row = (np.random.random(self.width) < density).astype(np.uint8)
        self.rows = [row]
        self.generation = 0

    def init_custom(self, row: np.ndarray):
        """Initialize with a specific row."""
        self.rows = [row.astype(np.uint8)]
        self.generation = 0

    def step(self) -> np.ndarray:
        """Advance one generation. Returns the new row."""
        new_row = self.rule.apply(self.current_row)
        self.rows.append(new_row)
        self.generation += 1
        return new_row

    def step_n(self, n: int):
        """Advance n generations."""
        for _ in range(n):
            self.step()

    def reset(self):
        """Reset to generation 0, keeping only the initial row."""
        if self.rows:
            self.rows = [self.rows[0]]
            self.generation = 0

    def as_array(self) -> np.ndarray:
        """Return full history as 2D array (generations x width)."""
        return np.array(self.rows, dtype=np.uint8)
