import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";

type ProviderPayload = {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  models: string[];
  updatedAt: string;
  lastModelSyncAt?: string;
  hasApiKey: boolean;
  apiKeyMasked: string;
};

type AdminSessionPayload = {
  ok?: boolean;
  error?: string;
  providers?: ProviderPayload[];
  activeProviderId?: string | null;
  activeModelByProvider?: Record<string, string>;
};

type UserSessionPayload = {
  authenticated: boolean;
};

async function parseJsonResponse<T>(response: Response, endpoint: string): Promise<T> {
  const raw = await response.text();
  const contentType = response.headers.get("content-type")?.toLowerCase() || "";

  if (!contentType.includes("application/json")) {
    throw new Error(`API ${endpoint} returned non-JSON (${response.status}).`);
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`API ${endpoint} returned invalid JSON (${response.status}).`);
  }
}

const Nangua = () => {
  const location = useLocation();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [providers, setProviders] = useState<ProviderPayload[]>([]);
  const [activeProviderId, setActiveProviderId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modelDraftByProvider, setModelDraftByProvider] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(true);

  const loadProviders = async () => {
    const response = await fetch("/api/nangua/session");
    const data = await parseJsonResponse<AdminSessionPayload>(response, "/api/nangua/session");
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Unable to load provider settings.");
    }

    setProviders(data.providers || []);
    setActiveProviderId(data.activeProviderId || "");
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const response = await fetch("/api/session");
        const session = await parseJsonResponse<UserSessionPayload>(response, "/api/session");
        if (!session.authenticated) {
          setAuthenticated(false);
          return;
        }

        setAuthenticated(true);
        await loadProviders();
      } catch (bootstrapError) {
        setError(
          bootstrapError instanceof Error
            ? bootstrapError.message
            : "Unable to load admin session.",
        );
      } finally {
        setCheckingAuth(false);
      }
    };

    void bootstrap();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setBaseUrl("");
    setApiKey("");
    setEnabled(true);
  };

  const applyAdminPayload = (data: AdminSessionPayload) => {
    setProviders(data.providers || []);
    setActiveProviderId(data.activeProviderId || "");
  };

  const submitProvider = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/nangua/providers/upsert", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...(editingId ? { id: editingId } : {}),
          name,
          baseUrl,
          apiKey,
          enabled,
          setActive: !activeProviderId,
        }),
      });

      const data = await parseJsonResponse<AdminSessionPayload>(
        response,
        "/api/nangua/providers/upsert",
      );
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Unable to save provider.");
      }

      applyAdminPayload(data);
      resetForm();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save provider.");
    } finally {
      setBusy(false);
    }
  };

  const refreshModels = async (providerId: string) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/nangua/providers/refresh-models", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: providerId }),
      });
      const data = await parseJsonResponse<AdminSessionPayload>(
        response,
        "/api/nangua/providers/refresh-models",
      );
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Unable to refresh models.");
      }

      applyAdminPayload(data);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Unable to refresh models.");
    } finally {
      setBusy(false);
    }
  };

  const selectProvider = async (providerId: string) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/nangua/providers/select", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ providerId }),
      });
      const data = await parseJsonResponse<AdminSessionPayload>(
        response,
        "/api/nangua/providers/select",
      );
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Unable to select provider.");
      }

      applyAdminPayload(data);
    } catch (selectError) {
      setError(selectError instanceof Error ? selectError.message : "Unable to select provider.");
    } finally {
      setBusy(false);
    }
  };

  const deleteProvider = async (providerId: string) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/nangua/providers/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: providerId }),
      });
      const data = await parseJsonResponse<AdminSessionPayload>(
        response,
        "/api/nangua/providers/delete",
      );
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Unable to delete provider.");
      }

      applyAdminPayload(data);
      if (editingId === providerId) {
        resetForm();
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete provider.");
    } finally {
      setBusy(false);
    }
  };

  const upsertModel = async (providerId: string) => {
    const model = modelDraftByProvider[providerId]?.trim();
    if (!model) {
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/nangua/providers/models/upsert", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ providerId, model }),
      });
      const data = await parseJsonResponse<AdminSessionPayload>(
        response,
        "/api/nangua/providers/models/upsert",
      );
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Unable to add model.");
      }

      applyAdminPayload(data);
      setModelDraftByProvider((current) => ({ ...current, [providerId]: "" }));
    } catch (upsertError) {
      setError(upsertError instanceof Error ? upsertError.message : "Unable to add model.");
    } finally {
      setBusy(false);
    }
  };

  const deleteModel = async (providerId: string, model: string) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/nangua/providers/models/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ providerId, model }),
      });
      const data = await parseJsonResponse<AdminSessionPayload>(
        response,
        "/api/nangua/providers/models/delete",
      );
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Unable to delete model.");
      }

      applyAdminPayload(data);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete model.");
    } finally {
      setBusy(false);
    }
  };

  if (!checkingAuth && !authenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Provider Management</h1>
            <p className="text-sm text-muted-foreground">
              Route: <code>/nangua</code> (login protected)
            </p>
          </div>
          <Link to="/">
            <Button variant="outline">Back to Chat</Button>
          </Link>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[360px,1fr]">
          <form
            onSubmit={submitProvider}
            className="rounded-2xl border border-border bg-card p-4 space-y-3"
          >
            <h2 className="text-sm font-semibold">
              {editingId ? "Edit Provider" : "Add Provider"}
            </h2>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Provider name"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none"
            />
            <input
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://api.example.com/v1"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none"
            />
            <input
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={editingId ? "Leave empty to keep existing key" : "API key"}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
              />
              Enabled
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy} className="flex-1">
                {editingId ? "Update" : "Create"}
              </Button>
              {editingId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetForm}
                  disabled={busy}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>

          <div className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Providers</h2>
            <div className="space-y-3">
              {providers.length === 0 && (
                <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                  No providers yet. Add one on the left.
                </div>
              )}
              {providers.map((provider) => (
                <div
                  key={provider.id}
                  className={`rounded-xl border p-3 ${
                    activeProviderId === provider.id
                      ? "border-primary/60 bg-primary/5"
                      : "border-border"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{provider.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{provider.baseUrl}</p>
                      <p className="text-xs text-muted-foreground">
                        Key: {provider.apiKeyMasked || "Not set"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingId(provider.id);
                          setName(provider.name);
                          setBaseUrl(provider.baseUrl);
                          setApiKey("");
                          setEnabled(provider.enabled);
                        }}
                        disabled={busy}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void deleteProvider(provider.id)}
                        disabled={busy}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void refreshModels(provider.id)}
                      disabled={busy}
                    >
                      Refresh Models
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void selectProvider(provider.id)}
                      disabled={busy || !provider.enabled}
                    >
                      {activeProviderId === provider.id ? "Active" : "Set Active"}
                    </Button>
                  </div>
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-muted-foreground">Models</p>
                    <div className="flex flex-wrap gap-2">
                      {provider.models.length === 0 && (
                        <span className="text-xs text-muted-foreground">No models</span>
                      )}
                      {provider.models.map((model) => (
                        <span
                          key={`${provider.id}:${model}`}
                          className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs"
                        >
                          {model}
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => void deleteModel(provider.id, model)}
                            disabled={busy}
                            aria-label={`Delete model ${model}`}
                          >
                            x
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={modelDraftByProvider[provider.id] || ""}
                        onChange={(event) =>
                          setModelDraftByProvider((current) => ({
                            ...current,
                            [provider.id]: event.target.value,
                          }))
                        }
                        placeholder="Add model id"
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void upsertModel(provider.id)}
                        disabled={busy}
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Nangua;
