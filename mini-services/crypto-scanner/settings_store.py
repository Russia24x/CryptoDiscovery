"""
Settings store for CryptoSieve — JSON-based persistence for API keys
and news sources.

This module is imported by main.py BEFORE `from data import sources` so
that API keys configured through the Settings UI are available via
`os.environ.get(...)` to the rest of the codebase at module-load time.

Storage layout (mini-services/crypto-scanner/settings.json — gitignored):

    {
      "api_keys": {
        "CMC_API_KEY": {
          "value": "abc123...",
          "enabled": true,
          "type": "keyed"            // "free" | "keyed" | "manual"
        },
        "DUNE_API_KEY": { ... },
        "COINGECKO_API_KEY": { ... },
        "CRYPTOPANIC_TOKEN": { ... },
        "CRYPTOCOMPARE_KEY": { ... }
      },
      "news_sources": [
        { "name": "CoinDesk", "url": "...", "type": "rss", "enabled": true },
        { "name": "ArzDigital Breaking", "url": "...", "type": "rss", "enabled": true },
        { "name": "Mastersharkcrypto", "url": "Mastersharkcrypto", "type": "telegram", "enabled": true }
      ]
    }

Design principles (per project governance + "Never guess missing data"):
  - The settings.json file is OPTIONAL. If absent, sensible defaults are
    pre-populated (the existing free RSS feeds + Telegram channel).
  - Existing env vars take precedence: if `os.environ[key]` is already set
    (e.g. via `.env` file or shell), we DON'T override it. This respects
    operators who configure the service via env without ever touching the
    Settings UI. Settings UI changes only affect the env at the next
    restart of the scanner process.
  - API key values are NEVER logged. They are stored on disk in plaintext
    (settings.json is gitignored), but in API responses they are masked.
  - "Never guess missing data": if a key is not set, the GET endpoint
    returns "Not configured", never "Invalid".

Public API:
    apply_to_env()              -> called automatically on import
    load()                      -> dict (current settings; creates defaults)
    save(settings)              -> writes settings.json
    get_api_key_value(key_name) -> str | None  (raw value, never masked)
    mask_value(value)          -> str          (****XXXX format)
    list_known_api_keys()       -> list[str]
    list_default_news_sources() -> list[dict]
"""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any

# --------------------------------------------------------------------------- #
#  Constants
# --------------------------------------------------------------------------- #

# The settings file lives next to main.py (and is gitignored).
_SETTINGS_PATH = Path(__file__).resolve().parent / "settings.json"

# All API keys this UI can manage. The first three (CMC, Dune, CoinGecko)
# are the originally-specified keys; the other two are optional sources
# that the existing data layer already reads from env, exposed for power
# users. Each entry: (env_var, default_type, human_label, description).
KNOWN_API_KEYS: list[tuple[str, str, str, str]] = [
    ("CMC_API_KEY",       "keyed",  "CoinMarketCap (Pro)",      "Cross-verification, airdrops, categories, exchange rankings. Get a key at pro.coinmarketcap.com"),
    ("DUNE_API_KEY",      "keyed",  "Dune Analytics",           "On-chain data (Grade A evidence). Free key at dune.com/api-keys"),
    ("COINGECKO_API_KEY", "keyed",  "CoinGecko (Demo)",        "Removes rate limits. Free demo key at coingecko.com/api/pricing"),
    ("CRYPTOPANIC_TOKEN", "keyed",  "CryptoPanic",             "Optional news source. Free token at cryptopanic.com/developers"),
    ("CRYPTOCOMPARE_KEY", "keyed",  "CryptoCompare",           "Optional news + price source. Free key at cryptocompare.com"),
]

# Default news sources — mirrors the hardcoded lists already used by
# data/sources.py (NEWS_FEEDS, NEWS_FEEDS_FA, Telegram channel used in
# the News feed view). These serve as initial seed data when settings.json
# doesn't exist yet; they are NOT auto-re-added after the user deletes them.
DEFAULT_NEWS_SOURCES: list[dict[str, Any]] = [
    # English RSS feeds
    {"name": "CoinDesk",         "url": "https://www.coindesk.com/arc/outboundfeeds/rss/", "type": "rss", "enabled": True},
    {"name": "Cointelegraph",    "url": "https://cointelegraph.com/rss",                   "type": "rss", "enabled": True},
    {"name": "Decrypt",          "url": "https://decrypt.co/feed",                        "type": "rss", "enabled": True},
    {"name": "Bitcoinist",       "url": "https://bitcoinist.com/feed/",                   "type": "rss", "enabled": True},
    # Persian RSS feeds
    {"name": "ArzDigital Breaking",   "url": "https://arzdigital.com/breaking/feed/",            "type": "rss", "enabled": True},
    {"name": "ArzDigital Blog",       "url": "https://arzdigital.com/feed/",                    "type": "rss", "enabled": True},
    {"name": "MihanBlockchain News",  "url": "https://mihanblockchain.com/category/news/feed/",  "type": "rss", "enabled": True},
    {"name": "MihanBlockchain Markets","url": "https://mihanblockchain.com/category/markets/feed/","type": "rss", "enabled": True},
    # Telegram public channel (no bot token needed — uses t.me/s/<channel>)
    {"name": "Mastersharkcrypto", "url": "Mastersharkcrypto", "type": "telegram", "enabled": True},
]

# Concurrent reads + writes to settings.json need a lock — Python's
# threading.Lock is fine because this is a single-process FastAPI service.
_LOCK = threading.Lock()


# --------------------------------------------------------------------------- #
#  Masking
# --------------------------------------------------------------------------- #

def mask_value(value: str | None) -> str:
    """Return a masked version of an API key: ****XXXX (last 4 chars only).

    Edge cases (never guess):
      - None / empty -> "Not configured"
      - Very short (<8 chars) -> "****" (we don't leak the whole key)
    """
    if not value:
        return "Not configured"
    if len(value) < 8:
        return "****"
    return "****" + value[-4:]


# --------------------------------------------------------------------------- #
#  Defaults
# --------------------------------------------------------------------------- #

def _default_api_keys() -> dict[str, dict[str, Any]]:
    """Build the default api_keys section.

    If an env var is already set (e.g. via .env file or shell), seed the
    store with its value so the UI reflects the live state on first load.
    """
    out: dict[str, dict[str, Any]] = {}
    for env_name, key_type, _label, _desc in KNOWN_API_KEYS:
        env_val = os.environ.get(env_name, "")
        out[env_name] = {
            "value": env_val,
            "enabled": bool(env_val),
            "type": key_type,
        }
    return out


def list_default_news_sources() -> list[dict[str, Any]]:
    """Return a deep copy of DEFAULT_NEWS_SOURCES (for seeding / for the UI to
    know which sources are 'built-in')."""
    return [dict(s) for s in DEFAULT_NEWS_SOURCES]


def list_known_api_keys() -> list[tuple[str, str, str, str]]:
    """Return the (env_name, default_type, label, description) tuples."""
    return list(KNOWN_API_KEYS)


# --------------------------------------------------------------------------- #
#  Load / Save
# --------------------------------------------------------------------------- #

def _blank_settings() -> dict[str, Any]:
    return {
        "api_keys": _default_api_keys(),
        "news_sources": list_default_news_sources(),
        "_schema_version": 1,
    }


def load() -> dict[str, Any]:
    """Load settings from disk. If the file doesn't exist (first run),
    create it with defaults and return those defaults.

    This function is safe to call from any thread — it acquires the lock.
    """
    with _LOCK:
        if not _SETTINGS_PATH.exists():
            # First run — write defaults so the file exists going forward.
            try:
                settings = _blank_settings()
                _write_unsafe(settings)
                return settings
            except OSError:
                # Filesystem read-only? Return in-memory defaults.
                return _blank_settings()
        try:
            with _SETTINGS_PATH.open("r", encoding="utf-8") as f:
                raw = json.load(f)
        except (json.JSONDecodeError, OSError):
            # Corrupt or unreadable — return defaults so the UI doesn't crash.
            return _blank_settings()
        # Migrate / fill in missing keys (forward-compatibility)
        if "api_keys" not in raw or not isinstance(raw["api_keys"], dict):
            raw["api_keys"] = _default_api_keys()
        else:
            # Ensure every known key has all required fields
            for env_name, key_type, _label, _desc in KNOWN_API_KEYS:
                entry = raw["api_keys"].get(env_name)
                if not isinstance(entry, dict):
                    # Use env value if available (so .env-supplied keys
                    # appear in the UI on first run)
                    env_val = os.environ.get(env_name, "")
                    raw["api_keys"][env_name] = {
                        "value": env_val,
                        "enabled": bool(env_val),
                        "type": key_type,
                    }
                else:
                    entry.setdefault("value", "")
                    entry.setdefault("enabled", bool(entry.get("value")))
                    entry.setdefault("type", key_type)
        if "news_sources" not in raw or not isinstance(raw["news_sources"], list):
            raw["news_sources"] = list_default_news_sources()
        raw.setdefault("_schema_version", 1)
        return raw


def _write_unsafe(settings: dict[str, Any]) -> None:
    """Write settings to disk. Caller must hold _LOCK."""
    # Restrictive permissions on the file (contains API keys in plaintext).
    # 0o600 = owner read/write only.
    tmp_path = _SETTINGS_PATH.with_suffix(".json.tmp")
    with tmp_path.open("w", encoding="utf-8") as f:
        json.dump(settings, f, indent=2, ensure_ascii=False)
    tmp_path.replace(_SETTINGS_PATH)
    try:
        os.chmod(_SETTINGS_PATH, 0o600)
    except OSError:
        pass  # Filesystem may not support chmod (e.g. on some Windows mounts)


def save(settings: dict[str, Any]) -> None:
    """Persist settings to disk. Validates top-level shape."""
    if not isinstance(settings, dict):
        raise ValueError("settings must be a dict")
    if "api_keys" not in settings or not isinstance(settings["api_keys"], dict):
        raise ValueError("settings.api_keys must be a dict")
    if "news_sources" not in settings or not isinstance(settings["news_sources"], list):
        raise ValueError("settings.news_sources must be a list")
    with _LOCK:
        _write_unsafe(settings)


# --------------------------------------------------------------------------- #
#  API-key-specific helpers
# --------------------------------------------------------------------------- #

def get_api_key_value(key_name: str) -> str:
    """Return the raw (unmasked) value of an API key, or "" if not set.

    Used by the test-api-key endpoint to make a real upstream API call.

    Lookup order:
      1. settings.json (most up-to-date source of truth)
      2. os.environ (covers .env / shell configuration)
    """
    settings = load()
    entry = settings.get("api_keys", {}).get(key_name)
    if isinstance(entry, dict) and entry.get("enabled") and entry.get("value"):
        return str(entry["value"])
    # Fall back to env var (covers .env-supplied keys that were never
    # explicitly enabled through the UI)
    return os.environ.get(key_name, "")


def is_api_key_enabled(key_name: str) -> bool:
    """Whether a key is enabled (and has a non-empty value)."""
    settings = load()
    entry = settings.get("api_keys", {}).get(key_name)
    if not isinstance(entry, dict):
        return False
    return bool(entry.get("enabled") and entry.get("value"))


# --------------------------------------------------------------------------- #
#  Apply to environment
# --------------------------------------------------------------------------- #

def apply_to_env() -> dict[str, str]:
    """Apply settings.json API keys to os.environ.

    IMPORTANT: existing os.environ values are NEVER overwritten — if the
    operator set a key via .env or shell, that takes precedence. This
    respects the operator's environment without surprising them.

    Returns the dict of {env_name: applied_value} for logging purposes
    (without exposing values — just names that were set/enabled).

    This function is idempotent and safe to call multiple times.
    """
    settings = load()
    applied: dict[str, str] = {}
    for env_name, _key_type, _label, _desc in KNOWN_API_KEYS:
        entry = settings.get("api_keys", {}).get(env_name)
        if not isinstance(entry, dict):
            continue
        value = str(entry.get("value") or "")
        enabled = bool(entry.get("enabled"))
        if value and enabled:
            # Only set if not already in env (env wins)
            if not os.environ.get(env_name):
                os.environ[env_name] = value
                applied[env_name] = "applied"
            else:
                applied[env_name] = "env_precedence"
        else:
            applied[env_name] = "not_configured"
    return applied


# --------------------------------------------------------------------------- #
#  Module-level initialisation — runs on `import settings_store`
# --------------------------------------------------------------------------- #

# Apply settings to os.environ immediately so that the subsequent
# `from data import sources` (in main.py) picks them up. This MUST happen
# before sources.py is imported because sources.py caches the env values
# at module-load time into module-level constants (CMC_API_KEY,
# DUNE_API_KEY, COINGECKO_API_KEY, etc.).
try:
    apply_to_env()
except Exception:  # noqa: BLE001
    # Never let a settings-store bug block the service from starting.
    # Fall back to whatever os.environ provides.
    pass
