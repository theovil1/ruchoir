"use client";

import { type FormEvent, useState } from "react";

/**
 * Wiring smoke test (development only).
 *
 * Drives the real end-to-end path the SPA will use once its data seam is wired to the API:
 * login -> GET /me/spaces -> GET a space's channels -> GET a channel's messages. It renders each
 * step's HTTP status and raw JSON so contract mismatches between the mocked seam
 * (`lib/data/types.ts`) and the real DTOs surface concretely, ahead of the full wiring lot. It is
 * deliberately isolated: it does not touch the app shell's state, and can be deleted once the seam
 * is wired for real.
 *
 * All fetches are same-origin and relative: the API serves this bundle, sends the session cookie
 * automatically (HttpOnly), and the CSP (`connect-src 'self'`) forbids any cross-origin call.
 */

type StepState =
  | { state: "idle" }
  | { state: "running" }
  | { state: "done"; status: number; ok: boolean; body: unknown }
  | { state: "error"; message: string };

async function call(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<{ status: number; ok: boolean; body: unknown }> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    // Non-JSON body (e.g. an HTML error page): keep the raw text.
  }
  return { status: res.status, ok: res.ok, body: parsed };
}

function firstId(body: unknown): string | undefined {
  if (Array.isArray(body) && body.length > 0 && body[0] && typeof body[0] === "object") {
    const id = (body[0] as Record<string, unknown>).id;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

function StepCard({ label, step }: { label: string; step: StepState }) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{label}</h2>
        {step.state === "done" && (
          <span
            className={`font-mono text-xs ${step.ok ? "text-emerald-700" : "text-terracotta-700"}`}
          >
            HTTP {step.status}
          </span>
        )}
        {step.state === "running" && <span className="font-mono text-xs">…</span>}
      </div>
      {step.state === "error" && (
        <p className="mt-2 font-mono text-xs text-terracotta-700">{step.message}</p>
      )}
      {step.state === "done" && (
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-neutral-700">
          {JSON.stringify(step.body, null, 2)}
        </pre>
      )}
    </section>
  );
}

export default function Wiring() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [login, setLogin] = useState<StepState>({ state: "idle" });
  const [spaces, setSpaces] = useState<StepState>({ state: "idle" });
  const [channels, setChannels] = useState<StepState>({ state: "idle" });
  const [messages, setMessages] = useState<StepState>({ state: "idle" });
  const [note, setNote] = useState<string>("");

  /** Run the whole chain: authenticate, then walk spaces -> channels -> messages. */
  async function run(e: FormEvent) {
    e.preventDefault();
    setNote("");
    setSpaces({ state: "idle" });
    setChannels({ state: "idle" });
    setMessages({ state: "idle" });

    setLogin({ state: "running" });
    let auth: Awaited<ReturnType<typeof call>>;
    try {
      auth = await call("POST", "/api/v1/auth/login", { email, password });
    } catch (err) {
      setLogin({ state: "error", message: err instanceof Error ? err.message : "network error" });
      return;
    }
    setLogin({ state: "done", ...auth });

    const authBody = auth.body as Record<string, unknown> | null;
    if (authBody && authBody.mfa_required) {
      setNote("Login returned an MFA challenge: this account needs a second factor. Use a seed account without MFA to walk the rest of the chain.");
      return;
    }
    if (!auth.ok) {
      setNote("Login failed: fix the credentials and retry.");
      return;
    }

    setSpaces({ state: "running" });
    const sp = await call("GET", "/api/v1/me/spaces").catch((err) => {
      setSpaces({ state: "error", message: err instanceof Error ? err.message : "network error" });
      return undefined;
    });
    if (!sp) return;
    setSpaces({ state: "done", ...sp });
    const spaceId = firstId(sp.body);
    if (!spaceId) {
      setNote("No space returned for this account, so there is nothing to list channels for.");
      return;
    }

    setChannels({ state: "running" });
    const ch = await call("GET", `/api/v1/spaces/${spaceId}/channels`).catch((err) => {
      setChannels({ state: "error", message: err instanceof Error ? err.message : "network error" });
      return undefined;
    });
    if (!ch) return;
    setChannels({ state: "done", ...ch });
    const channelId = firstId(ch.body);
    if (!channelId) {
      setNote("No channel visible in the first space, so there is no conversation to read messages from.");
      return;
    }

    setMessages({ state: "running" });
    const ms = await call("GET", `/api/v1/conversations/${channelId}/messages`).catch((err) => {
      setMessages({ state: "error", message: err instanceof Error ? err.message : "network error" });
      return undefined;
    });
    if (!ms) return;
    setMessages({ state: "done", ...ms });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
      <header className="flex items-center gap-3">
        <span className="inline-block h-3 w-3 rounded-full bg-terracotta-500" />
        <h1 className="text-xl font-semibold tracking-tight">Wiring smoke test</h1>
      </header>
      <p className="text-sm text-neutral-600">
        Development probe. Drives the real API path the SPA will use, without touching the app shell.
        Each step shows its HTTP status and raw JSON so seam/DTO mismatches surface here first.
      </p>

      <form onSubmit={run} className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            className="rounded border border-neutral-300 px-3 py-2 font-mono text-sm"
            placeholder="seed account email"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            className="rounded border border-neutral-300 px-3 py-2 font-mono text-sm"
            placeholder="seed account password"
          />
        </label>
        <button
          type="submit"
          className="self-start rounded bg-terracotta-500 px-4 py-2 text-sm font-medium text-white"
        >
          Run the chain
        </button>
      </form>

      {note && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {note}
        </p>
      )}

      <StepCard label="POST /api/v1/auth/login" step={login} />
      <StepCard label="GET /api/v1/me/spaces" step={spaces} />
      <StepCard label="GET /api/v1/spaces/{spaceId}/channels" step={channels} />
      <StepCard label="GET /api/v1/conversations/{channelId}/messages" step={messages} />
    </main>
  );
}
