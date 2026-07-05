# Phase 4 — Frontend Restructure & Design System

> Depends on: Phase 2 (login/layout interact). Parallelizable with Phase 3. Blocks: Phase 5.
> Goal: feature-based architecture, shared design system (shadcn/ui), responsive app shell. This phase moves and rebuilds EXISTING screens; the new chat UI is Phase 5.

## Current problems

- Flat structure: 19 files across `src/app/*` + `src/components/*` with no feature grouping; components mix data fetching and presentation (`src/components/conversation-view.tsx` does fetch + state + render).
- No shared primitives: buttons/inputs/badges are re-styled inline per file with raw Tailwind strings (compare `conversation-view.tsx:70-95` vs `business-form.tsx`).
- Desktop-only assumptions; dark-only hardcoded slate palette in `src/app/globals.css` + `layout.tsx`.
- No client data layer: mutations use raw `fetch` + `router.refresh()`.

## Target structure

```
src/
  app/                      # routes only: thin pages that compose features
    (app)/                  # authenticated group: layout with app shell
      page.tsx              # dashboard
      businesses/…  appointments/…  conversations/…  settings/credentials/…
    login/  auth/  api/
  components/ui/            # shadcn/ui primitives (button, input, dialog, badge, table,
                            # dropdown-menu, sheet, skeleton, sonner toast…)
  features/
    dashboard/   businesses/   appointments/   conversations/   credentials/
      components/           # presentational (props in, JSX out)
      containers/           # client components: hooks + data wiring
      api.ts                # typed client fetchers for /api/* of this feature
      types.ts
  lib/                      # server-only libs (db, ai, whatsapp, crypto, auth…) — unchanged
  hooks/                    # cross-feature hooks (use-media-query, …)
```

Rules:
- Pages in `app/` do server-side data loading and render feature containers. No business logic in `app/`.
- `features/*/components` are presentational (container/presentational split). Containers own state/queries.
- Imports flow: `app → features → components/ui + lib`. Features never import from other features; shared things graduate to `components/ui` or `hooks/`.

## New dependencies

`shadcn/ui` (CLI copies components in; brings `class-variance-authority`, `clsx`, `tailwind-merge`, Radix packages), `lucide-react`, `@tanstack/react-query`, `sonner` (toasts). Keep Tailwind 3 (do NOT upgrade to v4 in this phase).

## Tasks

### 4.1 Design system bootstrap

- Init shadcn/ui (style: default, CSS variables ON). Define tokens in `globals.css`: light + dark themes via `class` strategy; primary = WhatsApp-adjacent emerald; keep current dark slate as the dark theme base.
- Add `ThemeProvider` (class toggling + `localStorage`, respect `prefers-color-scheme`) and a theme toggle. No `next-themes` unless the agent finds flicker issues (then it's approved).
- Add `QueryClientProvider` + `sonner` `<Toaster>` in the authenticated layout.

### 4.2 Responsive app shell — `src/app/(app)/layout.tsx`

- Desktop (`md+`): fixed left sidebar (nav: Panel, Conversaciones, Negocios, Citas, Configuración) + content area. Rebuild `src/components/sidebar.tsx` → `features/dashboard/components/app-sidebar.tsx` with lucide icons, active-route highlight, user block (avatar/email/logout) at bottom.
- Mobile (`<md`): top bar with hamburger → shadcn `Sheet` drawer with the same nav. Content full-width.
- All tables become responsive: horizontal scroll wrapper on mobile OR card-list variant (agent's choice per screen, stated in PR).

### 4.3 Migrate screens feature-by-feature

Order (one PR each, delete the old file in the same PR):
1. **Dashboard** (`src/app/page.tsx`, `stats-card.tsx`) → `features/dashboard`. Stats as shadcn cards.
2. **Businesses** (list/new/edit + `business-form.tsx`) → `features/businesses`. Form with shadcn inputs + zod-free native validation (no react-hook-form unless form complexity demands it).
3. **Appointments** (list/new + `appointment-table.tsx`, `appointment-row-actions.tsx`) → `features/appointments`. Mutations via TanStack Query + toast feedback.
4. **Conversations list + detail** → `features/conversations`. Detail keeps current functionality (status buttons, manual send) with new primitives — realtime and WhatsApp layout arrive in Phase 5, so keep this migration mechanical.

### 4.4 Client data layer conventions

- Each feature's `api.ts`: typed fetch wrappers throwing on `!res.ok` with the server's error message.
- Mutations: TanStack `useMutation` + `queryClient.invalidateQueries` + `sonner` toasts (success/error, Spanish copy). Replace every raw `fetch` + `router.refresh()` in client components.
- Server-loaded pages keep RSC fetching; TanStack Query is for client interactions only (no hydration gymnastics in this phase).

## PR slicing

1. **PR A**: 4.1 + 4.2 (design system + shell; old pages render inside new shell untouched).
2. **PR B**: 4.3.1 + 4.3.2 (dashboard + businesses).
3. **PR C**: 4.3.3 + 4.3.4 + 4.4 sweep (appointments + conversations + remove dead components).

## Acceptance criteria / verification

- [ ] Every screen usable at 360px and 1440px widths; no horizontal body scroll.
- [ ] Light/dark toggle persists across reloads; no theme flash on load.
- [ ] `src/components/*` legacy files deleted; only `components/ui` + features remain.
- [ ] All mutations show toast feedback; no raw `router.refresh()`-after-fetch pattern left in feature code.
- [ ] Feature-to-feature imports: zero (verify with `rg "features/(\w+)" src/features` review).
- [ ] CI green; screenshot pairs (mobile/desktop) attached to each PR description.
