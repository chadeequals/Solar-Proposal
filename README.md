# Sundial v2 — Instant Solar Proposal Experience

**eEquals / Victory Energy** · Solar quote wizard → admin gate → Aurora AI design → instant proposal

---

## Quick Start

```bash
npm install
npm run dev
# → Open http://localhost:3000
```

That's it. No database, no external accounts, no API keys required for the mock flow.

---

## What This Is

Sundial v2 turns the existing 8-step intake wizard into an **instant proposal experience**. Instead of "we'll call you within 1 business day," qualified homeowners get a real solar design and proposal page generated automatically — in about 60 seconds.

The key architectural feature is the **admin-configurable qualification gate**. Because each Aurora Solar API pipeline costs ~$15–22, we only trigger it for leads that are likely to convert. The gate rules are editable at runtime from `/admin` — no code deploy required.

---

## Architecture Overview

```
Browser                     Next.js Server (App Router)         External (future)
  │                               │                                    │
  ├─ / (wizard)                   │                                    │
  │   └─ 8-step intake form       │                                    │
  │       └─ POST /api/intake ───►│                                    │
  │                               ├─ evaluateGate(intake, config)      │
  │                               │   └─ lib/gate.ts                  │
  │                               ├─ [gate FAIL] → save session        │
  │                               │   status: "gate_failed"           │
  │                               ├─ [gate PASS] → runAuroraPipeline   │
  │                               │   └─ lib/aurora-mock.ts           │
  │                               │   (fires async, returns session_id)│
  │                               │                                    │
  ├─ GET /api/intake/[id]/status  │   [pipeline running...]           │
  │   (polls every 1.5s) ────────►│                                    │
  │                               ├─ session.status: designing         │
  │                               │              → design_ready        │
  │                               │              → complete            │
  │                               │                                    │
  ├─ /proposal/[designId] ───────►│                                    │
  │   └─ renders full proposal    │                                    │
  │                               │                                    │
  └─ /admin ─────────────────────►│                                    │
      └─ gate config editor       │                                    │
          credit usage dashboard  │                                    │
          sessions list           │                                    │
          test panel              │                                    │
```

### Data Flow

1. **Wizard** (`app/page.tsx`) — 8-step React form, collected via React Hook Form + Zod
2. **Intake API** (`app/api/intake/route.ts`) — receives intake, loads gate config, evaluates gate
3. **Gate Evaluator** (`lib/gate.ts`) — deterministic rule engine against `GateConfig`
4. **Mock Aurora Client** (`lib/aurora-mock.ts`) — simulates real Aurora API with realistic delays/data
5. **Store** (`lib/store.ts`) — in-memory Maps for sessions, config, credit log
6. **Proposal Page** (`app/proposal/[designId]/page.tsx`) — renders design, savings, financing

---

## Directory Structure

```
Solar-Proposal/
├── app/
│   ├── layout.tsx              # Root layout, Google Fonts, metadata
│   ├── globals.css             # Tailwind + custom CSS variables, component classes
│   ├── page.tsx                # 8-step wizard (main customer flow)
│   ├── admin/
│   │   └── page.tsx            # Admin dashboard (gate config + credit + sessions)
│   ├── proposal/
│   │   └── [designId]/
│   │       └── page.tsx        # Proposal rendering page
│   └── api/
│       ├── intake/
│       │   ├── route.ts                     # POST /api/intake
│       │   └── [sessionId]/
│       │       └── status/
│       │           └── route.ts             # GET /api/intake/:id/status
│       ├── proposal/
│       │   └── [designId]/
│       │       └── route.ts                 # GET /api/proposal/:designId
│       └── admin/
│           ├── auth/route.ts                # POST /api/admin/auth
│           ├── gate-config/route.ts         # GET/POST /api/admin/gate-config
│           ├── gate-test/route.ts           # POST /api/admin/gate-test
│           └── dashboard/route.ts           # GET /api/admin/dashboard
├── components/
│   └── wizard/
│       ├── WizardProgress.tsx              # Progress bar + step dots
│       ├── WizardLayout.tsx                # Step shell (heading + nav buttons)
│       └── steps/
│           ├── Step1Address.tsx            # Address inputs
│           ├── Step2Ownership.tsx          # Own/Buying/Rent card select
│           ├── Step3Stories.tsx            # 1/2/3+ stories + garage
│           ├── Step4Trees.tsx              # Shade analysis cards
│           ├── Step5Roof.tsx               # Roof material grid
│           ├── Step6Bill.tsx               # Bill slider + utility + savings
│           ├── Step7Contact.tsx            # Contact info inputs
│           └── Step8Review.tsx             # Summary + consent + submit
└── lib/
    ├── types.ts                # All TypeScript type definitions
    ├── gate.ts                 # Gate evaluator + default seed config
    ├── aurora-mock.ts          # Mock Aurora API client
    └── store.ts                # In-memory session/config/credit store
```

---

## The Qualification Gate

The gate is the core architectural feature of Sundial v2. It runs every intake through a set of admin-configurable rules before spending ~$18 on Aurora API calls.

### How It Works

```typescript
evaluateGate(intake, config, todaySpend, monthSpend): GateEvaluation
```

The evaluator checks:
1. **Step completion** — `intake.step_completed >= config.trigger_step`
2. **Each rule** — runs `applyOperator(intake[field], operator, value)` per rule
3. **Credit caps** — `todaySpend + estimatedCost <= dailyCap` and monthly equivalent
4. **Global toggle** — `config.aurora_enabled` must be `true`

Rules with `required: true` block Aurora on failure. Rules with `warn_only: true` log warnings but don't block.

### Default Seed Config

| Rule | Field | Operator | Value | Required |
|------|-------|----------|-------|----------|
| State approval | `state` | `in` | TX, AZ, NV, FL, CA | ✅ |
| Utility approval | `utility` | `in` | Oncor, CPS, APS, etc. | ✅ |
| Ownership | `ownership` | `in` | own, buying | ✅ |
| Min bill | `monthly_bill_usd` | `gte` | 80 | ✅ |
| Slate roof | `roof` | `not_equals` | slate | ⚠️ warn only |
| Wood shake roof | `roof` | `not_equals` | wood_shake | ⚠️ warn only |
| Heavy shade | `trees` | `not_equals` | heavy | ⚠️ warn only |

---

## Admin Dashboard

**URL:** `/admin`  
**Default password:** `sundial2026`  
**Change it:** Set `ADMIN_TOKEN` environment variable

### Tabs

| Tab | What it does |
|-----|-------------|
| Gate Config | Edit rules, toggle Aurora, set credit caps, change trigger step |
| Credit Usage | Today/month spend vs caps, recent API call log with costs |
| Sessions | All intake sessions with gate result, status, proposal link |
| Test Panel | Paste intake JSON → evaluate against live config → see pass/fail |

---

## Environment Variables

```env
# .env.local — copy this, never commit the actual file
ADMIN_TOKEN=sundial2026          # Admin password (change in production!)
AURORA_API_KEY=                  # TODO: Real Aurora key (not used in mock)
AURORA_TENANT_ID=                # TODO: Your Aurora tenant ID
```

---

## Mock Aurora Pipeline

The mock client (`lib/aurora-mock.ts`) simulates the full Aurora pipeline:

| Step | Mock Delay | Estimated Real Cost |
|------|-----------|---------------------|
| `createProject` | 200–500ms | $0 |
| `requestAiSiteModel` | 3–8 seconds | ~$10 |
| `runAutoDesigner` | 400–800ms | ~$5 |
| `getPricing` | 200–500ms | ~$1 |
| `getFinancing` | 200–500ms | ~$1 |
| `createWebProposal` | 200–400ms | ~$1.50 |
| **Total** | **~6–12 seconds** | **~$18.50** |

System sizing logic: `systemKw = (monthlyBill / $0.135 / 12) * (1/1400) * 12`  
Based on avg TX/AZ/CA electricity rate and 1,400 kWh/kWp/year production ratio.

---

## Swapping to Production

Every file has `// TODO:` comments marking the exact swap points. Key ones:

### 1. Database (Supabase)
```typescript
// lib/store.ts — replace all Map operations with:
import { createClient } from '@supabase/supabase-js'

// Sessions table
await supabase.from('sundial_sessions').insert(session)
await supabase.from('sundial_sessions').select().eq('id', sessionId).single()

// Gate config table  
await supabase.from('gate_configs').select().order('version', { ascending: false }).limit(1)
```

### 2. Real Aurora API
```typescript
// lib/aurora-mock.ts — replace each function body with:
const res = await fetch(`https://api.aurorasolar.com/v2/tenants/${TENANT_ID}/projects`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${AURORA_API_KEY}` },
  body: JSON.stringify(payload)
})
```

### 3. Background Jobs (Inngest or Trigger.dev)
```typescript
// app/api/intake/route.ts — replace fire-and-forget with:
await inngest.send({ name: 'sundial/run-aurora-pipeline', data: { sessionId, intake } })
```

### 4. Admin Auth (Clerk or NextAuth)
Replace the cookie check with Clerk's `auth()` middleware or NextAuth session.

### 5. Proposal CTA (Calendly)
Replace the alert button in `app/proposal/[designId]/page.tsx` with Calendly embed.

---

## Known Issues / Deviations from Spec

1. **In-memory store resets on server restart** — by design for mock. Sessions and gate config are lost when `npm run dev` restarts. This is documented with TODO markers.

2. **Aurora pipeline is fire-and-forget** — uses an async Promise, not a proper job queue. Under concurrent load (unlikely in dev/demo), multiple pipelines could run simultaneously without coordination. Production needs Inngest or Trigger.dev.

3. **No lat/lng geocoding** — address is captured but lat/lng defaults to random values near Austin, TX. Production should add Google Maps Geocoding API call.

4. **Proposal page requires polling completion** — if you navigate to `/proposal/[designId]` before the pipeline finishes, you'll see "Proposal not found". The wizard handles this correctly by redirecting only after polling confirms `status: "complete"`.

5. **Admin auth is HTTP-only cookie, not JWT** — sufficient for demo, not for production. Replace with Clerk or NextAuth.

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Next.js 14 App Router | Full-stack, streaming, file-based routing |
| Language | TypeScript (strict) | Type-safe throughout |
| Styling | Tailwind CSS v3 | Utility-first, consistent design tokens |
| Forms | React Hook Form + Zod | Performant, type-safe validation |
| State | React useState + module-level Maps | No ORM/DB overhead for mock |
| IDs | `uuid` v4 | Simple, collision-resistant |

---

## Contributing

1. `git clone` → `npm install` → `npm run dev`
2. Make changes
3. `npm run type-check` — ensure TypeScript is clean
4. `npm run build` — ensure production build succeeds
5. Commit with semantic messages: `feat:`, `fix:`, `refactor:`, `docs:`
