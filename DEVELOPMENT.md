# Development Guide

## Setup

### 1. Python Scanner Service

```bash
cd mini-services/crypto-scanner
pip install -r requirements.txt
bash start.sh
```

The service runs on port 3003. Verify with:
```bash
curl http://localhost:3003/health
```

### 2. Next.js Dashboard

```bash
bun install
bun run dev
```

The dashboard runs on port 3000.

### 3. Watchdog (keeps Next.js alive in sandbox)

```bash
nohup setsid python /home/z/my-project/watchdog.py &
```

### 4. Scanner Watchdog (keeps Python service alive + loads .env)

```bash
nohup setsid python /home/z/my-project/scanner-watchdog.py &
```

The scanner watchdog automatically:
- Loads `.env` from `mini-services/crypto-scanner/.env`
- Restarts the scanner if it crashes
- Logs to `scanner.log`

## API Key Configuration (all optional)

Create a `.env` file at `mini-services/crypto-scanner/.env`:

```bash
# CoinGecko Demo API Key (free at https://www.coingecko.com/api/pricing)
# Increases rate limit from 5-15 to 30 calls/min, reduces 429 errors
COINGECKO_API_KEY=your_demo_key

# CoinMarketCap Pro API Key (free at https://pro.coinmarketcap.com/signup)
# Enables: categories, global metrics, exchange map, cross-verification
CMC_API_KEY=your_cmc_key

# Dune Analytics API Key (free at https://dune.com/api-keys)
# Enables: on-chain Grade A evidence (revenue, holders, active users)
DUNE_API_KEY=your_dune_key

# Optional: Dune query IDs for pre-configured insights
# Browse https://dune.com/browse to find queries
# DUNE_QUERY_TOKEN_CONCENTRATION=12345
# DUNE_QUERY_REAL_REVENUE=67890
# DUNE_QUERY_ACTIVE_USERS=11111

# Optional: Additional news sources
# CRYPTOPANIC_TOKEN=your_token
# CRYPTOCOMPARE_KEY=your_key
```

Without any keys, the system uses 11 free sources. With all keys, it uses 15 sources.

## Code Quality

### Before Committing

```bash
# Lint check
bun run lint

# TypeScript check (src only)
npx tsc --noEmit 2>&1 | grep "^src/"
```

Both must pass with zero errors.

### Git Rules (see RULES.md)

1. **NEVER-FORCE-PUSH**: `git push --force` is absolutely forbidden
2. **SESSION-START-SYNC-CHECK**: Always `git fetch origin` + `git status` before any changes

## Architecture Decisions

### Why Python + Next.js?

- **Python**: Excellent for data processing, API integration, and complex scoring logic
- **Next.js**: Modern React framework with SSR, API routes, and excellent DX
- **Separation**: Clean separation between data processing (Python) and presentation (Next.js)

### Why Pure SVG Charts?

- No external chart library dependency (reduced bundle size)
- Full control over styling and animations
- Consistent with shadcn/ui design system

### Why IndexedDB over localStorage?

- 50MB+ storage capacity (vs 5MB for localStorage)
- Asynchronous, non-blocking operations
- Better for storing scan cache and large datasets
- Automatic migration from localStorage on first load

### Why In-Memory Storage (Python)?

- Simple for MVP — no database setup required
- Fast read/write for real-time scanning
- Trade-off: Data lost on service restart
- Future: Migrate to SQLite via Prisma (already configured)

## Adding a New Data Source

1. Add fetch function in `data/sources.py`:
```python
async def fetch_new_source(query: str) -> dict[str, Any] | None:
    async with httpx.AsyncClient() as c:
        return await _get_json(c, f"https://api.example.com/{query}")
```

2. Integrate in `framework/evidence.py`:
```python
async def collect(candidate, ...):
    # Add new source
    data = await sources.fetch_new_source(candidate.symbol)
    if data:
        _apply_new_data(b, data)
        b.sources += 1
```

3. Update `models/schemas.py` if new fields are needed.

## Adding a New Translation Key

1. Add to `src/lib/i18n/en.json`:
```json
{
  "section": {
    "newKey": "English text"
  }
}
```

2. Add to `src/lib/i18n/fa.json`:
```json
{
  "section": {
    "newKey": "متن فارسی"
  }
}
```

3. Use in components:
```tsx
const { t } = useLanguage();
return <p>{t("section.newKey")}</p>;
```

## Testing

### Manual Testing Flow

1. Start both services
2. Open browser at `http://localhost:3000`
3. Run a scan with different personas
4. Test all UI features:
   - Grid/Analytics views
   - Detail drawer with all sections
   - Watchlist (star projects)
   - History view
   - Scan diff
   - Global search
   - Export (MD, JSON, CSV)
   - Language toggle (EN/FA)
   - Theme toggle (dark/light)
   - Keyboard shortcuts

### Performance Benchmarks

- Page load: < 500ms
- Scan completion: 10-20 seconds (5 projects)
- Detail drawer open: < 500ms
- Language toggle: < 100ms

## Troubleshooting

### Python Service Won't Start

```bash
# Check if port 3003 is in use
lsof -i :3003

# Restart service
bash mini-services/crypto-scanner/start.sh
```

### Next.js Won't Compile

```bash
# Clear Next.js cache
rm -rf .next

# Restart
bun run dev
```

### CoinGecko Rate Limiting (429)

The framework automatically:
1. Retries after 2 seconds
2. Falls back to DeFiLlama-only discovery
3. Lowers confidence scores for missing data

### Images Not Loading

Images are fetched from CoinGecko. If rate-limited:
- Images will be `None` in llama-only path
- Fallback: First 3 letters of symbol displayed
