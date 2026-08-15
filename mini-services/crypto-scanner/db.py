"""
SQLite persistence layer for the crypto-scanner service.

Stores scans, reports, and historical scores so data survives restarts.
Uses Python's built-in sqlite3 module — no external dependencies.

Thread safety: all DB operations are protected by a threading.Lock
because FastAPI's async event loop calls synchronous SQLite operations
from a single thread, but multiple async tasks can interleave DB calls.
Without a lock, concurrent execute()+commit() on the same connection
can cause "database is locked" errors or corruption.

Schema:
  scans       — scan metadata (id, status, phase, progress, config, timestamps)
  reports     — full project reports as JSON (id, scan_id, symbol, scores, data)
  score_history — historical score tracking (symbol, score, scan_id, timestamp)
"""
from __future__ import annotations

import json
import logging
import os
import sqlite3
import threading
from datetime import datetime, timezone
from typing import Any

log = logging.getLogger("scanner.db")

DB_PATH = os.environ.get("SCANNER_DB_PATH", "/home/z/my-project/db/scanner.db")

# Thread-local connection storage
_local = threading.local()

# Global write lock — serializes ALL DB writes to prevent corruption.
# SQLite operations are synchronous and share one connection per thread.
# Without this lock, concurrent save_report/save_scan calls from multiple
# async tasks can interleave execute()+commit() and corrupt the database.
_db_lock = threading.Lock()


def _get_conn() -> sqlite3.Connection:
    """Get a thread-local SQLite connection."""
    if not hasattr(_local, "conn"):
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")  # Better concurrent read performance
        conn.execute("PRAGMA foreign_keys=ON")
        _local.conn = conn
    return _local.conn


def init_db() -> None:
    """Initialize the database schema. Safe to call multiple times."""
    with _db_lock:
        conn = _get_conn()
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS scans (
                scan_id     TEXT PRIMARY KEY,
                status      TEXT NOT NULL DEFAULT 'queued',
                phase       TEXT,
                progress    REAL DEFAULT 0.0,
                total       INTEGER DEFAULT 0,
                processed   INTEGER DEFAULT 0,
                persona     TEXT,
                config_json TEXT,
                started_at  TEXT,
                finished_at TEXT,
                error       TEXT,
                phase_log_json TEXT
            );

            CREATE TABLE IF NOT EXISTS reports (
                id          TEXT PRIMARY KEY,
                scan_id     TEXT NOT NULL,
                symbol      TEXT NOT NULL,
                name        TEXT,
                project_quality REAL,
                token_quality   REAL,
                confidence      REAL,
                action          TEXT,
                action_label    TEXT,
                evidence_grade  TEXT,
                veto            INTEGER DEFAULT 0,
                category        TEXT,
                sector          TEXT,
                image           TEXT,
                report_json     TEXT NOT NULL,
                created_at      TEXT NOT NULL,
                FOREIGN KEY (scan_id) REFERENCES scans(scan_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS score_history (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol      TEXT NOT NULL,
                scan_id     TEXT,
                project_quality REAL NOT NULL,
                token_quality   REAL,
                confidence      REAL,
                action          TEXT,
                timestamp   TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_reports_scan_id ON reports(scan_id);
            CREATE INDEX IF NOT EXISTS idx_reports_symbol ON reports(symbol);
            CREATE INDEX IF NOT EXISTS idx_score_history_symbol ON score_history(symbol);
            CREATE INDEX IF NOT EXISTS idx_score_history_ts ON score_history(timestamp);
        """)
        conn.commit()
    log.info("Database initialized at %s", DB_PATH)


def save_scan(scan_id: str, status: str, phase: str, progress: float,
              total: int, processed: int, persona: str,
              config_json: str, started_at: str,
              finished_at: str | None = None, error: str | None = None,
              phase_log: list[str] | None = None) -> None:
    """Insert or update a scan record."""
    with _db_lock:
        conn = _get_conn()
        conn.execute("""
            INSERT INTO scans (scan_id, status, phase, progress, total, processed,
                              persona, config_json, started_at, finished_at, error, phase_log_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(scan_id) DO UPDATE SET
                status=excluded.status, phase=excluded.phase, progress=excluded.progress,
                total=excluded.total, processed=excluded.processed,
                finished_at=excluded.finished_at, error=excluded.error,
                phase_log_json=excluded.phase_log_json
        """, (scan_id, status, phase, progress, total, processed, persona,
              config_json, started_at, finished_at, error,
              json.dumps(phase_log or [])))
        conn.commit()


def save_report(report_id: str, scan_id: str, report_dict: dict[str, Any]) -> None:
    """Save a full report as JSON + extract key fields for querying."""
    with _db_lock:
        conn = _get_conn()
        cand = report_dict.get("candidate") or {}
        decision = report_dict.get("decision") or {}
        created_at = report_dict.get("created_at") or datetime.now(timezone.utc).isoformat()

        conn.execute("""
            INSERT OR REPLACE INTO reports
            (id, scan_id, symbol, name, project_quality, token_quality, confidence,
             action, action_label, evidence_grade, veto, category, sector, image,
             report_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            report_id, scan_id,
            cand.get("symbol", ""), cand.get("name", ""),
            report_dict.get("project_quality_score"),
            report_dict.get("token_quality_score"),
            report_dict.get("confidence"),
            decision.get("action"), decision.get("action_label"),
            report_dict.get("evidence_grade"),
            1 if (report_dict.get("veto") or {}).get("triggered") else 0,
            cand.get("category"), cand.get("sector"), cand.get("image"),
            json.dumps(report_dict), created_at,
        ))

        # Also save to score_history for trend tracking
        conn.execute("""
            INSERT INTO score_history (symbol, scan_id, project_quality, token_quality, confidence, action, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            cand.get("symbol", ""), scan_id,
            report_dict.get("project_quality_score") or 0,
            report_dict.get("token_quality_score"),
            report_dict.get("confidence"),
            decision.get("action_label"),
            created_at,
        ))
        conn.commit()


def load_scan(scan_id: str) -> dict[str, Any] | None:
    """Load a scan record by ID."""
    conn = _get_conn()
    row = conn.execute("SELECT * FROM scans WHERE scan_id = ?", (scan_id,)).fetchone()
    if not row:
        return None
    d = dict(row)
    d["phase_log"] = json.loads(d.pop("phase_log_json", "[]"))
    d["config"] = json.loads(d.pop("config_json", "{}"))
    return d


def load_report(report_id: str) -> dict[str, Any] | None:
    """Load a full report by ID."""
    conn = _get_conn()
    row = conn.execute("SELECT report_json FROM reports WHERE id = ?", (report_id,)).fetchone()
    if not row:
        return None
    return json.loads(row["report_json"])


def list_scans(limit: int = 50) -> list[dict[str, Any]]:
    """List recent scans."""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT scan_id, status, phase, progress, total, processed, persona, started_at, finished_at "
        "FROM scans ORDER BY started_at DESC LIMIT ?", (limit,)
    ).fetchall()
    return [dict(r) for r in rows]


def list_reports_for_scan(scan_id: str) -> list[dict[str, Any]]:
    """List all reports for a scan (full JSON)."""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT report_json FROM reports WHERE scan_id = ? ORDER BY project_quality DESC",
        (scan_id,)
    ).fetchall()
    return [json.loads(r["report_json"]) for r in rows]


def list_all_reports(limit: int = 50) -> list[dict[str, Any]]:
    """List recent reports across all scans (summary fields only)."""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT id, scan_id, symbol, name, project_quality, token_quality, confidence, "
        "action, action_label, evidence_grade, veto, category, sector, image, created_at "
        "FROM reports ORDER BY created_at DESC LIMIT ?", (limit,)
    ).fetchall()
    return [dict(r) for r in rows]


def get_score_history(symbol: str, limit: int = 20) -> list[dict[str, Any]]:
    """Get historical scores for a symbol — for trend analysis."""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT symbol, scan_id, project_quality, token_quality, confidence, action, timestamp "
        "FROM score_history WHERE symbol = ? ORDER BY timestamp DESC LIMIT ?",
        (symbol.upper(), limit)
    ).fetchall()
    return [dict(r) for r in rows]


def get_scan_count() -> int:
    """Total number of scans in the database."""
    conn = _get_conn()
    return conn.execute("SELECT COUNT(*) as c FROM scans").fetchone()["c"]


def get_report_count() -> int:
    """Total number of reports in the database."""
    conn = _get_conn()
    return conn.execute("SELECT COUNT(*) as c FROM reports").fetchone()["c"]
