"""Main application window — split screen layout."""

import tkinter as tk
from tkinter import ttk

import numpy as np

from ..config import Config
from ..automaton import Rule, Grid
from .canvas import AutomatonCanvas
from .rule_editor import RulePanel


class App:
    """Split-screen GUI: rules on the left, simulation on the right."""

    def __init__(self):
        self.root = tk.Tk()
        self.root.title(Config.WINDOW_TITLE)
        self.root.geometry("1200x700")

        # Data
        self.rules: list[Rule] = [Rule.elementary(Config.RULE_NUMBER)]
        self._panels: list[RulePanel] = []
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
        paned.add(left, width=460, minsize=320)
        self._build_left(left)

        right = ttk.Frame(paned)
        paned.add(right, minsize=300)
        self._build_right(right)

    # ── left panel (rules) ────────────────────────────────────────

    def _build_left(self, parent: ttk.Frame):
        # Top bar
        top = ttk.Frame(parent)
        top.pack(fill=tk.X, pady=(0, 4))

        ttk.Button(top, text="+ Add Rule", command=self._add_rule).pack(
            side=tk.LEFT,
        )
        self._eff_var = tk.StringVar()
        ttk.Label(
            top, textvariable=self._eff_var,
            font=("Consolas", 8),
        ).pack(side=tk.RIGHT, padx=(8, 0))

        # Scrollable canvas for rule panels
        self._scroll_canvas = tk.Canvas(parent, highlightthickness=0)
        sb = ttk.Scrollbar(
            parent, orient=tk.VERTICAL, command=self._scroll_canvas.yview,
        )
        self._rules_inner = ttk.Frame(self._scroll_canvas)
        self._rules_inner.bind(
            "<Configure>",
            lambda _: self._scroll_canvas.configure(
                scrollregion=self._scroll_canvas.bbox("all"),
            ),
        )
        self._win_id = self._scroll_canvas.create_window(
            (0, 0), window=self._rules_inner, anchor="nw",
        )
        self._scroll_canvas.configure(yscrollcommand=sb.set)

        # Keep inner frame width = canvas width
        self._scroll_canvas.bind(
            "<Configure>",
            lambda e: self._scroll_canvas.itemconfig(
                self._win_id, width=e.width,
            ),
        )

        sb.pack(side=tk.RIGHT, fill=tk.Y)
        self._scroll_canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        # Mousewheel only while hovering
        def _wheel(event):
            self._scroll_canvas.yview_scroll(
                -1 * (event.delta // 120), "units",
            )

        self._scroll_canvas.bind(
            "<Enter>",
            lambda _: self._scroll_canvas.bind_all("<MouseWheel>", _wheel),
        )
        self._scroll_canvas.bind(
            "<Leave>",
            lambda _: self._scroll_canvas.unbind_all("<MouseWheel>"),
        )

        self._rebuild_panels()

    # ── right panel (simulation) ──────────────────────────────────

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
        ttk.Label(controls, textvariable=self.info_var).pack(
            side=tk.RIGHT, padx=(8, 0),
        )

        canvas_frame = ttk.Frame(parent)
        canvas_frame.pack(fill=tk.BOTH, expand=True)
        self.canvas = AutomatonCanvas(
            canvas_frame, bg=Config.COLOR_DEAD, highlightthickness=0,
        )
        self.canvas.pack()

        # Live-update on steps/width change
        self.steps_var.trace_add("write", self._on_param_changed)
        self.width_var.trace_add("write", self._on_param_changed)

    # ── rule list management ──────────────────────────────────────

    def _rebuild_panels(self):
        for w in self._rules_inner.winfo_children():
            w.destroy()
        self._panels.clear()

        for i, rule in enumerate(self.rules):
            panel = RulePanel(
                self._rules_inner,
                rule=rule,
                on_changed=self._on_any_rule_changed,
                on_remove=lambda idx=i: self._remove_rule(idx),
                text=f" Rule {i + 1} ",
                padding=4,
            )
            panel.pack(fill=tk.X, pady=(0, 6))
            self._panels.append(panel)

        self._update_effective_label()

    def _add_rule(self):
        self._save_panels()
        self.rules.append(Rule.elementary(Config.RULE_NUMBER))
        self._rebuild_panels()
        self._simulate()

    def _remove_rule(self, idx: int):
        if len(self.rules) <= 1:
            return
        self._save_panels()
        self.rules.pop(idx)
        self._rebuild_panels()
        self._simulate()

    def _save_panels(self):
        for i, panel in enumerate(self._panels):
            self.rules[i] = panel.get_rule()

    # ── callbacks ─────────────────────────────────────────────────

    def _on_any_rule_changed(self):
        """Any rule panel toggled or slider moved → resimulate."""
        self._save_panels()
        self._update_effective_label()
        self._simulate()

    def _on_param_changed(self, *_):
        """Steps or width spinbox changed."""
        try:
            width = self.width_var.get()
            if self._initial_row is not None and len(self._initial_row) != width:
                self._new_random()
                return
            self._simulate()
        except (tk.TclError, ValueError):
            pass

    def _update_effective_label(self):
        composed = Rule.compose(self.rules)
        self._eff_var.set(f"effective: {composed.name}")

    # ── simulation ────────────────────────────────────────────────

    def _new_random(self):
        try:
            width = self.width_var.get()
        except (tk.TclError, ValueError):
            width = Config.GRID_WIDTH
        self._initial_row = (np.random.random(width) < 0.5).astype(np.uint8)
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

        composed = Rule.compose(self.rules)
        grid = Grid(width, composed)
        grid.init_custom(self._initial_row)
        grid.step_n(steps)

        self.canvas.draw_grid(grid.as_array())
        self.info_var.set(
            f"{composed.name} | {steps} steps | {width} cells"
        )

    def run(self):
        self.root.mainloop()
