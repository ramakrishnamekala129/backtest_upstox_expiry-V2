from __future__ import annotations

import json
import os
import queue
import subprocess
import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

from astro_tab import build_astro_tab

SCRIPT_PATH = Path(__file__).with_name("trendatestocks_v1.1.py")
OUTPUT_DIR = Path(__file__).with_name("excel_output")
JSON_PATH = OUTPUT_DIR / "trend_tables.json"


class TrendDatesUI(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("TrendDates Runner")
        self.geometry("1180x760")
        self.minsize(1040, 680)

        self.process: subprocess.Popen[str] | None = None
        self.log_queue: queue.Queue[str] = queue.Queue()

        self.backtest_months = tk.StringVar(value="6")
        self.max_symbol_concurrency = tk.StringVar(value="4")
        self.max_request_concurrency = tk.StringVar(value="6")
        self.db_save_every = tk.StringVar(value="25")
        self.chunk_sleep_min = tk.StringVar(value="0.05")
        self.chunk_sleep_max = tk.StringVar(value="0.2")

        self._build_ui()
        self.after(100, self._drain_log_queue)

    def _build_ui(self) -> None:
        container = ttk.Frame(self, padding=12)
        container.pack(fill=tk.BOTH, expand=True)

        settings_frame = ttk.LabelFrame(container, text="Runtime Settings", padding=10)
        settings_frame.pack(fill=tk.X)

        fields = [
            ("BACKTEST_MONTHS", self.backtest_months),
            ("MAX_SYMBOL_CONCURRENCY", self.max_symbol_concurrency),
            ("MAX_REQUEST_CONCURRENCY", self.max_request_concurrency),
            ("DB_SAVE_EVERY", self.db_save_every),
            ("CHUNK_SLEEP_MIN", self.chunk_sleep_min),
            ("CHUNK_SLEEP_MAX", self.chunk_sleep_max),
        ]

        for idx, (label_text, var) in enumerate(fields):
            ttk.Label(settings_frame, text=label_text).grid(
                row=idx // 3, column=(idx % 3) * 2, padx=(0, 8), pady=6, sticky="w"
            )
            ttk.Entry(settings_frame, textvariable=var, width=14).grid(
                row=idx // 3, column=(idx % 3) * 2 + 1, padx=(0, 24), pady=6, sticky="w"
            )

        actions = ttk.Frame(container, padding=(0, 10))
        actions.pack(fill=tk.X)

        self.run_button = ttk.Button(actions, text="Run Pipeline", command=self.run_pipeline)
        self.run_button.pack(side=tk.LEFT)

        self.stop_button = ttk.Button(actions, text="Stop", command=self.stop_pipeline, state=tk.DISABLED)
        self.stop_button.pack(side=tk.LEFT, padx=8)

        ttk.Button(actions, text="Load JSON", command=self.load_json_from_dialog).pack(side=tk.LEFT, padx=8)
        ttk.Button(actions, text="Open Output Folder", command=self.open_output_folder).pack(side=tk.LEFT, padx=8)

        self.status_var = tk.StringVar(value="Idle")
        ttk.Label(actions, textvariable=self.status_var).pack(side=tk.RIGHT)

        body = ttk.PanedWindow(container, orient=tk.VERTICAL)
        body.pack(fill=tk.BOTH, expand=True)

        top = ttk.Frame(body)
        bottom = ttk.Frame(body)
        body.add(top, weight=2)
        body.add(bottom, weight=3)

        self.log_text = tk.Text(top, wrap=tk.WORD, height=14)
        log_scroll = ttk.Scrollbar(top, orient=tk.VERTICAL, command=self.log_text.yview)
        self.log_text.configure(yscrollcommand=log_scroll.set)
        self.log_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        log_scroll.pack(side=tk.RIGHT, fill=tk.Y)
        self.log_text.configure(state=tk.DISABLED)

        self.notebook = ttk.Notebook(bottom)
        self.notebook.pack(fill=tk.BOTH, expand=True)

        self.trend_tree = self._build_tree_tab(
            "Trend Dates", ["Symbol", "Trend", "Strength", "Week"]
        )
        self.single_tree = self._build_tree_tab(
            "Single View", ["Trend", "Week", "Symbol", "Strength"]
        )
        self.summary_tree = self._build_tree_tab(
            "Summary", ["Trend", "Week", "Count", "MaxStrength", "Symbols"]
        )
        self.table_tree = self._build_tree_tab(
            "Date Table Counts", ["Trend Date", "Symbol Count"]
        )
        self.astro_tab = build_astro_tab(self.notebook)

    def _build_tree_tab(self, title: str, columns: list[str]) -> ttk.Treeview:
        frame = ttk.Frame(self.notebook)
        self.notebook.add(frame, text=title)

        tree = ttk.Treeview(frame, columns=columns, show="headings")
        for col in columns:
            tree.heading(col, text=col)
            width = 150 if col != "Symbols" else 420
            tree.column(col, width=width, anchor="w", stretch=True)

        yscroll = ttk.Scrollbar(frame, orient=tk.VERTICAL, command=tree.yview)
        xscroll = ttk.Scrollbar(frame, orient=tk.HORIZONTAL, command=tree.xview)
        tree.configure(yscrollcommand=yscroll.set, xscrollcommand=xscroll.set)

        tree.grid(row=0, column=0, sticky="nsew")
        yscroll.grid(row=0, column=1, sticky="ns")
        xscroll.grid(row=1, column=0, sticky="ew")
        frame.grid_rowconfigure(0, weight=1)
        frame.grid_columnconfigure(0, weight=1)
        return tree

    def run_pipeline(self) -> None:
        if not SCRIPT_PATH.exists():
            messagebox.showerror("Missing Script", f"Could not find:\n{SCRIPT_PATH}")
            return
        if self.process is not None and self.process.poll() is None:
            messagebox.showinfo("Already Running", "Pipeline is already running.")
            return

        env = os.environ.copy()
        env.update(
            {
                "BACKTEST_MONTHS": self.backtest_months.get().strip(),
                "MAX_SYMBOL_CONCURRENCY": self.max_symbol_concurrency.get().strip(),
                "MAX_REQUEST_CONCURRENCY": self.max_request_concurrency.get().strip(),
                "DB_SAVE_EVERY": self.db_save_every.get().strip(),
                "CHUNK_SLEEP_MIN": self.chunk_sleep_min.get().strip(),
                "CHUNK_SLEEP_MAX": self.chunk_sleep_max.get().strip(),
            }
        )

        self._append_log(f"Running: {sys.executable} {SCRIPT_PATH.name}")
        self.status_var.set("Running")
        self.run_button.configure(state=tk.DISABLED)
        self.stop_button.configure(state=tk.NORMAL)
        self._clear_tables()

        thread = threading.Thread(target=self._run_subprocess, args=(env,), daemon=True)
        thread.start()

    def _run_subprocess(self, env: dict[str, str]) -> None:
        try:
            self.process = subprocess.Popen(
                [sys.executable, str(SCRIPT_PATH)],
                cwd=str(SCRIPT_PATH.parent),
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )

            assert self.process.stdout is not None
            for line in self.process.stdout:
                self.log_queue.put(line.rstrip("\n"))

            code = self.process.wait()
            self.log_queue.put(f"\nProcess finished with exit code {code}")
            self.after(0, self._on_process_complete, code)
        except Exception as exc:
            self.log_queue.put(f"Failed to run pipeline: {exc}")
            self.after(0, self._on_process_complete, 1)

    def stop_pipeline(self) -> None:
        if self.process is not None and self.process.poll() is None:
            self.process.terminate()
            self._append_log("Stop requested...")

    def _on_process_complete(self, code: int) -> None:
        self.run_button.configure(state=tk.NORMAL)
        self.stop_button.configure(state=tk.DISABLED)
        self.status_var.set("Completed" if code == 0 else "Failed")
        self.process = None
        if code == 0 and JSON_PATH.exists():
            self.load_json(JSON_PATH)

    def _drain_log_queue(self) -> None:
        try:
            while True:
                line = self.log_queue.get_nowait()
                self._append_log(line)
        except queue.Empty:
            pass
        self.after(100, self._drain_log_queue)

    def _append_log(self, message: str) -> None:
        self.log_text.configure(state=tk.NORMAL)
        self.log_text.insert(tk.END, message + "\n")
        self.log_text.see(tk.END)
        self.log_text.configure(state=tk.DISABLED)

    def load_json_from_dialog(self) -> None:
        selected = filedialog.askopenfilename(
            title="Select trend_tables.json",
            filetypes=[("JSON files", "*.json"), ("All files", "*.*")],
            initialdir=str(OUTPUT_DIR if OUTPUT_DIR.exists() else SCRIPT_PATH.parent),
        )
        if selected:
            self.load_json(Path(selected))

    def load_json(self, path: Path) -> None:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            messagebox.showerror("Invalid JSON", f"Could not load {path.name}\n\n{exc}")
            return

        self._fill_tree(self.trend_tree, payload.get("trend_dates", []))
        self._fill_tree(self.single_tree, payload.get("dates_wise_single", []))
        self._fill_tree(self.summary_tree, payload.get("dates_wise_summary", []))

        table_counts = [
            {"Trend Date": date_key, "Symbol Count": len(rows)}
            for date_key, rows in payload.get("dates_wise_table", {}).items()
        ]
        table_counts.sort(key=lambda row: row["Trend Date"])
        self._fill_tree(self.table_tree, table_counts)
        self._append_log(f"Loaded JSON preview: {path}")

    def _fill_tree(self, tree: ttk.Treeview, rows: list[dict]) -> None:
        for item in tree.get_children():
            tree.delete(item)
        columns = list(tree["columns"])
        for row in rows:
            values = [row.get(col, "") for col in columns]
            tree.insert("", tk.END, values=values)

    def _clear_tables(self) -> None:
        for tree in [self.trend_tree, self.single_tree, self.summary_tree, self.table_tree]:
            for item in tree.get_children():
                tree.delete(item)

    def open_output_folder(self) -> None:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        try:
            os.startfile(str(OUTPUT_DIR))
        except Exception as exc:
            messagebox.showerror("Open Folder Failed", str(exc))


def main() -> None:
    app = TrendDatesUI()
    app.mainloop()


if __name__ == "__main__":
    main()
