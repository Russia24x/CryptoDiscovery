"use client";

/* -------------------------------------------------------------------------- *
 *  SettingsView  ·  Task ID: settings-page
 *  ---------------------------------------------------------------------------
 *  Manage API keys and news sources from the UI. Mirrors the backend at
 *  mini-services/crypto-scanner/settings_store.py + main.py /settings/*.
 *
 *  Two top-level sub-tabs:
 *    1. API Keys       — table of (CMC, Dune, CoinGecko, CryptoPanic,
 *                        CryptoCompare) with masked value + status + type,
 *                        plus Add / Edit / Test / Delete per row.
 *    2. News Sources   — table of RSS feeds + Telegram channels with
 *                        type / enabled / Delete / inline toggle.
 *
 *  API contracts (proxied via Next.js → scanner service):
 *    GET    /api/scanner/settings                                -> SettingsResponse
 *    POST   /api/scanner/settings/api-keys                       -> {ok, masked_value, ...}
 *    DELETE /api/scanner/settings/api-keys/{key_name}            -> {ok, key_name}
 *    POST   /api/scanner/settings/news-sources                   -> {ok, source}
 *    DELETE /api/scanner/settings/news-sources/{name}            -> {ok, name}
 *    POST   /api/scanner/settings/test-api-key/{key_name}        -> {valid, message, status_code}
 *
 *  Security:
 *    - API key values are NEVER shown in full. Backend masks them as
 *      "****XXXX" (last 4 chars only). The "Edit" dialog accepts a new
 *      value but only displays the existing masked value as a hint.
 *    - Password input for new values (hidden by default, with show/hide eye).
 *    - All requests go through the Next.js proxy (same-origin).
 *
 *  Conventions:
 *    - shadcn/ui (New York) — Card, Button, Badge, Tabs, Table, Input,
 *      Select, Switch, Skeleton, Alert, Dialog, Label, Tooltip.
 *    - Tailwind 4 — teal/violet accents for Settings, amber for warnings,
 *      rose for destructive, emerald for success. NO indigo / blue primaries.
 *    - lucide-react icons.
 *    - useLanguage() for i18n; translation keys live under `settings.*`
 *      with English fallbacks (so missing translation keys never break).
 *    - "Never guess missing data": a key with no value shows "Not configured",
 *      never "Invalid" or "Error".
 * ------------------------------------------------------------------------- */

import * as React from "react";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Key,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Rss,
  Send,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

// --------------------------------------------------------------------------- //
//  Types (mirror the backend response shape)
// --------------------------------------------------------------------------- //

interface ApiKeyEntry {
  key_name: string;
  label: string;
  description: string;
  masked_value: string; // "****XXXX" or "Not configured"
  has_value: boolean;
  enabled: boolean;
  type: string; // "free" | "keyed" | "manual"
  active: boolean; // has_value && enabled
}

interface SupportedApiKey {
  key_name: string;
  label: string;
  description: string;
  default_type: string;
}

interface NewsSourceEntry {
  name: string;
  url: string;
  type: "rss" | "telegram";
  enabled: boolean;
}

interface SettingsResponse {
  api_keys: ApiKeyEntry[];
  news_sources: NewsSourceEntry[];
  supported_api_keys: SupportedApiKey[];
}

interface TestApiKeyResponse {
  valid: boolean;
  message: string;
  status_code: number | null;
}

// --------------------------------------------------------------------------- //
//  i18n helper — translate with English fallback (matches existing pattern)
// --------------------------------------------------------------------------- //

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

// --------------------------------------------------------------------------- //
//  Constants
// --------------------------------------------------------------------------- //

// Mapping env-var-name → accent color (Tailwind classes).
const KEY_ACCENTS: Record<string, { ring: string; badge: string; dot: string }> = {
  CMC_API_KEY: {
    ring: "text-sky-400",
    badge: "border-sky-500/30 bg-sky-500/15 text-sky-600 dark:text-sky-400",
    dot: "bg-sky-500",
  },
  DUNE_API_KEY: {
    ring: "text-violet-400",
    badge: "border-violet-500/30 bg-violet-500/15 text-violet-600 dark:text-violet-400",
    dot: "bg-violet-500",
  },
  COINGECKO_API_KEY: {
    ring: "text-emerald-400",
    badge: "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  CRYPTOPANIC_TOKEN: {
    ring: "text-amber-400",
    badge: "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  CRYPTOCOMPARE_KEY: {
    ring: "text-teal-400",
    badge: "border-teal-500/30 bg-teal-500/15 text-teal-600 dark:text-teal-400",
    dot: "bg-teal-500",
  },
};

const DEFAULT_KEY_ACCENT = {
  ring: "text-muted-foreground",
  badge: "border-border bg-muted text-muted-foreground",
  dot: "bg-muted-foreground",
};

function keyAccent(name: string) {
  return KEY_ACCENTS[name] ?? DEFAULT_KEY_ACCENT;
}

// --------------------------------------------------------------------------- //
//  Component
// --------------------------------------------------------------------------- //

export function SettingsView() {
  const tt = useTt();
  const { toast } = useToast();

  const [settings, setSettings] = React.useState<SettingsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Active tab ("api-keys" | "news")
  const [tab, setTab] = React.useState<"api-keys" | "news">("api-keys");

  // Dialog state
  const [apiKeyDialog, setApiKeyDialog] = React.useState<{
    mode: "add" | "edit";
    key_name: string;
  } | null>(null);
  const [newsDialog, setNewsDialog] = React.useState(false);

  // Per-row test state (keyed by key_name)
  const [testState, setTestState] = React.useState<
    Record<string, { status: "running" | "done" | "error"; result?: TestApiKeyResponse }>
  >({});

  // Per-row saving state
  const [savingKey, setSavingKey] = React.useState<string | null>(null);

  // Refresh settings
  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/scanner/settings", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: SettingsResponse = await r.json();
      setSettings(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  // ---- API key actions ----

  const saveApiKey = React.useCallback(
    async (params: {
      key_name: string;
      key_value: string;
      enabled: boolean;
      key_type: string;
    }) => {
      setSavingKey(params.key_name);
      try {
        const r = await fetch("/api/scanner/settings/api-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        });
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          throw new Error(e?.detail ?? `HTTP ${r.status}`);
        }
        const result = await r.json();
        // Use the response — check if backend confirmed the save
        if (result && result.error) {
          throw new Error(result.error);
        }
        toast({
          title: tt("settings.toast.keySaved", "API key saved"),
          description: tt(
            "settings.toast.keySavedDesc",
            "Restart the scanner service for the key to take effect.",
          ),
        });
        setApiKeyDialog(null);
        await refresh();
      } catch (e) {
        toast({
          title: tt("settings.toast.saveFailed", "Failed to save key"),
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setSavingKey(null);
      }
    },
    [refresh, toast, tt],
  );

  const deleteApiKey = React.useCallback(
    async (key_name: string) => {
      if (
        !window.confirm(
          tt("settings.confirm.deleteKey", "Remove this API key? You can re-add it later."),
        )
      ) {
        return;
      }
      setSavingKey(key_name);
      try {
        const r = await fetch(
          `/api/scanner/settings/api-keys/${encodeURIComponent(key_name)}`,
          { method: "DELETE" },
        );
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          throw new Error(e?.detail ?? `HTTP ${r.status}`);
        }
        toast({
          title: tt("settings.toast.keyDeleted", "API key removed"),
          description: key_name,
        });
        await refresh();
      } catch (e) {
        toast({
          title: tt("settings.toast.deleteFailed", "Failed to remove key"),
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setSavingKey(null);
      }
    },
    [refresh, toast, tt],
  );

  const testApiKey = React.useCallback(
    async (key_name: string, override_value?: string) => {
      setTestState((s) => ({
        ...s,
        [key_name]: { status: "running" },
      }));
      try {
        const r = await fetch(
          `/api/scanner/settings/test-api-key/${encodeURIComponent(key_name)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              override_value ? { key_value: override_value } : {},
            ),
          },
        );
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          throw new Error(e?.detail ?? `HTTP ${r.status}`);
        }
        const data: TestApiKeyResponse = await r.json();
        setTestState((s) => ({
          ...s,
          [key_name]: { status: "done", result: data },
        }));
        toast({
          title: data.valid
            ? tt("settings.toast.keyValid", "Key is valid")
            : tt("settings.toast.keyInvalid", "Key test failed"),
          description: data.message,
          variant: data.valid ? "default" : "destructive",
        });
      } catch (e) {
        setTestState((s) => ({
          ...s,
          [key_name]: { status: "error" },
        }));
        toast({
          title: tt("settings.toast.testFailed", "Test request failed"),
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      }
    },
    [toast, tt],
  );

  // ---- News source actions ----

  const saveNewsSource = React.useCallback(
    async (params: {
      name: string;
      url: string;
      source_type: "rss" | "telegram";
      enabled: boolean;
    }) => {
      try {
        const r = await fetch("/api/scanner/settings/news-sources", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        });
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          throw new Error(e?.detail ?? `HTTP ${r.status}`);
        }
        toast({
          title: tt("settings.toast.sourceSaved", "News source saved"),
          description: params.name,
        });
        setNewsDialog(false);
        await refresh();
      } catch (e) {
        toast({
          title: tt("settings.toast.sourceSaveFailed", "Failed to save source"),
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      }
    },
    [refresh, toast, tt],
  );

  const deleteNewsSource = React.useCallback(
    async (name: string) => {
      if (
        !window.confirm(
          tt("settings.confirm.deleteSource", "Remove this news source?"),
        )
      ) {
        return;
      }
      try {
        const r = await fetch(
          `/api/scanner/settings/news-sources/${encodeURIComponent(name)}`,
          { method: "DELETE" },
        );
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          throw new Error(e?.detail ?? `HTTP ${r.status}`);
        }
        toast({
          title: tt("settings.toast.sourceDeleted", "News source removed"),
          description: name,
        });
        await refresh();
      } catch (e) {
        toast({
          title: tt("settings.toast.sourceDeleteFailed", "Failed to remove source"),
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      }
    },
    [refresh, toast, tt],
  );

  const toggleNewsSource = React.useCallback(
    async (entry: NewsSourceEntry, enabled: boolean) => {
      try {
        const r = await fetch("/api/scanner/settings/news-sources", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: entry.name,
            url: entry.url,
            source_type: entry.type,
            enabled,
          }),
        });
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          throw new Error(e?.detail ?? `HTTP ${r.status}`);
        }
        await refresh();
      } catch (e) {
        toast({
          title: tt("settings.toast.toggleFailed", "Failed to toggle source"),
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
        // Rollback the optimistic UI by refreshing
        await refresh();
      }
    },
    [refresh, toast, tt],
  );

  // ----------------------------------------------------------------------- //
  //  Render
  // ----------------------------------------------------------------------- //

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
            <ShieldCheck className="size-6 text-teal-500" />
            {tt("settings.title", "Settings")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {tt(
              "settings.subtitle",
              "Manage API keys and news sources. Changes are persisted to settings.json and applied on the next scanner restart.",
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
          {tt("settings.refresh", "Refresh")}
        </Button>
      </div>

      {/* Restart notice */}
      <Alert className="border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400">
        <AlertCircle className="size-4" />
        <AlertTitle>
          {tt("settings.restartNotice.title", "Changes need a scanner restart to take effect")}
        </AlertTitle>
        <AlertDescription>
          {tt(
            "settings.restartNotice.body",
            "API keys are loaded into the scanner process at startup. Save your changes here, then restart the scanner service (mini-services/crypto-scanner/start.sh) for new keys to become active.",
          )}
        </AlertDescription>
      </Alert>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>
            {tt("settings.error.loadFailed", "Failed to load settings")}
          </AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as "api-keys" | "news")}>
        <TabsList className="bg-card/40 backdrop-blur-sm">
          <TabsTrigger value="api-keys" className="gap-2">
            <Key className="size-4" />
            {tt("settings.tabs.apiKeys", "API Keys")}
            {settings?.api_keys && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                {settings.api_keys.filter((k) => k.active).length}/
                {settings.api_keys.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="news" className="gap-2">
            <Rss className="size-4" />
            {tt("settings.tabs.newsSources", "News Sources")}
            {settings?.news_sources && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                {settings.news_sources.filter((s) => s.enabled).length}/
                {settings.news_sources.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ============ API Keys tab ============ */}
        <TabsContent value="api-keys" className="mt-4">
          <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Key className="size-4 text-teal-500" />
                  {tt("settings.apiKeys.title", "API Keys")}
                </CardTitle>
                <CardDescription className="mt-1">
                  {tt(
                    "settings.apiKeys.description",
                    "Optional API keys for cross-verification, on-chain data, and richer news. Free keys are available — links in the description column.",
                  )}
                </CardDescription>
              </div>
              <Button
                size="sm"
                className="gap-2"
                onClick={() => setApiKeyDialog({ mode: "add", key_name: "" })}
              >
                <Plus className="size-4" />
                {tt("settings.apiKeys.add", "Add Key")}
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !settings || settings.api_keys.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  {tt("settings.apiKeys.empty", "No API keys configured.")}
                </div>
              ) : (
                <ApiKeyTable
                  api_keys={settings.api_keys}
                  testState={testState}
                  savingKey={savingKey}
                  onEdit={(k) => setApiKeyDialog({ mode: "edit", key_name: k })}
                  onDelete={deleteApiKey}
                  onTest={(k) => testApiKey(k)}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ News Sources tab ============ */}
        <TabsContent value="news" className="mt-4">
          <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Rss className="size-4 text-teal-500" />
                  {tt("settings.newsSources.title", "News Sources")}
                </CardTitle>
                <CardDescription className="mt-1">
                  {tt(
                    "settings.newsSources.description",
                    "RSS feeds and Telegram channels aggregated by the News feed. Pre-populated with the built-in sources (CoinDesk, Cointelegraph, ArzDigital, MihanBlockchain, etc.).",
                  )}
                </CardDescription>
              </div>
              <Button size="sm" className="gap-2" onClick={() => setNewsDialog(true)}>
                <Plus className="size-4" />
                {tt("settings.newsSources.add", "Add Source")}
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !settings || settings.news_sources.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  {tt("settings.newsSources.empty", "No news sources configured.")}
                </div>
              ) : (
                <NewsSourceTable
                  sources={settings.news_sources}
                  onToggle={toggleNewsSource}
                  onDelete={deleteNewsSource}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ============ Dialog: Add / Edit API Key ============ */}
      {apiKeyDialog && settings && (
        <ApiKeyDialog
          mode={apiKeyDialog.mode}
          existing={settings.api_keys.find((k) => k.key_name === apiKeyDialog.key_name)}
          supported={settings.supported_api_keys}
          open={!!apiKeyDialog}
          onOpenChange={(o) => !o && setApiKeyDialog(null)}
          onSave={saveApiKey}
          saving={!!savingKey}
        />
      )}

      {/* ============ Dialog: Add News Source ============ */}
      <NewsSourceDialog
        open={newsDialog}
        onOpenChange={setNewsDialog}
        onSave={saveNewsSource}
      />
    </div>
  );
}

// --------------------------------------------------------------------------- //
//  Sub-component: API Key Table
// --------------------------------------------------------------------------- //

interface ApiKeyTableProps {
  api_keys: ApiKeyEntry[];
  testState: Record<string, { status: "running" | "done" | "error"; result?: TestApiKeyResponse }>;
  savingKey: string | null;
  onEdit: (key_name: string) => void;
  onDelete: (key_name: string) => void;
  onTest: (key_name: string) => void;
}

function ApiKeyTable({
  api_keys,
  testState,
  savingKey,
  onEdit,
  onDelete,
  onTest,
}: ApiKeyTableProps) {
  const tt = useTt();
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">
              {tt("settings.apiKeys.col.name", "Name")}
            </TableHead>
            <TableHead>{tt("settings.apiKeys.col.value", "Value")}</TableHead>
            <TableHead>{tt("settings.apiKeys.col.status", "Status")}</TableHead>
            <TableHead>{tt("settings.apiKeys.col.type", "Type")}</TableHead>
            <TableHead className="pr-4 text-right">
              {tt("settings.apiKeys.col.actions", "Actions")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {api_keys.map((k) => {
            const accent = keyAccent(k.key_name);
            const ts = testState[k.key_name];
            const isSaving = savingKey === k.key_name;
            return (
              <TableRow key={k.key_name} className="hover:bg-muted/30">
                <TableCell className="pl-4">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2 font-medium">
                      <span className={`inline-block size-2 rounded-full ${accent.dot}`} />
                      <span>{k.label}</span>
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {k.key_name}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {k.has_value ? (
                    <span className="font-mono text-xs text-muted-foreground">
                      {k.masked_value}
                    </span>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-muted-foreground/30 text-muted-foreground"
                    >
                      {tt("settings.apiKeys.notConfigured", "Not configured")}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge entry={k} />
                  {ts && ts.status === "done" && ts.result && (
                    <div className="mt-1 flex items-center gap-1 text-[11px]">
                      {ts.result.valid ? (
                        <CheckCircle2 className="size-3 text-emerald-500" />
                      ) : (
                        <XCircle className="size-3 text-rose-500" />
                      )}
                      <span
                        className={
                          ts.result.valid ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                        }
                      >
                        {ts.result.message}
                      </span>
                    </div>
                  )}
                  {ts && ts.status === "error" && (
                    <div className="mt-1 text-[11px] text-rose-500">
                      {tt("settings.apiKeys.testError", "Test failed")}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <TypeBadge type={k.type} />
                </TableCell>
                <TableCell className="pr-4">
                  <div className="flex items-center justify-end gap-1">
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 px-2"
                            onClick={() => onTest(k.key_name)}
                            disabled={ts?.status === "running" || isSaving}
                          >
                            {ts?.status === "running" ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <ShieldCheck className="size-3.5" />
                            )}
                            <span className="hidden sm:inline">
                              {tt("settings.apiKeys.test", "Test")}
                            </span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {tt("settings.apiKeys.testTooltip", "Test this key against the upstream API")}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 px-2"
                            onClick={() => onEdit(k.key_name)}
                            disabled={isSaving}
                          >
                            <Pencil className="size-3.5" />
                            <span className="hidden sm:inline">
                              {tt("settings.apiKeys.edit", "Edit")}
                            </span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {tt("settings.apiKeys.editTooltip", "Edit value or toggle enabled")}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 px-2 text-rose-500 hover:bg-rose-500/10 hover:text-rose-500"
                            onClick={() => onDelete(k.key_name)}
                            disabled={isSaving || !k.has_value}
                          >
                            <Trash2 className="size-3.5" />
                            <span className="hidden sm:inline">
                              {tt("settings.apiKeys.delete", "Delete")}
                            </span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {tt("settings.apiKeys.deleteTooltip", "Remove the stored value")}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// --------------------------------------------------------------------------- //
//  Sub-component: News Source Table
// --------------------------------------------------------------------------- //

interface NewsSourceTableProps {
  sources: NewsSourceEntry[];
  onToggle: (entry: NewsSourceEntry, enabled: boolean) => void;
  onDelete: (name: string) => void;
}

function NewsSourceTable({ sources, onToggle, onDelete }: NewsSourceTableProps) {
  const tt = useTt();
  const [toggling, setToggling] = React.useState<string | null>(null);

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">
              {tt("settings.newsSources.col.name", "Name")}
            </TableHead>
            <TableHead>{tt("settings.newsSources.col.url", "URL / Channel")}</TableHead>
            <TableHead>{tt("settings.newsSources.col.type", "Type")}</TableHead>
            <TableHead>{tt("settings.newsSources.col.enabled", "Enabled")}</TableHead>
            <TableHead className="pr-4 text-right">
              {tt("settings.newsSources.col.actions", "Actions")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sources.map((s) => {
            const isTelegram = s.type === "telegram";
            return (
              <TableRow key={`${s.name}-${s.url}`} className="hover:bg-muted/30">
                <TableCell className="pl-4 font-medium">
                  <div className="flex items-center gap-2">
                    {isTelegram ? (
                      <Send className="size-3.5 text-amber-500" />
                    ) : (
                      <Rss className="size-3.5 text-emerald-500" />
                    )}
                    <span>{s.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <a
                    href={
                      isTelegram
                        ? `https://t.me/s/${encodeURIComponent(s.url)}`
                        : s.url
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block max-w-[280px] truncate text-xs text-muted-foreground hover:text-foreground hover:underline sm:max-w-md"
                    title={s.url}
                  >
                    {s.url}
                  </a>
                </TableCell>
                <TableCell>
                  {isTelegram ? (
                    <Badge className="border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400">
                      <Send className="size-3" />
                      Telegram
                    </Badge>
                  ) : (
                    <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                      <Rss className="size-3" />
                      RSS
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={s.enabled}
                    onCheckedChange={(checked) => {
                      // Disable ALL toggles during any toggle operation (prevents
                      // race when user toggles two rows quickly — Finding 10 fix)
                      setToggling(s.name);
                      onToggle(s, checked).finally(() => setToggling(null));
                    }}
                    disabled={toggling !== null}
                  />
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 px-2 text-rose-500 hover:bg-rose-500/10 hover:text-rose-500"
                    onClick={() => onDelete(s.name)}
                  >
                    <Trash2 className="size-3.5" />
                    <span className="hidden sm:inline">
                      {tt("settings.newsSources.delete", "Delete")}
                    </span>
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// --------------------------------------------------------------------------- //
//  Sub-component: API Key Dialog (Add / Edit)
// --------------------------------------------------------------------------- //

interface ApiKeyDialogProps {
  mode: "add" | "edit";
  existing?: ApiKeyEntry;
  supported: SupportedApiKey[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSave: (params: {
    key_name: string;
    key_value: string;
    enabled: boolean;
    key_type: string;
  }) => Promise<void>;
  saving: boolean;
}

function ApiKeyDialog({
  mode,
  existing,
  supported,
  open,
  onOpenChange,
  onSave,
  saving,
}: ApiKeyDialogProps) {
  const tt = useTt();

  const [keyName, setKeyName] = React.useState("");
  const [keyValue, setKeyValue] = React.useState("");
  const [showValue, setShowValue] = React.useState(false);
  const [keyType, setKeyType] = React.useState("keyed");
  const [enabled, setEnabled] = React.useState(true);
  const [testResult, setTestResult] = React.useState<TestApiKeyResponse | null>(null);
  const [testing, setTesting] = React.useState(false);

  // When the dialog opens (or target key changes), seed the form
  React.useEffect(() => {
    if (!open) return;
    if (mode === "edit" && existing) {
      setKeyName(existing.key_name);
      setKeyValue("");
      setKeyType(existing.type);
      setEnabled(existing.enabled);
    } else {
      // Add mode
      setKeyName("");
      setKeyValue("");
      setKeyType("keyed");
      setEnabled(true);
    }
    setTestResult(null);
    setShowValue(false);
  }, [open, mode, existing]);

  // Keys available for selection in "add" mode (all supported).
  // In "edit" mode the dropdown is disabled (key_name is fixed).
  const availableKeys = supported;

  const handleSave = async () => {
    if (!keyName) {
      return;
    }
    await onSave({
      key_name: keyName,
      key_value: keyValue, // empty = preserve existing
      enabled,
      key_type: keyType,
    });
  };

  // Direct test (so we can show inline result in the dialog)
  const handleTestInline = async () => {
    if (!keyName) return;
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch(
        `/api/scanner/settings/test-api-key/${encodeURIComponent(keyName)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(keyValue ? { key_value: keyValue } : {}),
        },
      );
      // Finding 4 fix: check r.ok before parsing (consistent with table-level Test)
      if (!r.ok) {
        setTestResult({
          valid: false,
          message: `HTTP ${r.status}`,
        });
        return;
      }
      const data: TestApiKeyResponse = await r.json();
      setTestResult(data);
    } catch (e) {
      setTestResult({
        valid: false,
        message: e instanceof Error ? e.message : "Test failed",
        status_code: null,
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="size-5 text-teal-500" />
            {mode === "add"
              ? tt("settings.apiKeys.dialog.addTitle", "Add API Key")
              : tt("settings.apiKeys.dialog.editTitle", "Edit API Key")}
          </DialogTitle>
          <DialogDescription>
            {mode === "edit" && existing
              ? tt(
                  "settings.apiKeys.dialog.editDesc",
                  "Update the value, type, or enabled flag. Leave the value field empty to preserve the existing key.",
                )
              : tt(
                  "settings.apiKeys.dialog.addDesc",
                  "Choose a key, paste its value, and save. The key is stored locally in settings.json (gitignored) and loaded into the scanner process on next restart.",
                )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Key name */}
          <div className="space-y-1.5">
            <Label htmlFor="api-key-name">
              {tt("settings.apiKeys.dialog.keyName", "Key name")}
            </Label>
            {mode === "edit" ? (
              <Input
                id="api-key-name"
                value={keyName}
                disabled
                className="font-mono text-xs"
              />
            ) : (
              <Select value={keyName} onValueChange={setKeyName}>
                <SelectTrigger id="api-key-name" className="w-full">
                  <SelectValue
                    placeholder={tt(
                      "settings.apiKeys.dialog.keyNamePlaceholder",
                      "Select a key to configure",
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableKeys.map((k) => (
                    <SelectItem key={k.key_name} value={k.key_name}>
                      <div className="flex flex-col gap-0.5">
                        <span>{k.label}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {k.key_name}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {(() => {
              const meta = supported.find((k) => k.key_name === keyName);
              return meta ? (
                <p className="text-xs text-muted-foreground">{meta.description}</p>
              ) : null;
            })()}
          </div>

          {/* Key value */}
          <div className="space-y-1.5">
            <Label htmlFor="api-key-value">
              {tt("settings.apiKeys.dialog.keyValue", "Key value")}
            </Label>
            <div className="relative">
              <Input
                id="api-key-value"
                type={showValue ? "text" : "password"}
                value={keyValue}
                onChange={(e) => setKeyValue(e.target.value)}
                placeholder={
                  mode === "edit" && existing?.has_value
                    ? tt(
                        "settings.apiKeys.dialog.valuePlaceholder",
                        "Leave empty to keep current value ({masked})",
                        { masked: existing.masked_value },
                      )
                    : tt("settings.apiKeys.dialog.valuePlaceholderAdd", "Paste key here")
                }
                className="pr-10 font-mono text-xs"
                autoComplete="off"
                spellCheck={false}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowValue((v) => !v)}
                aria-label={showValue ? "Hide value" : "Show value"}
                tabIndex={-1}
              >
                {showValue ? (
                  <EyeOff className="size-4 text-muted-foreground" />
                ) : (
                  <Eye className="size-4 text-muted-foreground" />
                )}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {tt(
                "settings.apiKeys.dialog.valueHint",
                "Stored locally in settings.json (gitignored). Never sent to any third party other than the upstream API.",
              )}
            </p>
          </div>

          {/* Key type */}
          <div className="space-y-1.5">
            <Label htmlFor="api-key-type">
              {tt("settings.apiKeys.dialog.keyType", "Key type")}
            </Label>
            <Select value={keyType} onValueChange={setKeyType}>
              <SelectTrigger id="api-key-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="free">
                  {tt("settings.apiKeys.type.free", "Free (no key required)")}
                </SelectItem>
                <SelectItem value="keyed">
                  {tt("settings.apiKeys.type.keyed", "API key required")}
                </SelectItem>
                <SelectItem value="manual">
                  {tt("settings.apiKeys.type.manual", "Manual / custom")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Enabled */}
          <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-3 py-2">
            <div className="space-y-0.5">
              <Label htmlFor="api-key-enabled" className="text-sm font-medium">
                {tt("settings.apiKeys.dialog.enabled", "Enabled")}
              </Label>
              <p className="text-[11px] text-muted-foreground">
                {tt(
                  "settings.apiKeys.dialog.enabledHint",
                  "Disabled keys are kept in storage but not loaded into the scanner process.",
                )}
              </p>
            </div>
            <Switch
              id="api-key-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>

          {/* Inline test result */}
          {testResult && (
            <Alert
              className={
                testResult.valid
                  ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                  : "border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-400"
              }
            >
              {testResult.valid ? (
                <CheckCircle2 className="size-4" />
              ) : (
                <XCircle className="size-4" />
              )}
              <AlertTitle>
                {testResult.valid
                  ? tt("settings.apiKeys.dialog.testValid", "Key is valid")
                  : tt("settings.apiKeys.dialog.testInvalid", "Key test failed")}
              </AlertTitle>
              <AlertDescription>{testResult.message}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTestInline}
            disabled={!keyName || testing}
            className="gap-2"
          >
            {testing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="size-3.5" />
            )}
            {tt("settings.apiKeys.dialog.testButton", "Test Key")}
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {tt("settings.apiKeys.dialog.cancel", "Cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={!keyName || saving}
              className="gap-2"
            >
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="size-3.5" />
              )}
              {tt("settings.apiKeys.dialog.save", "Save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --------------------------------------------------------------------------- //
//  Sub-component: News Source Dialog
// --------------------------------------------------------------------------- //

interface NewsSourceDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSave: (params: {
    name: string;
    url: string;
    source_type: "rss" | "telegram";
    enabled: boolean;
  }) => Promise<void>;
}

function NewsSourceDialog({ open, onOpenChange, onSave }: NewsSourceDialogProps) {
  const tt = useTt();
  const [name, setName] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [sourceType, setSourceType] = React.useState<"rss" | "telegram">("rss");
  const [enabled, setEnabled] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName("");
    setUrl("");
    setSourceType("rss");
    setEnabled(true);
  }, [open]);

  const handleSave = async () => {
    if (!name.trim() || !url.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        url: url.trim(),
        source_type: sourceType,
        enabled,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rss className="size-5 text-teal-500" />
            {tt("settings.newsSources.dialog.addTitle", "Add News Source")}
          </DialogTitle>
          <DialogDescription>
            {tt(
              "settings.newsSources.dialog.addDesc",
              "Add an RSS feed or Telegram public channel. For Telegram, use the channel username (without @ and without t.me/).",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="news-name">
              {tt("settings.newsSources.dialog.name", "Name")}
            </Label>
            <Input
              id="news-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. CoinDesk"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="news-url">
              {sourceType === "telegram"
                ? tt("settings.newsSources.dialog.channel", "Channel username")
                : tt("settings.newsSources.dialog.url", "RSS URL")}
            </Label>
            <Input
              id="news-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={
                sourceType === "telegram"
                  ? "Mastersharkcrypto"
                  : "https://example.com/feed.xml"
              }
              className={sourceType === "rss" ? "font-mono text-xs" : ""}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="news-type">
              {tt("settings.newsSources.dialog.type", "Type")}
            </Label>
            <Select
              value={sourceType}
              onValueChange={(v) => setSourceType(v as "rss" | "telegram")}
            >
              <SelectTrigger id="news-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rss">
                  <div className="flex items-center gap-2">
                    <Rss className="size-3.5 text-emerald-500" />
                    {tt("settings.newsSources.dialog.typeRss", "RSS Feed")}
                  </div>
                </SelectItem>
                <SelectItem value="telegram">
                  <div className="flex items-center gap-2">
                    <Send className="size-3.5 text-amber-500" />
                    {tt(
                      "settings.newsSources.dialog.typeTelegram",
                      "Telegram Channel",
                    )}
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {sourceType === "telegram"
                ? tt(
                    "settings.newsSources.dialog.telegramHint",
                    "Public channel preview via t.me/s/<channel> — no bot token needed.",
                  )
                : tt(
                    "settings.newsSources.dialog.rssHint",
                    "Standard RSS / Atom feed URL.",
                  )}
            </p>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-3 py-2">
            <Label htmlFor="news-enabled" className="text-sm font-medium">
              {tt("settings.newsSources.dialog.enabled", "Enabled")}
            </Label>
            <Switch
              id="news-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {tt("settings.newsSources.dialog.cancel", "Cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={!name.trim() || !url.trim() || saving}
            className="gap-2"
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
            {tt("settings.newsSources.dialog.save", "Add Source")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --------------------------------------------------------------------------- //
//  Small presentational helpers
// --------------------------------------------------------------------------- //

function StatusBadge({ entry }: { entry: ApiKeyEntry }) {
  const tt = useTt();
  if (entry.active) {
    return (
      <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
        <span className="mr-1 inline-block size-1.5 rounded-full bg-emerald-500" />
        {tt("settings.apiKeys.status.active", "Active")}
      </Badge>
    );
  }
  if (entry.has_value && !entry.enabled) {
    return (
      <Badge
        variant="outline"
        className="border-amber-500/30 text-amber-600 dark:text-amber-400"
      >
        {tt("settings.apiKeys.status.disabled", "Disabled")}
      </Badge>
    );
  }
  if (entry.has_value && entry.enabled) {
    // Shouldn't happen (active = has_value && enabled), but defensive:
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {tt("settings.apiKeys.status.inactive", "Inactive")}
      </Badge>
    );
  }
  // !has_value, !enabled OR !has_value, enabled → Not configured
  return (
    <Badge variant="outline" className="text-muted-foreground">
      {tt("settings.apiKeys.status.notConfigured", "Not configured")}
    </Badge>
  );
}

function TypeBadge({ type }: { type: string }) {
  const tt = useTt();
  if (type === "free") {
    return (
      <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
        {tt("settings.apiKeys.typeBadge.free", "Free")}
      </Badge>
    );
  }
  if (type === "manual") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {tt("settings.apiKeys.typeBadge.manual", "Manual")}
      </Badge>
    );
  }
  // keyed
  return (
    <Badge variant="outline" className="border-violet-500/30 text-violet-600 dark:text-violet-400">
      {tt("settings.apiKeys.typeBadge.keyed", "Keyed")}
    </Badge>
  );
}
