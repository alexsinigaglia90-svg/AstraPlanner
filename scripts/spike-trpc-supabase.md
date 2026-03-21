# Spike: tRPC + Supabase Edge Functions Compatibility

## Date: 2026-03-21

## Question
Can tRPC routers run inside Supabase Edge Functions (Deno runtime)?

---

## Findings

### 1. Does tRPC have official Deno support?

**Yes — via the fetch/edge adapter.**

tRPC ships a `@trpc/server/adapters/fetch` adapter that targets any WinterCG-compliant edge runtime (Cloudflare Workers, Vercel Edge, Deno Deploy). The official docs include a working Deno Deploy example using `Deno.serve()`:

```typescript
// Deno Deploy
import { fetchRequestHandler } from 'npm:@trpc/server/adapters/fetch';
import { appRouter } from './router.ts';

Deno.serve((request) =>
  fetchRequestHandler({ endpoint: '/trpc', req: request, router: appRouter, createContext }),
);
```

The adapter relies only on standard Web APIs (`Request`, `Response`, `Headers`, `URL`) — all supported by Deno 2.x.

There is also a Deno Oak integration pattern documented. No Deno-specific limitations are called out in the tRPC documentation.

**Source:** https://trpc.io/docs/server/adapters/fetch

---

### 2. Are there known issues running tRPC in Supabase Edge Functions?

**Technically works, but with friction.**

A GitHub discussion (supabase/discussions#7685) explores this exact combination. Key findings:

- The community consensus is it is "trivially doable" given the shared Deno Deploy heritage.
- The implementation wraps a single Edge Function in a tRPC router using `fetchRequestHandler` — same pattern as Deno Deploy.
- Type-safe context creation with `initTRPC.context<Context>()` works correctly.
- **Known issue:** `supabase.auth.getSession()` must not be used in server code (does not revalidate Auth tokens); `supabase.auth.getUser()` should be used instead.
- **Friction point:** At least one developer migrated away from tRPC to Hono specifically because Edge Functions lack native `multipart/form-data` support in tRPC, and Hono handles it better.
- No npm install step in the Edge Function environment — imports must use `npm:@trpc/server` prefix (Deno-style), which adds a small integration overhead vs a standard Node.js setup.

**Source:** https://github.com/orgs/supabase/discussions/7685

---

### 3. What is the recommended approach for tRPC with Next.js 14+ App Router?

**Use the fetch adapter inside a Next.js Route Handler, with `@trpc/tanstack-react-query` on the client.**

The official tRPC recommendation for new projects:

- API handler lives at `/app/api/trpc/[trpc]/route.ts` (Next.js App Router Route Handler)
- Use `@trpc/tanstack-react-query` (replaces the older `@trpc/react-query`)
- Leverage React Server Components for server-side prefetching with `HydrateClient`
- Enable streaming via Suspense boundaries (`useSuspenseQuery`)
- Optional but recommended: `superjson` for `Date` / `Map` / `Set` serialisation

This is the well-documented, officially supported, and widely adopted path. Multiple production guides exist for this exact setup as of 2025.

**Sources:**
- https://trpc.io/docs/client/nextjs
- https://trpc.io/docs/server/adapters/nextjs

---

### 4. Supabase Edge Function limitations relevant to tRPC

| Limit | Value |
|---|---|
| Memory per invocation | 256 MB |
| Max CPU time | 2 seconds (excludes async I/O) |
| Wall-clock timeout (Free) | 150 seconds |
| Wall-clock timeout (Paid) | 400 seconds |
| Request idle timeout | 150 seconds (504 if exceeded) |
| Max function bundle size | 20 MB (post-bundling) |
| Max log message | 10,000 characters |

**Key constraints for tRPC:**

- **2-second CPU time limit** is the most significant constraint. tRPC itself adds minimal overhead (it is a thin wrapper around function calls), but any CPU-heavy procedure logic risks hitting this limit.
- **20 MB bundle size** means the full tRPC dependency tree (server + zod + any adapters) must fit within this cap. The tRPC server package is small (~100 KB), so this is not a practical concern unless the router imports heavy libraries.
- **No payload size limit documented** — no explicit cap on request or response body size beyond memory constraints.
- **No Web Worker or Node VM APIs** — not relevant to tRPC's fetch adapter.
- **Deno 2.x** is now the production runtime (fully rolled out August 2025). Breaking changes from 1.x were handled by Supabase transparently; no developer-facing issues were reported.

**Sources:**
- https://supabase.com/docs/guides/functions/limits
- https://github.com/orgs/supabase/discussions/29552

---

## Decision

**Option 2: tRPC routers on Vercel API Routes (Next.js Route Handlers)**

While tRPC technically runs on Deno and therefore on Supabase Edge Functions, the recommended architecture for AstraPlanner is Option 2 for the following reasons:

1. **Official support and documentation quality.** The Next.js + App Router path is the primary tRPC target. The Deno/Edge path is documented but community-maintained in practice.

2. **Operational simplicity.** Running tRPC inside Next.js Route Handlers eliminates a separate deployment surface. There is no need to manage a fleet of Edge Functions, each requiring its own tRPC sub-router and Deno import syntax.

3. **Ecosystem friction with Supabase Edge Functions.** Edge Functions require Deno-style `npm:` prefixed imports, no native `multipart/form-data` in tRPC, and the 2-second CPU cap introduces risk for any procedure that does non-trivial processing before returning a response.

4. **The Hono migration signal.** At least one developer in the community discussion explicitly abandoned tRPC on Edge Functions for Hono. This is a signal that the integration has real-world rough edges beyond simple CRUD.

5. **Type safety goals are equally met.** Option 2 delivers identical end-to-end type safety — the tRPC router is still fully typed, Zod-validated, and shared between client and server. Nothing about the type-safety story changes.

Supabase Edge Functions remain useful in the architecture for Supabase-specific concerns (e.g., database webhooks, Auth hooks, scheduled jobs via pg_cron), but they are not the right host for the primary tRPC API layer.

---

## Implications

- **API layer:** tRPC router lives in `/app/api/trpc/[trpc]/route.ts` (Next.js App Router Route Handler, Node.js runtime).
- **Client:** `@trpc/tanstack-react-query` with `HydrateClient` for SSR prefetching in Server Components.
- **Supabase client in context:** The tRPC `createContext` function creates a Supabase server client per request using `createServerClient` from `@supabase/ssr`, forwarding cookies for RLS.
- **Supabase Edge Functions:** Reserved for webhook handlers, Auth hooks, and other Supabase-native integrations — not for the primary API.
- **Serialisation:** Add `superjson` transformer to handle `Date` objects between client and server.
- **No Deno-specific code paths needed** in the main application — the entire API surface runs on Node.js inside Next.js, simplifying the toolchain and CI.
