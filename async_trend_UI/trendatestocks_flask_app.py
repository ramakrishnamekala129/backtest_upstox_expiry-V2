from __future__ import annotations

import asyncio
import datetime as dt
import importlib.util
import os
import threading
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, render_template_string, request


BASE_DIR = Path(__file__).resolve().parent
CORE_SCRIPT = BASE_DIR / "trendatestocks_v1.1.py"


def load_core_module():
    spec = importlib.util.spec_from_file_location("trend_core", CORE_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load core script from {CORE_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


core = load_core_module()


def _iso_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def create_app() -> Flask:
    app = Flask(__name__)

    state_lock = threading.Lock()
    state: dict[str, Any] = {
        "running": False,
        "last_started_at": None,
        "last_finished_at": None,
        "last_error": None,
        "last_config": {},
        "payload": None,
    }

    def normalize_df(df):
        clean_df = df.copy()
        for col in clean_df.columns:
            if hasattr(clean_df[col], "dt"):
                try:
                    clean_df[col] = clean_df[col].dt.strftime("%Y-%m-%d")
                except Exception:
                    pass
        clean_df = clean_df.where(clean_df.notnull(), None)
        return clean_df

    def to_records(df) -> list[dict[str, Any]]:
        return normalize_df(df).to_dict(orient="records")

    def build_payload(trend_dates):
        dates_table = core.dates_wise_table(trend_dates)
        single_df = core.dates_wise_single_df(trend_dates)
        summary_df = core.dates_wise_summary(trend_dates)

        payload = {
            "generated_at": _iso_now(),
            "trend_dates": to_records(trend_dates),
            "dates_wise_single": to_records(single_df),
            "dates_wise_summary": to_records(summary_df),
            "dates_wise_table": {
                trend_date: to_records(trend_df)
                for trend_date, trend_df in dates_table.items()
            },
        }
        return payload, dates_table, single_df, summary_df

    def run_pipeline_job(config: dict[str, str]) -> None:
        env_backup = {k: os.environ.get(k) for k in config}
        with state_lock:
            state["running"] = True
            state["last_started_at"] = _iso_now()
            state["last_error"] = None
            state["last_config"] = dict(config)

        try:
            for key, value in config.items():
                os.environ[key] = value

            trend_dates = asyncio.run(core.run_pipeline())
            payload, dates_table, single_df, summary_df = build_payload(trend_dates)

            # Keep the same output artifacts as the original script.
            core.export_dataframes_to_excel(
                trend_dates_df=trend_dates,
                dates_table=dates_table,
                single_df=single_df,
                summary_df=summary_df,
                output_dir=core.OUTPUT_DIR,
            )
            core.export_dataframes_to_json(
                trend_dates_df=trend_dates,
                dates_table=dates_table,
                single_df=single_df,
                summary_df=summary_df,
                output_dir=core.OUTPUT_DIR,
            )

            with state_lock:
                state["payload"] = payload
        except Exception as exc:
            with state_lock:
                state["last_error"] = str(exc)
        finally:
            for key, old_value in env_backup.items():
                if old_value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = old_value

            with state_lock:
                state["running"] = False
                state["last_finished_at"] = _iso_now()

    @app.get("/api/health")
    def api_health():
        return jsonify({"status": "ok", "time": _iso_now()})

    @app.get("/api/status")
    def api_status():
        with state_lock:
            return jsonify(
                {
                    "running": state["running"],
                    "last_started_at": state["last_started_at"],
                    "last_finished_at": state["last_finished_at"],
                    "last_error": state["last_error"],
                    "last_config": state["last_config"],
                    "has_results": state["payload"] is not None,
                }
            )

    @app.post("/api/run")
    def api_run():
        data = request.get_json(silent=True) or {}
        config = {
            "BACKTEST_MONTHS": str(data.get("BACKTEST_MONTHS", 6)).strip(),
            "MAX_SYMBOL_CONCURRENCY": str(data.get("MAX_SYMBOL_CONCURRENCY", 4)).strip(),
            "MAX_REQUEST_CONCURRENCY": str(data.get("MAX_REQUEST_CONCURRENCY", 6)).strip(),
            "DB_SAVE_EVERY": str(data.get("DB_SAVE_EVERY", 25)).strip(),
        }

        with state_lock:
            if state["running"]:
                return jsonify({"error": "Pipeline is already running"}), 409

        worker = threading.Thread(target=run_pipeline_job, args=(config,), daemon=True)
        worker.start()
        return jsonify({"message": "Pipeline started", "config": config}), 202

    @app.get("/api/results")
    def api_results():
        with state_lock:
            payload = state["payload"]
        if payload is None:
            return jsonify({"error": "No results yet"}), 404
        return jsonify(payload)

    @app.get("/")
    def index():
        return render_template_string(
            """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TrendDates Flask UI</title>
  <style>
    :root {
      --bg: #f4f7fb;
      --card: #ffffff;
      --line: #d9e2ec;
      --text: #1f2937;
      --muted: #6b7280;
      --brand: #0f766e;
      --brand-strong: #115e59;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Segoe UI, Tahoma, sans-serif;
      color: var(--text);
      background: linear-gradient(180deg, #eef5ff 0%, var(--bg) 100%);
    }
    .wrap {
      max-width: 1200px;
      margin: 24px auto;
      padding: 0 12px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 14px;
      margin-bottom: 14px;
    }
    .row {
      display: grid;
      grid-template-columns: repeat(4, minmax(120px, 1fr));
      gap: 10px;
    }
    label {
      display: block;
      font-size: 12px;
      color: var(--muted);
      margin-bottom: 6px;
    }
    input {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 8px;
    }
    button {
      margin-top: 12px;
      background: var(--brand);
      color: #fff;
      border: 0;
      border-radius: 8px;
      padding: 10px 14px;
      cursor: pointer;
    }
    button:hover { background: var(--brand-strong); }
    .status { color: var(--muted); font-size: 14px; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      background: #fff;
    }
    th, td {
      border: 1px solid var(--line);
      padding: 6px;
      text-align: left;
      vertical-align: top;
    }
    th { background: #f8fafc; }
    .scroll { max-height: 420px; overflow: auto; }
    @media (max-width: 900px) {
      .row { grid-template-columns: repeat(2, minmax(120px, 1fr)); }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h2 style="margin-top: 0;">TrendDates Pipeline</h2>
      <div class="row">
        <div>
          <label for="BACKTEST_MONTHS">BACKTEST_MONTHS</label>
          <input id="BACKTEST_MONTHS" value="6">
        </div>
        <div>
          <label for="MAX_SYMBOL_CONCURRENCY">MAX_SYMBOL_CONCURRENCY</label>
          <input id="MAX_SYMBOL_CONCURRENCY" value="4">
        </div>
        <div>
          <label for="MAX_REQUEST_CONCURRENCY">MAX_REQUEST_CONCURRENCY</label>
          <input id="MAX_REQUEST_CONCURRENCY" value="6">
        </div>
        <div>
          <label for="DB_SAVE_EVERY">DB_SAVE_EVERY</label>
          <input id="DB_SAVE_EVERY" value="25">
        </div>
      </div>
      <button id="runBtn">Run Pipeline</button>
      <p class="status" id="statusText">Checking status...</p>
    </div>

    <div class="card">
      <h3 style="margin-top: 0;">Trend Dates</h3>
      <div class="scroll">
        <table id="trendTable"></table>
      </div>
    </div>
  </div>

  <script>
    const statusText = document.getElementById("statusText");
    const runBtn = document.getElementById("runBtn");

    function buildTable(tableEl, rows) {
      if (!rows || !rows.length) {
        tableEl.innerHTML = "<tr><td>No rows</td></tr>";
        return;
      }
      const keys = Object.keys(rows[0]);
      const head = "<tr>" + keys.map(k => `<th>${k}</th>`).join("") + "</tr>";
      const body = rows.map(r => {
        return "<tr>" + keys.map(k => `<td>${r[k] ?? ""}</td>`).join("") + "</tr>";
      }).join("");
      tableEl.innerHTML = head + body;
    }

    async function refreshStatus() {
      const res = await fetch("/api/status");
      const data = await res.json();
      statusText.textContent =
        `running=${data.running} | has_results=${data.has_results} | last_error=${data.last_error || "none"}`;
      runBtn.disabled = !!data.running;
    }

    async function loadResults() {
      const res = await fetch("/api/results");
      if (!res.ok) return;
      const data = await res.json();
      buildTable(document.getElementById("trendTable"), data.trend_dates || []);
    }

    runBtn.addEventListener("click", async () => {
      const payload = {
        BACKTEST_MONTHS: document.getElementById("BACKTEST_MONTHS").value,
        MAX_SYMBOL_CONCURRENCY: document.getElementById("MAX_SYMBOL_CONCURRENCY").value,
        MAX_REQUEST_CONCURRENCY: document.getElementById("MAX_REQUEST_CONCURRENCY").value,
        DB_SAVE_EVERY: document.getElementById("DB_SAVE_EVERY").value,
      };
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const out = await res.json();
      if (!res.ok) {
        statusText.textContent = out.error || "Failed to start pipeline";
        return;
      }
      statusText.textContent = "Pipeline started...";
      await refreshStatus();
    });

    setInterval(async () => {
      await refreshStatus();
      await loadResults();
    }, 3000);

    refreshStatus();
    loadResults();
  </script>
</body>
</html>
            """
        )

    return app


app = create_app()


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=False)
