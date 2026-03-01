"""Main application window — split screen layout."""

import tkinter as tk
from tkinter import ttk

import numpy as np

from ..config import Config
from ..automaton import Grid
from .canvas import AutomatonCanvas
from .rule_editor import RuleInput


class App:
    """Split-screen: text rule editor on the left, simulation on the right."""

    def __init__(self):
        self.root = tk.Tk()
        self.root.title(Config.WINDOW_TITLE)
        self.root.geometry("1100x700")

        self._initial_row: np.ndarray | None = None

        self._build_ui()
        self._new_random()

    # ── layout ────────────────────────────────────────────────────

    def _build_ui(self):
        paned = tk.PanedWindow(
            self.root, orient=tk.HORIZONTAL, sashwidth=5, bg="#bbb",
        )
        paned.pack(fill=tk.BOTH, expand=True, padx=4, pady=4)

        left = ttk.Frame(paned)
        paned.add(left, width=340, minsize=260)
        self._build_left(left)

        right = ttk.Frame(paned)
        paned.add(right, minsize=300)
        self._build_right(right)

    def _build_left(self, parent: ttk.Frame):
        self.rule_input = RuleInput(
            parent, on_changed=self._on_rules_changed,
        )
        self.rule_input.pack(fill=tk.BOTH, expand=True)

    def _build_right(self, parent: ttk.Frame):
        controls = ttk.Frame(parent)
        controls.pack(fill=tk.X, pady=(0, 4))

        ttk.Label(controls, text="Steps:").pack(side=tk.LEFT, padx=(0, 4))
        self.steps_var = tk.IntVar(value=Config.STEPS)
        ttk.Spinbox(
            controls, from_=1, to=1000,
            textvariable=self.steps_var, width=6,
        ).pack(side=tk.LEFT, padx=(0, 12))

        ttk.Label(controls, text="Width:").pack(side=tk.LEFT, padx=(0, 4))
        self.width_var = tk.IntVar(value=Config.GRID_WIDTH)
        ttk.Spinbox(
            controls, from_=11, to=501, increment=10,
            textvariable=self.width_var, width=6,
        ).pack(side=tk.LEFT, padx=(0, 12))

        ttk.Button(
            controls, text="New Random", command=self._new_random,
        ).pack(side=tk.LEFT)

        self.info_var = tk.StringVar()
        ttk.Label(
            controls, textvariable=self.info_var, font=("Consolas", 9),
        ).pack(side=tk.RIGHT, padx=(8, 0))

        canvas_frame = ttk.Frame(parent)
        canvas_frame.pack(fill=tk.BOTH, expand=True)
        self.canvas = AutomatonCanvas(
            canvas_frame, bg=Config.COLOR_DEAD, highlightthickness=0,
        )
        self.canvas.pack()

        # Live-update on steps/width change
        self.steps_var.trace_add("write", self._on_param_changed)
        self.width_var.trace_add("write", self._on_param_changed)

    # ── callbacks ─────────────────────────────────────────────────

    def _on_rules_changed(self):
        self._simulate()

    def _on_param_changed(self, *_):
        try:
            width = self.width_var.get()
            if (
                self._initial_row is not None
                and len(self._initial_row) != width
            ):
                self._new_random()
                return
            self._simulate()
        except (tk.TclError, ValueError):
            pass

    # ── simulation ────────────────────────────────────────────────

    def _new_random(self):
        try:
            width = self.width_var.get()
        except (tk.TclError, ValueError):
            width = Config.GRID_WIDTH
        self._initial_row = (
            np.random.random(width) < 0.5
        ).astype(np.uint8)
        self._simulate()

    def _simulate(self):
        if self._initial_row is None:
            return
        try:
            steps = self.steps_var.get()
            width = self.width_var.get()
        except (tk.TclError, ValueError):
            return

        if len(self._initial_row) != width:
            self._initial_row = (
                np.random.random(width) < 0.5
            ).astype(np.uint8)

        rule = self.rule_input.get_rule()
        grid = Grid(width, rule)
        grid.init_custom(self._initial_row)
        grid.step_n(steps)

        self.canvas.draw_grid(grid.as_array())
        self.info_var.set(
            f"{rule.name} | {steps} steps | {width} cells"
        )

    def run(self):
        self.root.mainloop()
