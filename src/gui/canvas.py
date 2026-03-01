"""Canvas widget for rendering cellular automaton grid."""

import tkinter as tk
import numpy as np
from ..config import Config


class AutomatonCanvas(tk.Canvas):
    """Renders a 2D array of cell states as a pixel grid."""

    def __init__(self, parent: tk.Widget, **kwargs):
        self.cell_size = kwargs.pop("cell_size", Config.CELL_SIZE)
        super().__init__(parent, **kwargs)

    def draw_grid(self, data: np.ndarray):
        """Draw the full grid from a 2D numpy array (rows x cols)."""
        self.delete("all")

        rows, cols = data.shape
        canvas_w = cols * self.cell_size
        canvas_h = rows * self.cell_size
        self.config(width=canvas_w, height=canvas_h)

        # Draw using rectangles (grouped for performance)
        for r in range(rows):
            for c in range(cols):
                if data[r, c]:
                    x0 = c * self.cell_size
                    y0 = r * self.cell_size
                    x1 = x0 + self.cell_size
                    y1 = y0 + self.cell_size
                    self.create_rectangle(
                        x0, y0, x1, y1,
                        fill=Config.COLOR_ALIVE,
                        outline="",
                    )
