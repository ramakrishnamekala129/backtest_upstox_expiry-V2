from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
import tkinter as tk
from tkinter import messagebox, ttk


@dataclass(frozen=True)
class AstroSnapshot:
    selected_date: date
    selected_time: str
    symbol: str
    reference_price: float
    sun_sign: str
    moon_phase: str
    weekday: str


def build_astro_tab(notebook: ttk.Notebook) -> "AstroTab":
    return AstroTab(notebook)


class AstroTab:
    def __init__(self, notebook: ttk.Notebook) -> None:
        self.frame = ttk.Frame(notebook, padding=12)
        notebook.add(self.frame, text="Astro Tab")

        self.date_var = tk.StringVar(value=date.today().isoformat())
        self.time_var = tk.StringVar(value="09:15")
        self.symbol_var = tk.StringVar(value="NIFTY")
        self.price_var = tk.StringVar(value="25000")
        self.status_var = tk.StringVar(value="Ready")

        self.sun_sign_var = tk.StringVar(value="-")
        self.moon_phase_var = tk.StringVar(value="-")
        self.weekday_var = tk.StringVar(value="-")
        self.window_var = tk.StringVar(value="-")

        self.notes_text: tk.Text
        self.history_tree: ttk.Treeview
        self.levels_tree: ttk.Treeview

        self._build_layout()
        self.refresh_snapshot()

    def _build_layout(self) -> None:
        self.frame.grid_rowconfigure(2, weight=1)
        self.frame.grid_columnconfigure(0, weight=3)
        self.frame.grid_columnconfigure(1, weight=2)

        controls = ttk.LabelFrame(self.frame, text="Astro Inputs", padding=10)
        controls.grid(row=0, column=0, columnspan=2, sticky="ew")
        for idx in range(8):
            controls.grid_columnconfigure(idx, weight=1 if idx % 2 else 0)

        fields = [
            ("Date (YYYY-MM-DD)", self.date_var),
            ("Time (HH:MM)", self.time_var),
            ("Symbol", self.symbol_var),
            ("Reference Price", self.price_var),
        ]

        for idx, (label, var) in enumerate(fields):
            ttk.Label(controls, text=label).grid(
                row=0, column=idx * 2, padx=(0, 8), pady=4, sticky="w"
            )
            ttk.Entry(controls, textvariable=var, width=18).grid(
                row=0, column=idx * 2 + 1, padx=(0, 16), pady=4, sticky="ew"
            )

        buttons = ttk.Frame(controls)
        buttons.grid(row=1, column=0, columnspan=8, sticky="ew", pady=(10, 0))
        ttk.Button(buttons, text="Use Today", command=self.use_today).pack(side=tk.LEFT)
        ttk.Button(buttons, text="Refresh", command=self.refresh_snapshot).pack(side=tk.LEFT, padx=8)
        ttk.Button(buttons, text="Save Snapshot", command=self.save_snapshot).pack(side=tk.LEFT)
        ttk.Button(buttons, text="Clear Notes", command=self.clear_notes).pack(side=tk.LEFT, padx=8)
        ttk.Label(buttons, textvariable=self.status_var).pack(side=tk.RIGHT)

        overview = ttk.LabelFrame(self.frame, text="Astro Overview", padding=10)
        overview.grid(row=1, column=0, columnspan=2, sticky="ew", pady=(12, 0))
        for col in range(4):
            overview.grid_columnconfigure(col, weight=1)

        self._build_stat_card(overview, 0, "Sun Sign", self.sun_sign_var)
        self._build_stat_card(overview, 1, "Moon Phase", self.moon_phase_var)
        self._build_stat_card(overview, 2, "Weekday", self.weekday_var)
        self._build_stat_card(overview, 3, "Window", self.window_var)

        left = ttk.Frame(self.frame)
        left.grid(row=2, column=0, sticky="nsew", pady=(12, 0), padx=(0, 8))
        left.grid_rowconfigure(1, weight=1)
        left.grid_columnconfigure(0, weight=1)

        levels = ttk.LabelFrame(left, text="Reference Price Levels", padding=10)
        levels.grid(row=0, column=0, sticky="nsew")
        levels.grid_rowconfigure(0, weight=1)
        levels.grid_columnconfigure(0, weight=1)

        self.levels_tree = ttk.Treeview(
            levels, columns=("Band", "Level"), show="headings", height=6
        )
        for column, width in (("Band", 170), ("Level", 120)):
            self.levels_tree.heading(column, text=column)
            self.levels_tree.column(column, width=width, anchor="w", stretch=True)
        levels_y = ttk.Scrollbar(levels, orient=tk.VERTICAL, command=self.levels_tree.yview)
        self.levels_tree.configure(yscrollcommand=levels_y.set)
        self.levels_tree.grid(row=0, column=0, sticky="nsew")
        levels_y.grid(row=0, column=1, sticky="ns")

        notes = ttk.LabelFrame(left, text="Astro Notes", padding=10)
        notes.grid(row=1, column=0, sticky="nsew", pady=(12, 0))
        notes.grid_rowconfigure(0, weight=1)
        notes.grid_columnconfigure(0, weight=1)
        self.notes_text = tk.Text(notes, wrap=tk.WORD, height=10)
        notes_y = ttk.Scrollbar(notes, orient=tk.VERTICAL, command=self.notes_text.yview)
        self.notes_text.configure(yscrollcommand=notes_y.set)
        self.notes_text.grid(row=0, column=0, sticky="nsew")
        notes_y.grid(row=0, column=1, sticky="ns")
        self.notes_text.insert(
            "1.0",
            "Use this workspace to capture date, time, price context, and observations for astro-driven review.",
        )

        right = ttk.LabelFrame(self.frame, text="Saved Snapshots", padding=10)
        right.grid(row=2, column=1, sticky="nsew", pady=(12, 0))
        right.grid_rowconfigure(0, weight=1)
        right.grid_columnconfigure(0, weight=1)

        self.history_tree = ttk.Treeview(
            right,
            columns=("Date", "Time", "Symbol", "Sun Sign", "Moon Phase", "Price"),
            show="headings",
        )
        history_columns = {
            "Date": 100,
            "Time": 70,
            "Symbol": 80,
            "Sun Sign": 90,
            "Moon Phase": 120,
            "Price": 90,
        }
        for column, width in history_columns.items():
            self.history_tree.heading(column, text=column)
            self.history_tree.column(column, width=width, anchor="w", stretch=True)
        history_y = ttk.Scrollbar(right, orient=tk.VERTICAL, command=self.history_tree.yview)
        self.history_tree.configure(yscrollcommand=history_y.set)
        self.history_tree.grid(row=0, column=0, sticky="nsew")
        history_y.grid(row=0, column=1, sticky="ns")

    def _build_stat_card(
        self, parent: ttk.LabelFrame, column: int, title: str, value_var: tk.StringVar
    ) -> None:
        card = ttk.Frame(parent, padding=(8, 4))
        card.grid(row=0, column=column, sticky="ew")
        ttk.Label(card, text=title).pack(anchor="w")
        ttk.Label(card, textvariable=value_var, font=("Segoe UI Semibold", 11)).pack(
            anchor="w", pady=(6, 0)
        )

    def use_today(self) -> None:
        now = datetime.now()
        self.date_var.set(now.date().isoformat())
        self.time_var.set(now.strftime("%H:%M"))
        self.refresh_snapshot()

    def clear_notes(self) -> None:
        self.notes_text.delete("1.0", tk.END)
        self.status_var.set("Notes cleared")

    def refresh_snapshot(self) -> None:
        try:
            snapshot = self._build_snapshot()
        except ValueError as exc:
            messagebox.showerror("Invalid Astro Inputs", str(exc))
            self.status_var.set("Invalid input")
            return

        self.sun_sign_var.set(snapshot.sun_sign)
        self.moon_phase_var.set(snapshot.moon_phase)
        self.weekday_var.set(snapshot.weekday)
        self.window_var.set(
            f"{(snapshot.selected_date - timedelta(days=45)).isoformat()} to "
            f"{(snapshot.selected_date - timedelta(days=1)).isoformat()}"
        )

        for item in self.levels_tree.get_children():
            self.levels_tree.delete(item)

        for label, level in self._build_price_levels(snapshot.reference_price):
            self.levels_tree.insert("", tk.END, values=(label, f"{level:,.2f}"))

        self.status_var.set("Snapshot refreshed")

    def save_snapshot(self) -> None:
        try:
            snapshot = self._build_snapshot()
        except ValueError as exc:
            messagebox.showerror("Invalid Astro Inputs", str(exc))
            self.status_var.set("Invalid input")
            return

        self.history_tree.insert(
            "",
            0,
            values=(
                snapshot.selected_date.isoformat(),
                snapshot.selected_time,
                snapshot.symbol,
                snapshot.sun_sign,
                snapshot.moon_phase,
                f"{snapshot.reference_price:,.2f}",
            ),
        )
        self.status_var.set("Snapshot saved")

    def _build_snapshot(self) -> AstroSnapshot:
        selected_date = self._parse_date(self.date_var.get())
        selected_time = self._parse_time(self.time_var.get())
        symbol = self.symbol_var.get().strip().upper() or "NIFTY"

        try:
            reference_price = float(self.price_var.get().replace(",", "").strip())
        except ValueError as exc:
            raise ValueError("Reference Price must be a number.") from exc

        return AstroSnapshot(
            selected_date=selected_date,
            selected_time=selected_time,
            symbol=symbol,
            reference_price=reference_price,
            sun_sign=self._sun_sign_for(selected_date),
            moon_phase=self._moon_phase_for(selected_date),
            weekday=selected_date.strftime("%A"),
        )

    def _parse_date(self, value: str) -> date:
        try:
            return datetime.strptime(value.strip(), "%Y-%m-%d").date()
        except ValueError as exc:
            raise ValueError("Date must use YYYY-MM-DD format.") from exc

    def _parse_time(self, value: str) -> str:
        try:
            return datetime.strptime(value.strip(), "%H:%M").strftime("%H:%M")
        except ValueError as exc:
            raise ValueError("Time must use HH:MM 24-hour format.") from exc

    def _sun_sign_for(self, selected_date: date) -> str:
        month_day = (selected_date.month, selected_date.day)
        ranges = [
            ((1, 20), "Aquarius"),
            ((2, 19), "Pisces"),
            ((3, 21), "Aries"),
            ((4, 20), "Taurus"),
            ((5, 21), "Gemini"),
            ((6, 21), "Cancer"),
            ((7, 23), "Leo"),
            ((8, 23), "Virgo"),
            ((9, 23), "Libra"),
            ((10, 23), "Scorpio"),
            ((11, 22), "Sagittarius"),
            ((12, 22), "Capricorn"),
        ]

        sign = "Capricorn"
        for start, name in ranges:
            if month_day >= start:
                sign = name
        return sign

    def _moon_phase_for(self, selected_date: date) -> str:
        known_new_moon = date(2000, 1, 6)
        synodic_cycle = 29.53058867
        age = ((selected_date - known_new_moon).days % synodic_cycle)
        phases = [
            (1.84566, "New Moon"),
            (5.53699, "Waxing Crescent"),
            (9.22831, "First Quarter"),
            (12.91963, "Waxing Gibbous"),
            (16.61096, "Full Moon"),
            (20.30228, "Waning Gibbous"),
            (23.99361, "Last Quarter"),
            (27.68493, "Waning Crescent"),
            (29.53059, "New Moon"),
        ]
        for limit, label in phases:
            if age < limit:
                return label
        return "New Moon"

    def _build_price_levels(self, reference_price: float) -> list[tuple[str, float]]:
        steps = [
            ("Support -5%", reference_price * 0.95),
            ("Support -2%", reference_price * 0.98),
            ("Reference", reference_price),
            ("Resistance +2%", reference_price * 1.02),
            ("Resistance +5%", reference_price * 1.05),
        ]
        return steps
