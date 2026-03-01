"""RuleInput — text-based rule editor with live parsing."""

import tkinter as tk
from tkinter import ttk

from ..automaton import Rule, parse_rule_line

_DEFAULT_TEXT = """\
# Rule 30
1(0)0>1
0(1)1>1
0(1)0>1
0(0)1>1
"""


class RuleInput(ttk.Frame):
    """Text area for entering rules in ``left(center)right>output`` format.

    Parses on every edit and calls *on_changed* with the composed Rule.
    """

    def __init__(self, parent: tk.Widget, on_changed=None, **kwargs):
        super().__init__(parent, **kwargs)
        self._on_changed = on_changed
        self._build()
        self.text.insert("1.0", _DEFAULT_TEXT)
        self.text.edit_modified(False)

    def _build(self):
        # Help
        ttk.Label(
            self,
            text="Format:  left(center)right>output    e.g. 0(1)0>1",
            font=("Consolas", 9),
        ).pack(anchor=tk.W, pady=(0, 4))

        # Text area + scrollbar
        text_frame = ttk.Frame(self)
        text_frame.pack(fill=tk.BOTH, expand=True)

        self.text = tk.Text(
            text_frame,
            font=("Consolas", 12),
            wrap=tk.NONE,
            undo=True,
            width=22,
            height=14,
            bg="#1e1e1e",
            fg="#d4d4d4",
            insertbackground="#d4d4d4",
            selectbackground="#264f78",
            padx=8,
            pady=6,
        )
        sb = ttk.Scrollbar(
            text_frame, orient=tk.VERTICAL, command=self.text.yview,
        )
        self.text.configure(yscrollcommand=sb.set)
        sb.pack(side=tk.RIGHT, fill=tk.Y)
        self.text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        # Tag for comment lines
        self.text.tag_configure("comment", foreground="#6a9955")
        # Tag for error lines
        self.text.tag_configure("error", background="#4e1e1e")

        self.text.bind("<<Modified>>", self._on_modified)

        # Info bar
        self._info_var = tk.StringVar(value="")
        ttk.Label(
            self, textvariable=self._info_var, font=("Consolas", 9),
        ).pack(anchor=tk.W, pady=(4, 0))

    # ── events ────────────────────────────────────────────────────

    def _on_modified(self, _event=None):
        if self.text.edit_modified():
            self.text.edit_modified(False)
            self._highlight()
            if self._on_changed:
                self._on_changed()

    # ── syntax highlighting ───────────────────────────────────────

    def _highlight(self):
        content = self.text.get("1.0", tk.END)
        self.text.tag_remove("comment", "1.0", tk.END)
        self.text.tag_remove("error", "1.0", tk.END)

        for i, line in enumerate(content.splitlines(), 1):
            stripped = line.strip()
            if not stripped:
                continue
            start = f"{i}.0"
            end = f"{i}.end"
            if stripped.startswith("#"):
                self.text.tag_add("comment", start, end)
            else:
                try:
                    parse_rule_line(line)
                except ValueError:
                    self.text.tag_add("error", start, end)

    # ── public API ────────────────────────────────────────────────

    def get_rule(self) -> Rule:
        """Parse current text and return composed Rule."""
        content = self.text.get("1.0", tk.END)
        entries = []
        errors = 0

        for i, line in enumerate(content.splitlines(), 1):
            try:
                result = parse_rule_line(line)
                if result is not None:
                    entries.append(result)
            except ValueError:
                errors += 1

        if entries:
            rule = Rule.from_entries(entries)
        else:
            rule = Rule(left_ctx=0, right_ctx=0)

        # Update info
        parts = [f"{len(entries)} entries", rule.name]
        if errors:
            parts.append(f"\u26a0 {errors} err")
        self._info_var.set("  |  ".join(parts))

        return rule
