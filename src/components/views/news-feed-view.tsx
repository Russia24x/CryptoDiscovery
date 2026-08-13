"use client";

/* -------------------------------------------------------------------------- *
 *  NewsFeedView  ·  Task 4
 *  ---------------------------------------------------------------------------
 *  A standalone React component that unifies crypto news (RSS from CoinDesk,
 *  Cointelegraph, Decrypt, Bitcoinist, plus optional CryptoPanic/CryptoCompare)
 *  and a live Telegram channel feed (@Mastersharkcrypto) into one tabbed
 *  "News & Signals" view.
 *
 *    1. Top-level sub-tabs       — Crypto News | Telegram Channel
 *    2. Data sources badge row   — fetches /api/scanner/sources once on mount,
 *                                  shows availability dots (free / api_key)
 *    3. Crypto News              — source filter chips + search box + responsive
 *                                  card grid (1/2/3 cols), with thumbnails,
 *                                  color-coded source badges, relative time,
 *                                  category chips; whole card links out.
 *    4. Telegram Channel         — chat-style vertical feed of message bubbles
 *                                  with bidi-aware text (dir="auto"), view
 *                                  counts, optional photo media, link chips,
 *                                  per-message deep link to t.me.
 *
 *  API contracts (already built & verified — do NOT modify backend):
 *    GET /api/scanner/news?limit=40&source=             -> NewsResponse
 *    GET /api/scanner/telegram?channel=..&limit=20      -> TelegramResponse
 *    GET /api/scanner/sources                           -> SourcesStatus
 *
 *  Conventions:
 *    - shadcn/ui (New York) — Card, Button, Badge, Input, Tabs, Tooltip,
 *      Skeleton, Alert, Separator, Switch.
 *    - Tailwind 4 — emerald/teal accents, amber for Telegram, rose for errors,
 *      sky for info. NO indigo / blue primaries.
 *    - lucide-react icons.
 *    - useLanguage() for i18n; translation keys live under `news.*` / `telegram.*`.
 * ------------------------------------------------------------------------- */

import * as React from "react";
import {
  AlertCircle,
  BookOpen,
  Clock,
  Eye,
  ExternalLink,
  Filter,
  Link2,
  MessageCircle,
  Newspaper,
  Radio,
  RefreshCw,
  Search,
  Send,
  X,
} from "lucide-react";

import { useLanguage } from "@/lib/i18n/LanguageProvider";
import {
  NewsArticle,
  NewsResponse,
  PersianNewsArticle,
  PersianNewsResponse,
  TelegramMessage,
  TelegramResponse,
  DataSourceInfo,
  SourcesStatus,
} from "@/lib/scanner-types";

import {
  Card,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// --------------------------------------------------------------------------- //
//  Props
// --------------------------------------------------------------------------- //

interface NewsFeedViewProps {
  /** Optional: pre-selected sub-tab */
  initialTab?: "news" | "news_fa" | "telegram";
}

// --------------------------------------------------------------------------- //
//  Source color system
// --------------------------------------------------------------------------- //

interface SourceStyle {
  badge: string; // classes for the colored source badge
  dot: string; // classes for the colored status dot
}

const SOURCE_STYLES: Record<string, SourceStyle> = {
  CoinDesk: {
    badge: "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  Cointelegraph: {
    badge: "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  Decrypt: {
    badge: "border-sky-500/30 bg-sky-500/15 text-sky-600 dark:text-sky-400",
    dot: "bg-sky-500",
  },
  Bitcoinist: {
    badge: "border-rose-500/30 bg-rose-500/15 text-rose-600 dark:text-rose-400",
    dot: "bg-rose-500",
  },
  CryptoPanic: {
    badge: "border-violet-500/30 bg-violet-500/15 text-violet-600 dark:text-violet-400",
    dot: "bg-violet-500",
  },
  CryptoCompare: {
    badge: "border-teal-500/30 bg-teal-500/15 text-teal-600 dark:text-teal-400",
    dot: "bg-teal-500",
  },
  // Persian sources
  ArzDigital: {
    badge: "border-cyan-500/30 bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
    dot: "bg-cyan-500",
  },
  MihanBlockchain: {
    badge: "border-orange-500/30 bg-orange-500/15 text-orange-600 dark:text-orange-400",
    dot: "bg-orange-500",
  },
};

const DEFAULT_SOURCE_STYLE: SourceStyle = {
  badge: "border-border bg-muted text-muted-foreground",
  dot: "bg-muted-foreground",
};

/** Strip suffixes/parens so source names from /sources match the SOURCE_STYLES keys. */
function normalizeSourceName(name: string): string {
  return name
    .replace(/\s+RSS$/i, "")
    .replace(/\s+API$/i, "")
    .replace(/\s*\(.*?\)\s*/g, "")
    .trim();
}

function sourceStyle(name: string): SourceStyle {
  return SOURCE_STYLES[name] ?? SOURCE_STYLES[normalizeSourceName(name)] ?? DEFAULT_SOURCE_STYLE;
}

/** Translate-with-fallback helper, reusable by any sub-component. */
function useTt() {
  const { t } = useLanguage();
  return React.useCallback(
    (key: string, fallback: string, vars?: Record<string, string | number>): string => {
      const v = t(key, vars);
      return typeof v === "string" && v !== key ? v : fallback;
    },
    [t],
  );
}

// Sources shown in the data-sources badge row (news + telegram relevant only).
const RELEVANT_SOURCE_PATTERNS = [
  /RSS$/i,
  /^CryptoPanic/i,
  /^CryptoCompare/i,
  /^Telegram/i,
  /^ArzDigital/i,
  /^MihanBlockchain/i,
];

function isNewsOrTelegramSource(s: DataSourceInfo): boolean {
  return RELEVANT_SOURCE_PATTERNS.some((p) => p.test(s.name));
}

// --------------------------------------------------------------------------- //
//  Time helpers
// --------------------------------------------------------------------------- //

/** Format an ISO date string as a short relative time, e.g. "5m ago". */
function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "—";
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w ago`;
  const mon = Math.floor(day / 30);
  if (mon < 12) return `${mon}mo ago`;
  const yr = Math.floor(day / 365);
  return `${yr}y ago`;
}

/** Format an ISO date string as a clock time, e.g. "13:45" or "Aug 13, 13:45". */
function timeClock(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "—";
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (sameDay) return time;
  const dateStr = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return `${dateStr}, ${time}`;
}

/** Seconds since an ISO date. Returns 0 when invalid. */
function secondsSince(iso: string | null): number {
  if (!iso) return 0;
  const date = new Date(iso);
  if (isNaN(date.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
}

// --------------------------------------------------------------------------- //
//  Sub-components — News
// --------------------------------------------------------------------------- //

/** Thumbnail with graceful fallback when the image fails to load. */
function ArticleImage({ src, alt }: { src: string | null; alt: string }) {
  const [errored, setErrored] = React.useState(false);
  React.useEffect(() => setErrored(false), [src]);
  if (!src || errored) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-md bg-gradient-to-br from-emerald-500/10 via-teal-500/10 to-sky-500/10">
        <Newspaper className="size-8 text-muted-foreground/40" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setErrored(true)}
      className="aspect-video w-full rounded-md object-cover transition-opacity"
    />
  );
}

/** A single news article card. The whole card is a link. */
function ArticleCard({ article }: { article: NewsArticle }) {
  const tt = useTt();
  const st = sourceStyle(article.source);
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block focus:outline-none"
    >
      <Card className="h-full overflow-hidden border-border/60 bg-card/40 p-0 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring/50">
        <ArticleImage src={article.image} alt={article.title} />
        <div className="space-y-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <Badge variant="outline" className={st.badge}>
              <span className={`size-1.5 rounded-full ${st.dot}`} />
              {article.source}
            </Badge>
            <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="size-3" />
              {timeAgo(article.published_at)}
            </span>
          </div>
          <h3 className="line-clamp-2 font-semibold leading-snug text-foreground" dir="auto">
            {article.title}
          </h3>
          {article.summary && (
            <p className="line-clamp-3 text-sm text-muted-foreground" dir="auto">{article.summary}</p>
          )}
          {article.categories.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {article.categories.slice(0, 3).map((c) => (
                <span
                  key={c}
                  className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  dir="auto"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
        <CardFooter className="border-t border-border/40 px-4 py-2">
          <span className="flex items-center gap-1 text-xs text-muted-foreground transition-colors group-hover:text-primary" dir="auto">
            <ExternalLink className="size-3" />
            {tt("news.readArticle", "Read article")}
          </span>
        </CardFooter>
      </Card>
    </a>
  );
}

/** Skeleton card for the loading state. */
function ArticleCardSkeleton() {
  return (
    <Card className="overflow-hidden border-border/60 bg-card/40 p-0 backdrop-blur-sm">
      <Skeleton className="aspect-video w-full rounded-none" />
      <div className="space-y-2 p-4">
        <div className="flex justify-between">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-12" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
      </div>
    </Card>
  );
}

/** Source filter chip. */
function SourceChip({
  active,
  onClick,
  label,
  count,
  sourceName,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  sourceName?: string;
}) {
  const st = sourceName ? sourceStyle(sourceName) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
        active
          ? "border-primary/40 bg-primary/10 text-foreground"
          : "border-border/60 bg-card/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      }`}
    >
      {st && <span className={`size-1.5 rounded-full ${st.dot}`} />}
      <span>{label}</span>
      <span className="text-[10px] opacity-70">{count}</span>
    </button>
  );
}

// --------------------------------------------------------------------------- //
//  Sub-components — Telegram
// --------------------------------------------------------------------------- //

/** Skeleton for a telegram message bubble. */
function MessageSkeleton() {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4 backdrop-blur-sm">
      <div className="mb-3 flex items-center gap-2">
        <Skeleton className="size-8 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="mb-2 h-3 w-full" />
      <Skeleton className="mb-2 h-3 w-11/12" />
      <Skeleton className="mb-2 h-3 w-3/4" />
      <div className="mt-3 flex justify-between">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}

/** A single telegram message bubble. */
function MessageBubble({ msg }: { msg: TelegramMessage }) {
  const tt = useTt();
  // Derive per-message deep link: t.me/<channel>/<messageId>
  const msgNum = msg.id.split("/")[1] ?? "";
  const deepLink =
    msg.channel_url && msgNum ? `${msg.channel_url}/${msgNum}` : msg.channel_url;
  const hasPhoto = msg.media_type === "photo" && msg.media_url;
  const album = msg.media_all && msg.media_all.length > 1 ? msg.media_all : null;

  return (
    <article className="rounded-xl border border-border/60 bg-card/40 p-4 backdrop-blur-sm transition-colors hover:border-border">
      {/* Header: avatar + channel + time */}
      <div className="mb-2 flex items-center gap-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-500/30 to-sky-500/30 text-amber-600 dark:text-amber-400">
          <Send className="size-4" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <a
            href={msg.channel_url}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-sm font-medium text-foreground hover:text-primary"
            dir="auto"
          >
            @{msg.channel}
          </a>
          <span className="text-[10px] text-muted-foreground">·</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {timeAgo(msg.published_at)}
          </span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={deepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={tt("telegram.openMessageAria", "Open message on Telegram")}
            >
              <ExternalLink className="size-3.5" />
            </a>
          </TooltipTrigger>
          <TooltipContent>{tt("telegram.openOnTelegram", "Open on Telegram")}</TooltipContent>
        </Tooltip>
      </div>

      {/* Optional photo media — single photo or album grid */}
      {hasPhoto && !album && (
        <a
          href={deepLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-3 block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <img
            src={msg.media_url as string}
            alt={tt("telegram.mediaAlt", "Telegram media")}
            loading="lazy"
            className="max-h-80 w-full rounded-lg object-cover"
          />
        </a>
      )}
      {album && (
        <div className="mb-3 grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(album.length, 2)}, 1fr)` }}>
          {album.slice(0, 4).map((url, i) => (
            <a
              key={`${url}-${i}`}
              href={deepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <img
                src={url}
                alt={tt("telegram.mediaAltN", "Telegram media {n}", { n: i + 1 })}
                loading="lazy"
                className="h-32 w-full object-cover transition-transform hover:scale-105 sm:h-40"
              />
            </a>
          ))}
        </div>
      )}

      {/* Message text — dir="auto" handles bidi (Persian RTL + English LTR mix) */}
      <div
        dir="auto"
        className="max-h-[420px] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90 [scrollbar-width:thin]"
      >
        {msg.text}
      </div>

      {/* External links as compact chips */}
      {msg.links.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {msg.links.slice(0, 6).map((l, i) => {
            let host = l;
            try {
              host = new URL(l).hostname.replace(/^www\./, "");
            } catch {
              host = l;
            }
            return (
              <a
                key={`${l}-${i}`}
                href={l}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                <Link2 className="size-3" />
                <span className="max-w-[180px] truncate">{host}</span>
              </a>
            );
          })}
        </div>
      )}

      {/* Footer: clock time + view count */}
      <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="size-3" />
          {timeClock(msg.published_at)}
        </span>
        {msg.views != null && (
          <span className="flex items-center gap-1" dir="auto">
            <Eye className="size-3" />
            {msg.views} {tt("telegram.views", "views")}
          </span>
        )}
      </div>
    </article>
  );
}

// --------------------------------------------------------------------------- //
//  Sub-components — Data sources badge row
// --------------------------------------------------------------------------- //

function SourcesBadgeRow({ sources }: { sources: DataSourceInfo[] }) {
  const tt = useTt();
  const relevant = React.useMemo(
    () => sources.filter(isNewsOrTelegramSource),
    [sources],
  );
  if (relevant.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="flex items-center gap-1 text-xs text-muted-foreground" dir="auto">
        <Radio className="size-3.5" />
        {tt("common.dataSources", "Data sources:")}
      </span>
      {relevant.map((s) => {
        const displayName = s.name.replace(/\s+RSS$/i, "");
        const st = sourceStyle(s.name);
        return (
          <Tooltip key={s.name}>
            <TooltipTrigger asChild>
              <div
                className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] ${
                  s.available
                    ? "border-emerald-500/30 bg-emerald-500/5 text-foreground"
                    : "border-border/60 bg-muted/40 text-muted-foreground"
                }`}
              >
                <span
                  className={`size-1.5 rounded-full ${
                    s.available ? "bg-emerald-500" : "bg-muted-foreground/40"
                  }`}
                />
                <span dir="auto">{displayName}</span>
                <span
                  className={`ml-0.5 rounded px-1 py-px text-[9px] ${
                    s.type === "free"
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {s.type === "free" ? tt("common.free", "free") : tt("common.key", "key")}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-[240px] text-left">
              <div className="font-semibold" dir="auto">{s.name}</div>
              <div className="text-xs opacity-90" dir="auto">{s.description}</div>
              <div className="mt-1 text-[10px] opacity-70" dir="auto">
                {s.available ? tt("common.available", "Available") : tt("common.unavailable", "Unavailable")} · {s.type}
              </div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

// --------------------------------------------------------------------------- //
//  News tab content
// --------------------------------------------------------------------------- //

interface NewsTabContentProps {
  loading: boolean;
  error: string | null;
  news: NewsResponse | null;
  sources: string[];
  sourceFilter: string;
  setSourceFilter: (s: string) => void;
  search: string;
  setSearch: (s: string) => void;
  filteredArticles: NewsArticle[];
  onRetry: () => void;
  tt: (key: string, fallback: string) => string;
}

function NewsTabContent({
  loading,
  error,
  news,
  sources,
  sourceFilter,
  setSourceFilter,
  search,
  setSearch,
  filteredArticles,
  onRetry,
  tt,
}: NewsTabContentProps) {
  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <Filter className="size-3.5 text-muted-foreground" />
          <SourceChip
            active={sourceFilter === "all"}
            onClick={() => setSourceFilter("all")}
            label={tt("news.allSources", "All Sources")}
            count={news?.articles.length ?? 0}
          />
          {sources.map((s) => (
            <SourceChip
              key={s}
              active={sourceFilter === s}
              onClick={() => setSourceFilter(s)}
              label={s}
              count={news?.articles.filter((a) => a.source === s).length ?? 0}
              sourceName={s}
            />
          ))}
        </div>
        <div className="relative sm:w-64">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tt("news.searchPlaceholder", "Search articles…")}
            className="h-8 pl-8 text-sm"
            aria-label={tt("news.searchAria", "Search articles")}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={tt("news.clearSearchAria", "Clear search")}
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <ArticleCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>{tt("news.errorTitle", "Failed to load news")}</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span className="break-all text-xs">{error}</span>
            <Button size="sm" variant="outline" onClick={onRetry} className="shrink-0">
              <RefreshCw className="size-3.5" />
              {tt("news.retry", "Retry")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Empty state */}
      {!loading && !error && filteredArticles.length === 0 && (
        <Card className="border-dashed border-border/60 bg-card/40">
          <CardContent className="flex flex-col items-center justify-center gap-3 p-12 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-muted/60">
              <Newspaper className="size-6 text-muted-foreground/60" />
            </div>
            <div>
              <p className="font-medium">
                {tt("news.noArticles", "No articles match your filters")}
              </p>
              <p className="text-sm text-muted-foreground">
                {tt("news.noArticlesDesc", "Try a different source or search term.")}
              </p>
            </div>
            {(sourceFilter !== "all" || search) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSourceFilter("all");
                  setSearch("");
                }}
              >
                {tt("news.clearFilters", "Clear filters")}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Articles grid */}
      {!loading && !error && filteredArticles.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredArticles.map((a, i) => (
            <ArticleCard key={`${a.url}-${i}`} article={a} />
          ))}
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------- //
//  Persian news tab content
// --------------------------------------------------------------------------- //

const PERSIAN_CATEGORY_STYLES: Record<string, { label: string; badge: string }> = {
  breaking: { label: "خبر فوری", badge: "border-rose-500/30 bg-rose-500/15 text-rose-400" },
  blog: { label: "مقاله", badge: "border-cyan-500/30 bg-cyan-500/15 text-cyan-400" },
  news: { label: "خبر", badge: "border-orange-500/30 bg-orange-500/15 text-orange-400" },
  analysis: { label: "تحلیل", badge: "border-amber-500/30 bg-amber-500/15 text-amber-400" },
};

function PersianArticleCard({ article }: { article: PersianNewsArticle }) {
  const st = sourceStyle(article.source);
  const cat = article.category ? PERSIAN_CATEGORY_STYLES[article.category] : null;
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card/40 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
    >
      <ArticleImage src={article.image} alt={article.title} />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${st.badge}`}>
            <span className={`size-1.5 rounded-full ${st.dot}`} />
            {article.source}
          </span>
          {cat && (
            <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${cat.badge}`}>
              {cat.label}
            </span>
          )}
          <span className="ml-auto text-[10px] text-muted-foreground">
            {timeAgo(article.published_at)}
          </span>
        </div>
        <h3 dir="auto" className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
          {article.title}
        </h3>
        <p dir="auto" className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
          {article.summary}
        </p>
        <div className="mt-auto flex items-center gap-1 pt-1 text-[11px] text-muted-foreground transition-colors group-hover:text-primary">
          <ExternalLink className="size-3" />
          {article.source === "ArzDigital" ? "arzdigital.com" : "mihanblockchain.com"}
        </div>
      </div>
    </a>
  );
}

interface PersianNewsTabContentProps {
  loading: boolean;
  error: string | null;
  newsFa: PersianNewsResponse | null;
  categoryFilter: string;
  setCategoryFilter: (v: string) => void;
  search: string;
  setSearch: (v: string) => void;
  filteredArticles: PersianNewsArticle[];
  onRetry: () => void;
  tt: (key: string, fallback: string) => string;
}

function PersianNewsTabContent({
  loading,
  error,
  newsFa,
  categoryFilter,
  setCategoryFilter,
  search,
  setSearch,
  filteredArticles,
  onRetry,
  tt,
}: PersianNewsTabContentProps) {
  // Build category chips from the articles present
  const categories = React.useMemo(() => {
    const set = new Set<string>();
    newsFa?.articles.forEach((a) => { if (a.category) set.add(a.category); });
    return Array.from(set);
  }, [newsFa]);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <SourceChip
            active={categoryFilter === "all"}
            onClick={() => setCategoryFilter("all")}
            label={tt("news_fa.allCategories", "همه دسته‌ها")}
            count={newsFa?.articles.length ?? 0}
          />
          {categories.map((cat) => {
            const count = newsFa?.articles.filter((a) => a.category === cat).length ?? 0;
            const style = PERSIAN_CATEGORY_STYLES[cat];
            return (
              <SourceChip
                key={cat}
                active={categoryFilter === cat}
                onClick={() => setCategoryFilter(cat)}
                label={style?.label ?? cat}
                count={count}
              />
            );
          })}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tt("news_fa.searchPlaceholder", "جستجوی مقالات...")}
            className="h-8 pl-8 pr-8 text-xs"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <ArticleCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>{tt("news_fa.errorTitle", "خطا")}</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={onRetry} className="h-7 text-xs">
              {tt("news_fa.retry", "تلاش مجدد")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Empty state */}
      {!loading && !error && filteredArticles.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Newspaper className="size-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {tt("news_fa.noArticles", "مقاله‌ای یافت نشد")}
            </p>
            {(categoryFilter !== "all" || search) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setCategoryFilter("all"); setSearch(""); }}
                className="h-7 text-xs"
              >
                {tt("news_fa.clearFilters", "پاک کردن فیلترها")}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Articles grid */}
      {!loading && !error && filteredArticles.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredArticles.map((a, i) => (
            <PersianArticleCard key={`${a.url}-${i}`} article={a} />
          ))}
        </div>
      )}
    </div>
  );
}

interface TelegramTabContentProps {
  loading: boolean;
  error: string | null;
  telegram: TelegramResponse | null;
  autoRefresh: boolean;
  setAutoRefresh: (v: boolean) => void;
  onRetry: () => void;
  tt: (key: string, fallback: string) => string;
}

function TelegramTabContent({
  loading,
  error,
  telegram,
  autoRefresh,
  setAutoRefresh,
  onRetry,
  tt,
}: TelegramTabContentProps) {
  const messages = telegram?.messages ?? [];
  const channelUrl = telegram?.channel_url ?? "https://t.me/Mastersharkcrypto";
  const channelName = telegram?.channel ?? "Mastersharkcrypto";

  return (
    <div className="space-y-4">
      {/* Channel header (always visible) */}
      <Card className="border-border/60 bg-gradient-to-br from-amber-500/5 via-card/40 to-sky-500/5 backdrop-blur-sm">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-500/30 to-sky-500/30 text-amber-600 dark:text-amber-400">
              <Send className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-base font-semibold">@{channelName}</h3>
                {telegram && (
                  <Badge
                    variant="outline"
                    className="shrink-0 border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  >
                    <Radio className="size-3" />
                    {tt("telegram.live", "Live")}
                  </Badge>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {telegram
                  ? `${telegram.message_count} ${tt("telegram.messages", "messages")} · ${tt(
                      "telegram.updated",
                      "updated",
                    )} ${timeAgo(telegram.fetched_at)}`
                  : tt("telegram.loadingChannel", "Loading channel…")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              {tt("telegram.autoRefresh", "Auto-refresh")}
              <Switch
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
                aria-label={tt("telegram.autoRefreshAria", "Auto-refresh every 60 seconds")}
              />
            </label>
            {telegram ? (
              <Button
                asChild
                size="sm"
                className="bg-amber-500/90 text-white hover:bg-amber-500"
              >
                <a href={channelUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-3.5" />
                  <span className="hidden sm:inline">
                    {tt("telegram.joinChannel", "Join Channel")}
                  </span>
                  <span className="sm:hidden">{tt("telegram.join", "Join")}</span>
                </a>
              </Button>
            ) : (
              <Button
                size="sm"
                disabled
                className="bg-amber-500/90 text-white hover:bg-amber-500"
              >
                <ExternalLink className="size-3.5" />
                <span className="hidden sm:inline">
                  {tt("telegram.joinChannel", "Join Channel")}
                </span>
                <span className="sm:hidden">{tt("telegram.join", "Join")}</span>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Loading state */}
      {loading && (
        <div className="mx-auto max-w-2xl space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <MessageSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>{tt("telegram.errorTitle", "Failed to load Telegram feed")}</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span className="break-all text-xs">{error}</span>
            <Button size="sm" variant="outline" onClick={onRetry} className="shrink-0">
              <RefreshCw className="size-3.5" />
              {tt("telegram.retry", "Retry")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Empty state */}
      {!loading && !error && messages.length === 0 && (
        <Card className="border-dashed border-border/60 bg-card/40">
          <CardContent className="flex flex-col items-center justify-center gap-3 p-12 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-muted/60">
              <MessageCircle className="size-6 text-muted-foreground/60" />
            </div>
            <div>
              <p className="font-medium">{tt("telegram.noMessages", "No messages")}</p>
              <p className="text-sm text-muted-foreground">
                {tt("telegram.noMessagesDesc", "The channel feed is empty.")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Messages feed — centered narrow column like Telegram web */}
      {!loading && !error && messages.length > 0 && (
        <div className="mx-auto max-w-2xl space-y-3">
          {messages.map((m) => (
            <MessageBubble key={m.id} msg={m} />
          ))}
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------- //
//  Main component
// --------------------------------------------------------------------------- //

export function NewsFeedView({ initialTab = "news" }: NewsFeedViewProps) {
  const { t } = useLanguage();

  // tt(key, fallback) — returns the translated string if present, else fallback.
  const tt = React.useCallback(
    (key: string, fallback: string) => {
      const val = t(key);
      return typeof val === "string" && val !== key ? val : fallback;
    },
    [t],
  );

  // ----- Tab state -----
  const [tab, setTab] = React.useState<"news" | "news_fa" | "telegram">(initialTab);

  // ----- News state (English) -----
  const [news, setNews] = React.useState<NewsResponse | null>(null);
  const [newsLoading, setNewsLoading] = React.useState(false);
  const [newsRefreshing, setNewsRefreshing] = React.useState(false);
  const [newsError, setNewsError] = React.useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = React.useState<string>("all");
  const [search, setSearch] = React.useState("");

  // ----- Persian news state -----
  const [newsFa, setNewsFa] = React.useState<PersianNewsResponse | null>(null);
  const [newsFaLoading, setNewsFaLoading] = React.useState(false);
  const [newsFaRefreshing, setNewsFaRefreshing] = React.useState(false);
  const [newsFaError, setNewsFaError] = React.useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = React.useState<string>("all");
  const [searchFa, setSearchFa] = React.useState("");

  // ----- Telegram state -----
  const [telegram, setTelegram] = React.useState<TelegramResponse | null>(null);
  const [tgLoading, setTgLoading] = React.useState(false);
  const [tgRefreshing, setTgRefreshing] = React.useState(false);
  const [tgError, setTgError] = React.useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = React.useState(false);

  // ----- Sources state -----
  const [sources, setSources] = React.useState<DataSourceInfo[]>([]);

  // ----- Cache age display tick (re-render every 1s for smooth "Xs ago") -----
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // ----- Fetchers -----
  const fetchNews = React.useCallback(async (refresh: boolean) => {
    if (refresh) setNewsRefreshing(true);
    else setNewsLoading(true);
    setNewsError(null);
    try {
      const res = await fetch("/api/scanner/news?limit=40");
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const data = (await res.json()) as NewsResponse;
      if (!data || !Array.isArray(data.articles)) {
        throw new Error("Invalid response shape");
      }
      setNews(data);
    } catch (e) {
      setNewsError(e instanceof Error ? e.message : "Failed to load news");
    } finally {
      setNewsLoading(false);
      setNewsRefreshing(false);
    }
  }, []);

  const fetchNewsFa = React.useCallback(async (refresh: boolean) => {
    if (refresh) setNewsFaRefreshing(true);
    else setNewsFaLoading(true);
    setNewsFaError(null);
    try {
      const res = await fetch("/api/scanner/news/fa?limit=40");
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const data = (await res.json()) as PersianNewsResponse;
      if (!data || !Array.isArray(data.articles)) {
        throw new Error("Invalid response shape");
      }
      setNewsFa(data);
    } catch (e) {
      setNewsFaError(e instanceof Error ? e.message : "Failed to load Persian news");
    } finally {
      setNewsFaLoading(false);
      setNewsFaRefreshing(false);
    }
  }, []);

  const fetchTelegram = React.useCallback(async (refresh: boolean) => {
    if (refresh) setTgRefreshing(true);
    else setTgLoading(true);
    setTgError(null);
    try {
      const res = await fetch(
        "/api/scanner/telegram?channel=Mastersharkcrypto&limit=20",
      );
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const data = (await res.json()) as TelegramResponse;
      if (data?.error) throw new Error(data.error);
      if (!data || !Array.isArray(data.messages)) {
        throw new Error("Invalid response shape");
      }
      setTelegram(data);
    } catch (e) {
      setTgError(e instanceof Error ? e.message : "Failed to load telegram feed");
    } finally {
      setTgLoading(false);
      setTgRefreshing(false);
    }
  }, []);

  const fetchSources = React.useCallback(async () => {
    try {
      const res = await fetch("/api/scanner/sources");
      if (!res.ok) return;
      const data = (await res.json()) as SourcesStatus;
      if (data?.sources) setSources(data.sources);
    } catch {
      // Non-critical — silently ignore.
    }
  }, []);

  // ----- Initial load (sources + active tab) -----
  React.useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  React.useEffect(() => {
    if (tab === "news" && !news && !newsLoading) fetchNews(false);
    else if (tab === "news_fa" && !newsFa && !newsFaLoading) fetchNewsFa(false);
    else if (tab === "telegram" && !telegram && !tgLoading) fetchTelegram(false);
  }, [tab, news, newsFa, telegram, newsLoading, newsFaLoading, tgLoading, fetchNews, fetchNewsFa, fetchTelegram]);

  // ----- Auto-refresh telegram every 60s when toggle is on -----
  React.useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => fetchTelegram(true), 60_000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchTelegram]);

  // ----- Derived: news sources list for filter chips -----
  const newsSources = React.useMemo(() => {
    const set = new Set<string>();
    news?.articles.forEach((a) => set.add(a.source));
    return Array.from(set);
  }, [news]);

  // ----- Derived: filtered news articles (English) -----
  const filteredArticles = React.useMemo(() => {
    if (!news) return [];
    const q = search.trim().toLowerCase();
    return news.articles.filter((a) => {
      if (sourceFilter !== "all" && a.source !== sourceFilter) return false;
      if (q) {
        const hay = `${a.title} ${a.summary}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [news, sourceFilter, search]);

  // ----- Derived: filtered Persian news articles -----
  const filteredFaArticles = React.useMemo(() => {
    if (!newsFa) return [];
    const q = searchFa.trim().toLowerCase();
    return newsFa.articles.filter((a) => {
      if (categoryFilter !== "all" && a.category !== categoryFilter) return false;
      if (q) {
        const hay = `${a.title} ${a.summary}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [newsFa, categoryFilter, searchFa]);

  // ----- Derived: cache age for the active tab -----
  const activeFetchedAt =
    tab === "news" ? news?.fetched_at
    : tab === "news_fa" ? newsFa?.fetched_at
    : telegram?.fetched_at;
  // secondsSince recomputes on every render (tick state forces re-render every 1s).
  void secondsSince(activeFetchedAt ?? null);

  // ----- Refresh handler for the current tab -----
  const handleRefresh = React.useCallback(() => {
    if (tab === "news") fetchNews(true);
    else if (tab === "news_fa") fetchNewsFa(true);
    else fetchTelegram(true);
  }, [tab, fetchNews, fetchNewsFa, fetchTelegram]);

  const isRefreshing =
    tab === "news" ? newsRefreshing
    : tab === "news_fa" ? newsFaRefreshing
    : tgRefreshing;
  const isLoading =
    tab === "news" ? newsLoading
    : tab === "news_fa" ? newsFaLoading
    : tgLoading;
  const activeError =
    tab === "news" ? newsError
    : tab === "news_fa" ? newsFaError
    : tgError;
  const onRetry =
    tab === "news" ? () => fetchNews(false)
    : tab === "news_fa" ? () => fetchNewsFa(false)
    : () => fetchTelegram(false);

  // ----------------------------------------------------------------------- //
  //  Render
  // ----------------------------------------------------------------------- //

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* ===== Header ===== */}
        <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20 text-emerald-600 dark:text-emerald-400">
                <Newspaper className="size-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold leading-tight">
                  {tt("news.title", "News & Signals")}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {tt("news.subtitle", "Crypto news + Telegram channel, unified.")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {activeFetchedAt && (
                <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
                  <Clock className="size-3" />
                  {tt("news.updated", "Updated")} {timeAgo(activeFetchedAt)}
                </span>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={handleRefresh}
                disabled={isRefreshing || isLoading}
              >
                <RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">{tt("news.refresh", "Refresh")}</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ===== Data sources badge row ===== */}
        <SourcesBadgeRow sources={sources} />

        {/* ===== Tabs ===== */}
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "news" | "news_fa" | "telegram")}
          className="w-full"
        >
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="news" className="flex-1 sm:flex-initial">
              <Newspaper className="size-4" />
              {tt("news.tab", "Crypto News")}
              {news && news.articles.length > 0 && (
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
                  {news.articles.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="news_fa" className="flex-1 sm:flex-initial">
              <BookOpen className="size-4" />
              {tt("news_fa.tab", "اخبار فارسی")}
              {newsFa && newsFa.articles.length > 0 && (
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
                  {newsFa.articles.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="telegram" className="flex-1 sm:flex-initial">
              <Send className="size-4" />
              {tt("telegram.tab", "Telegram Channel")}
              {telegram && telegram.messages.length > 0 && (
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
                  {telegram.messages.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ----- English news tab ----- */}
          <TabsContent value="news" className="space-y-4">
            <NewsTabContent
              loading={newsLoading}
              error={newsError}
              news={news}
              sources={newsSources}
              sourceFilter={sourceFilter}
              setSourceFilter={setSourceFilter}
              search={search}
              setSearch={setSearch}
              filteredArticles={filteredArticles}
              onRetry={onRetry}
              tt={tt}
            />
          </TabsContent>

          {/* ----- Persian news tab ----- */}
          <TabsContent value="news_fa" className="space-y-4">
            <PersianNewsTabContent
              loading={newsFaLoading}
              error={newsFaError}
              newsFa={newsFa}
              categoryFilter={categoryFilter}
              setCategoryFilter={setCategoryFilter}
              search={searchFa}
              setSearch={setSearchFa}
              filteredArticles={filteredFaArticles}
              onRetry={onRetry}
              tt={tt}
            />
          </TabsContent>

          {/* ----- Telegram tab ----- */}
          <TabsContent value="telegram" className="space-y-4">
            <TelegramTabContent
              loading={tgLoading}
              error={tgError}
              telegram={telegram}
              autoRefresh={autoRefresh}
              setAutoRefresh={setAutoRefresh}
              onRetry={onRetry}
              tt={tt}
            />
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}

export default NewsFeedView;
