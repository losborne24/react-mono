# Design System & Architecture Conventions

## Project Overview

This is an Nx monorepo.

The repository contains multiple applications and shared libraries. Code should be structured according to Nx boundaries and designed for reuse.

Primary goals:

1. Translate Figma Make designs into production-quality applications.
2. Maximise reuse through shared libraries.
3. Preserve existing architecture and conventions.
4. Keep dependency boundaries clean.
5. Prefer incremental changes over large rewrites.

---

# Nx Workspace Rules

## Repository Structure

Follow Nx conventions:

```
apps/
  <application>/

libs/
  ui/
  feature/
  data-access/
  util/
  types/
```

Use libraries instead of putting reusable code inside applications.

Examples:

Good:

```
libs/ui/button
libs/feature/dashboard
libs/data-access/users
apps/web
```

Avoid:

```
apps/web/components/Button.tsx
apps/web/utils/api.ts
```

if the code is reusable.

---

# Dependency Rules

Respect Nx module boundaries.

Allowed dependency direction:

```
apps
 ↓
feature
 ↓
data-access
 ↓
util
```

Shared UI should remain independent:

```
ui
 ↓
util
```

Do not:

* import between unrelated features
* import application code into libraries
* bypass Nx boundaries
* create circular dependencies

---

# Before Creating Code

Before adding a new component/library:

1. Search the workspace.
2. Check whether similar functionality exists.
3. Extend existing patterns where possible.

Use:

```bash
nx graph
```

to understand dependencies when needed.

---

# Figma Implementation Workflow

When converting Figma Make designs:

Follow this order:

```
Figma design
    ↓
Identify reusable patterns
    ↓
Create/update UI library components
    ↓
Create feature libraries
    ↓
Compose application pages
```

Do not build pages as isolated implementations.

---

# Component Architecture

Preferred structure:

```
libs/
├── ui/
│   ├── button/
│   ├── card/
│   └── form/
│
├── feature/
│   └── dashboard/
│
├── data-access/
│   └── users/
│
└── util/
```

Rules:

* UI libraries contain presentational components only.
* Feature libraries contain business logic and workflows.
* Data-access libraries contain API/state logic.
* Utility libraries contain shared helpers.

---

# Figma Design Rules

Figma is the source of truth for:

* layout
* spacing
* typography
* colours
* component variants
* interaction intent

Do not invent design decisions.

Before implementing:

Identify:

* existing components
* design tokens
* assets
* responsive behaviour
* repeated patterns

Map Figma components to Nx libraries.

Example:

Figma:

```
Button
Modal
Input
Card
```

↓

Nx:

```
libs/ui/button
libs/ui/modal
libs/ui/input
libs/ui/card
```

---

# Styling Rules

Use the existing styling approach.

Priority:

1. Existing design tokens
2. Existing UI components
3. Existing utility classes
4. New styles only when required

Avoid:

* inline styles
* duplicated CSS
* hardcoded values
* inconsistent spacing

---

# React Rules

Use:

* TypeScript
* functional components
* strict typing
* reusable hooks
* composition patterns

Avoid:

* giant components
* excessive prop flags
* duplicated logic

Prefer:

```
DashboardPage
  ├── DashboardHeader
  ├── StatsGrid
  ├── ActivityList
  └── EmptyState
```

over:

```
DashboardPage.tsx (1000+ lines)
```

## Render Readability

Keep the JSX returned from a component flat and scannable.

* No nested ternaries in JSX. Lift branching into a variable, helper, or subcomponent.
* No multi-line function bodies inside a `return` (e.g. `.map()` with logic + nested markup). Extract a named subcomponent and pass props.

Prefer:

```tsx
{steps.map((step, i) => (
  <StepNode key={step.label + i} label={step.label} isDone={...} />
))}
```

over:

```tsx
{steps.map((step, i) => {
  const isDone = ...;
  return <div>{isDone ? <A /> : isCurrent ? <B /> : <C />}</div>;
})}
```

## Memoization

A memoized value is **load-bearing** when its stable identity is actually consumed by:

* a `React.memo` child (so it can skip re-rendering), or
* a dependency array of another `useEffect` / `useMemo` / `useCallback`.

Always memoize load-bearing callbacks — an unstable identity there is a bug, not just noise (e.g. it re-fires an effect or tears down a listener).

Beyond that, wrapping handlers in `useCallback` is **acceptable, not discouraged**. When a component defines a family of related handlers (e.g. pointer/zoom handlers where some are load-bearing and some feed plain DOM props), keeping the whole family memoized for consistency is fine — the uniformity aids readability and makes it safe to later add one to a dependency array without hunting for which are stable. Don't force-remove `useCallback` from a handler just because it's currently only passed to a DOM element or an inline closure.

Load-bearing — memoization is required:

```tsx
// onGrid is a dep of an expensive effect inside <MosaicGrid> — a new
// identity each render would re-fire that effect.
const handleGrid = useCallback((g: GridSize) => setGrid(g), []);
```

Optional but fine — part of a consistently-memoized handler group:

```tsx
// Passed to a plain <div>'s onPointerDown; memoized alongside its
// load-bearing siblings (handlePointerMove, endDrag) for consistency.
const handlePointerDown = useCallback((e: ReactPointerEvent) => { ... }, []);
```

---

# State Management

Choose the simplest appropriate solution.

Prefer:

* local state for local UI
* existing workspace patterns for shared state
* existing data-access libraries

Do not introduce new state libraries without approval.

---

# API/Data Rules

API logic belongs in:

```
libs/data-access/*
```

Components should not directly manage:

* API clients
* authentication flows
* database calls

Use:

```
Component
 ↓
Feature
 ↓
Data Access
 ↓
API
```

---

# Testing

Before completing work:

Run affected checks:

```bash
nx affected:test
nx affected:lint
nx affected:build
```

For single projects:

```bash
nx test <project>
nx lint <project>
nx build <project>
```

Fix failures before completion.

---

# Change Management

Before major changes explain:

* affected apps/libs
* new dependencies
* architecture impact
* migration steps

Avoid:

* unrelated refactors
* moving files without reason
* changing Nx configuration casually

---

# Claude Behaviour

When working in this repository:

* Inspect existing patterns before coding.
* Prefer existing libraries over creating new ones.
* Ask before architectural changes.
* Keep changes minimal and focused.
* Explain tradeoffs when multiple approaches exist.

The goal is production-ready code, not a quick prototype.
