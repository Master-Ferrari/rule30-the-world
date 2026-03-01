"""RulePanel — compact editor for a single rule (sliders + grid truth table)."""

import tkinter as tk
from tkinter import ttk

from ..automaton import Rule
from ..config import Config

_COLS = 4  # truth table columns


class RulePanel(ttk.LabelFrame):
    """Self-contained editor for one Rule.

    Shows left/right context sliders and a compact grid of toggle buttons
    for each neighborhood → output mapping.
    """

    def __init__(
        self,
        parent: tk.Widget,
        rule: Rule,
        on_changed=None,
        on_remove=None,
        **kwargs,
    ):
        super().__init__(parent, **kwargs)
        self._on_changed = on_changed
        self._on_remove = on_remove
        self._suppress = False
        self._prev_left = -1
        self._prev_right = -1

        self.left_var = tk.IntVar(value=rule.left_ctx)
        self.right_var = tk.IntVar(value=rule.right_ctx)
        self._name_var = tk.StringVar(value=rule.name)

        self._output_vars: dict[tuple[int, ...], tk.IntVar] = {}
        self._buttons: dict[tuple[int, ...], tk.Button] = {}

        self._build_header()
        self._build_sliders()

        self._table_frame = ttk.Frame(self)
        self._table_frame.pack(fill=tk.X, padx=4, pady=(0, 4))

        self.load_rule(rule)

    # ── build ─────────────────────────────────────────────────────

    def _build_header(self):
        hdr = ttk.Frame(self)
        hdr.pack(fill=tk.X, padx=4, pady=(2, 0))

        ttk.Label(
            hdr, textvariable=self._name_var,
            font=("Consolas", 9, "bold"),
        ).pack(side=tk.LEFT)

        if self._on_remove:
            ttk.Button(
                hdr, text="\u2715", width=3, command=self._on_remove,
            ).pack(side=tk.RIGHT)

    def _build_sliders(self):
        fr = ttk.Frame(self)
        fr.pack(fill=tk.X, padx=4, pady=2)

        ttk.Label(fr, text="L:").pack(side=tk.LEFT)
        tk.Scale(
            fr, from_=0, to=Config.MAX_CONTEXT, resolution=1,
            orient=tk.HORIZONTAL, variable=self.left_var,
            command=self._on_slider, length=110, showvalue=True,
        ).pack(side=tk.LEFT, padx=(0, 12))

        ttk.Label(fr, text="R:").pack(side=tk.LEFT)
        tk.Scale(
            fr, from_=0, to=Config.MAX_CONTEXT, resolution=1,
            orient=tk.HORIZONTAL, variable=self.right_var,
            command=self._on_slider, length=110, showvalue=True,
        ).pack(side=tk.LEFT)

    # ── public API ────────────────────────────────────────────────

    def load_rule(self, rule: Rule):
        self._suppress = True
        self.left_var.set(rule.left_ctx)
        self.right_var.set(rule.right_ctx)
        self._prev_left = rule.left_ctx
        self._prev_right = rule.right_ctx
        self._suppress = False
        self._rebuild_table(rule)

    def get_rule(self) -> Rule:
        table = {p: v.get() for p, v in self._output_vars.items()}
        return Rule(
            left_ctx=self.left_var.get(),
            right_ctx=self.right_var.get(),
            table=table,
        )

    # ── slider callback ──────────────────────────────────────────

    def _on_slider(self, *_):
        if self._suppress:
            return
        left = int(self.left_var.get())
        right = int(self.right_var.get())
        if left == self._prev_left and right == self._prev_right:
            return
        self._prev_left = left
        self._prev_right = right
        self._rebuild_table(Rule(left_ctx=left, right_ctx=right))
        self._notify()

    # ── truth table grid ─────────────────────────────────────────

    def _rebuild_table(self, rule: Rule):
        for w in self._table_frame.winfo_children():
            w.destroy()
        self._output_vars.clear()
        self._buttons.clear()
        self._name_var.set(rule.name)

        table = rule.table
        for i, pattern in enumerate(rule.patterns_descending):
            r, c = divmod(i, _COLS)
            val = table.get(pattern, 0)
            var = tk.IntVar(value=val)
            self._output_vars[pattern] = var

            txt = "".join(str(v) for v in pattern)
            btn = tk.Button(
                self._table_frame,
                text=f"{txt}\u2192{val}",
                font=("Consolas", 9),
                width=max(len(txt) + 3, 7),
                relief=tk.GROOVE,
                command=lambda p=pattern: self._toggle(p),
            )
            btn.grid(row=r, column=c, padx=2, pady=2, sticky=tk.W)
            self._buttons[pattern] = btn

        self._update_all_visuals()

    def _toggle(self, pattern: tuple[int, ...]):
        var = self._output_vars[pattern]
        var.set(1 - var.get())
        self._update_visual(pattern)
        self._name_var.set(self.get_rule().name)
        self._notify()

    def _update_all_visuals(self):
        for p in self._output_vars:
            self._update_visual(p)

    def _update_visual(self, pattern: tuple[int, ...]):
        val = self._output_vars[pattern].get()
        txt = "".join(str(v) for v in pattern)
        btn = self._buttons[pattern]
        btn.config(
            text=f"{txt}\u2192{val}",
            bg=Config.COLOR_ALIVE if val else Config.COLOR_DEAD,
            fg=Config.COLOR_DEAD if val else Config.COLOR_ALIVE,
        )

    def _notify(self):
        if self._on_changed:
            self._on_changed()
