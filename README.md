# Maslul (מסלול)

**Delivery dispatch for restaurants that run their own couriers.**

The system decides what order a courier should deliver in — by minimising how
long customers wait, not how far the courier drives. Those two goals disagree
more often than you would expect, and §[Why this is not TSP](#why-this-is-not-a-travelling-salesman-problem)
shows a four-point case where the difference is 2.2×.

Full-stack TypeScript. React + Vite, Supabase (Postgres, Row Level Security,
Realtime), Leaflet. Hebrew RTL throughout.

---

## Live demo

| | |
|---|---|
| **Owner dashboard** | https://maslul-dashboard.vercel.app |
| **Courier app** (open on a phone) | https://maslul-courier.vercel.app |

```
dashboard   demo@maslul.local     / <DEMO_PASSWORD>
courier     courier@maslul.local  / <DEMO_PASSWORD>
```

The demo is seeded with twelve deliveries, an active courier shift, and a route
already in progress. **The customer names and phone numbers are fabricated. The
addresses are real** — they are drawn from the same open Israeli address dataset
the app itself searches, so the distances between points are genuine and the
routing behaves the way it would in production.

The interface is Hebrew and right-to-left. The screen names are: *deliveries*,
*map*, *routes*, *couriers*.

---

## The problem

A restaurant with two or three of its own couriers has no dispatcher. The owner
decides, between taking orders, which deliveries go out together and in what
order. Get it wrong and food arrives cold — not because the courier was slow,
but because the stop was third instead of first.

The constraint that shapes the entire system, validated with real businesses:

> **A courier who has left on a route does not come back mid-route to pick up
> another order.** A dish that becomes ready waits for their return, or goes
> out with a different courier.

This is not a limitation to engineer around — it is what makes the problem
tractable. Every dispatch is a **closed batch**, so there is no dynamic routing
problem. It decomposes into two independent static problems: *ordering within a
batch*, and *composing the batch*.

Any proposal involving re-optimisation mid-drive contradicts this constraint.

---

## Why this is not a Travelling Salesman Problem

TSP minimises total route length. But **the customer does not care how far the
courier drove — they care when their own food arrived.** What the system
minimises is the sum of customer waiting times:

```
minimise   Σᵢ ( arrival_timeᵢ − ready_atᵢ )
```

This is the **Minimum Latency Problem**, also called the Traveling Repairman.
Its optimal route may be *longer in distance* than the TSP optimum — and that
is correct behaviour, not a bug. It pays to sweep up nearby customers early,
even at the cost of a longer drive overall.

### The counterexample that rules out the obvious shortcut

The tempting shortcut is: *find the shortest Hamiltonian cycle, then choose
which end to start from.* It does not work.

Take a restaurant `R = (0,0)` and three customers `A = (1,0)`, `B = (0,1)`,
`C = (10,10)`:

| Visiting order | Cycle length | **Sum of waiting times** |
|---|---|---|
| `R→A→C→B` — the shortest cycle, either direction | **28.9** (shortest) | 43.4 |
| `R→A→B→C` | 30.0 | **19.3** (optimal) |

*Cycle length includes the return leg to `R`, since that is what TSP minimises.
Waiting time is the sum of the three arrival times, which is what customers
experience — nobody is waiting on the drive home.*

TSP pushes the far point into the middle so it never pays for that leg twice.
Minimum latency wants the opposite: grab both near customers immediately, then
pay the long drive once, at the end — where only one person is still waiting.

The shortest cycle **removes the right answer from the search space entirely**,
and no choice of starting direction brings it back.

And the shortcut is not even cheaper: finding the shortest cycle *is itself*
TSP — the same 8! = 40,320 permutations. It costs exactly the same and returns
a worse answer.

### Why brute force, deliberately

At n ≤ 8 stops, 40,320 permutations evaluate in about 20 ms and the result is
**provably optimal**. OR-Tools would mean shipping a Python service to deploy
and maintain — real cost, no benefit at this size. Above n = 10 the plan is
Held–Karp, O(n²·2ⁿ).

A note that saves confusion: within a fixed batch, `Σ ready_at` is a constant,
so minimising total arrival time is equivalent to minimising total wait. **The
ordering depends on travel times alone.** `ready_at` is what makes the result
*measurable*, and it drives batch composition — not the ordering inside one.

---

## Engineering decisions worth reading

**Authorisation lives in the database, not the client.** Row Level Security on
every table. A courier cannot see a delivery until a route has been assigned to
them and dispatched — the restaurant's customer list never leaks. There is no
endpoint anywhere that returns a list of couriers or businesses; lookup is by
exact phone match only.

**A silently wrong coordinate is worse than a missing one.** It looks fine right
up until the courier is standing in the wrong place. Street-level geocoding
results are therefore stored as `manual`, never as `ok`, and flagged in the UI
at the moment of choosing. This matters especially here: minimum-latency
ordering sorts by *who is near and who is far*, so an input that blurs that
distinction produces a confidently wrong decision.

**A local address table instead of a geocoding provider.** Not a preference —
a measurement. Against real Beer Sheva addresses, OpenStreetMap did not know
`היילפרין ליפמן 18` at all, and returned `שדרות רגר` as a single point when the
street is 2,889 m long. Google's terms forbid using its geocoding alongside a
non-Google map, which rules it out while the map is Leaflet. The public
Nominatim instance forbids autocomplete outright. So the open Israeli address
dataset (CC-BY) is converted from EPSG:2039 to WGS84 and loaded into Postgres,
searched with `pg_trgm` word similarity. No rate limit, no extra service, no
licence conflict.

**`routes` and `route_stops` as first-class entities.** Putting `courier_id`
directly on a delivery would erase the *order* — and the order is the entire
product.

**A dispatched route freezes.** Editing is possible only in `draft`. This falls
straight out of the business constraint above.

**Money is `integer` agorot.** Never a float.

**Three Realtime lessons, each found the hard way.** A new table is not in the
`supabase_realtime` publication, and subscribing to it *succeeds silently*
while delivering no events. `replica identity full` is required or RLS cannot
evaluate UPDATE events and they vanish. And subscribing to a table does not
notify you when a *related* table changes — the fix there was not another
subscription but deleting the second copy of the data. Keep one live source,
never two.

**A hosted matrix service before a self-hosted one.** Travel times will come
from OpenRouteService rather than a self-hosted OSRM instance. One restaurant
is ~25 route calculations per day, which sits far inside the free tier, and the
$6/month VPS is not the real cost — installation, an ageing map extract,
security updates and noticing when it falls over are. Self-hosting becomes
correct at roughly 30–50 restaurants, and the provider is isolated behind a
single `getDurationMatrix()` function so that switch is one implementation, not
a rewrite.

---

## Architecture

```
Owner dashboard (React + Vite + Leaflet)      Courier PWA (React + Vite)
                    │                                   │
                    └──────── Supabase JS ──────────────┘
                          (REST + Realtime WS)
                                   │
                    ┌──────────────▼──────────────┐
                    │  Postgres + RLS + pg_trgm   │
                    │  Auth · Realtime            │
                    │  addresses (loaded dataset) │
                    └──────────────┬──────────────┘
                                   │
                       Photon (OSM) — address fallback
                       OpenRouteService — travel matrix (stage 6)
```

Both external services are OpenStreetMap-derived, so they share one licence and
one attribution, and neither conflicts with the Leaflet map. That is a
constraint, not a coincidence: a provider from another ecosystem drags the whole
stack with it.

| | |
|---|---|
| Language | TypeScript, front to back |
| Database | Postgres 15 · Row Level Security · `pg_trgm` |
| Backend | Supabase — Auth, Realtime, RLS |
| Frontend | React 18, Vite, Tailwind |
| Map | Leaflet + OpenStreetMap tiles (no `react-leaflet` — see below) |
| Hosting | Vercel, two projects from one monorepo |

`leaflet` directly rather than `react-leaflet`: a map, pins and a click handler
do not justify a wrapper layer that is sensitive to React versions. Leaflet's
default marker images break under a bundler, so markers are `divIcon`s — which
also allows colour to carry meaning.

No TanStack Query and no Zustand. The application state is four lists, each with
a dedicated hook subscribed to Realtime. There is no cache to manage and no
global state to share between distant screens.

---

## Project status — and what the demo does *not* prove

| Stage | |
|---|---|
| 0 · Schema, auth, RLS | ✅ |
| 1 · Courier shifts + Realtime | ✅ |
| 2 · Deliveries, geocoding, `ready_at` | ✅ |
| 3 · Map, manual pin-drop | ✅ |
| 4 · Manual routes, dispatch, delivery confirmation | ✅ |
| 5 · Two-week pilot with a real restaurant | ⏸️ **blocked** |
| 6 · The optimiser | 🔜 next |
| 7 · Batch composition + analytics | 🔜 |

Stages 0–4 are a complete, usable product with no optimisation in it. That
ordering was deliberate: if an owner will not batch deliveries by hand in stage
4, stage 6 is meaningless.

**Stage 5 is blocked on finding a pilot restaurant, which is not a technical
problem.** Rather than stall, stage 6 is being built first and measured against
a simulated dataset built from real Beer Sheva geography.

To be explicit about what that will and will not show. A simulated dataset can
demonstrate that the algorithm improves the objective function on real
geography. It **cannot** show that a restaurant owner will actually use the
system, that data entry is fast enough during a dinner rush, or that the
assumptions about courier behaviour hold. Those stay open until there is a
pilot.

The riskiest part of this product was never the algorithm — it is data entry.
If an owner has to type eight addresses by hand, the system is dead regardless
of how good the routing is. That is why the delivery form opens on the *phone
number* rather than the address: a returning customer brings their verified
address and coordinates with them, and nothing is typed at all.

---

## Running locally

```bash
npm install
npm run dashboard     # http://localhost:5173
npm run courier       # http://localhost:5174  (host: true, for phone testing)
npm run typecheck
npm run build
```

Each app needs a `.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
Migrations in `supabase/migrations` are applied in order. `npm run seed`
regenerates the demo dataset from the address data.

| Path | |
|---|---|
| `supabase/migrations/` | Schema and RLS — the source of truth |
| `packages/shared/` | Types, hooks, auth, address search |
| `apps/dashboard/` · `apps/courier/` | The two applications |
| `scripts/` | Address dataset preparation, demo seed generation |
| `docs/deploy.md` | Deployment walkthrough |
| `spec.md` · `CLAUDE.md` | Full technical spec and decision log (Hebrew) |

---

## Credits

Addresses: [רשימת כתובות בישראל](https://www.odata.org.il/dataset/ac1ae1fa-6d43-4685-8434-9953e950ca9b)
(CC BY) · Maps and supplementary data: © [OpenStreetMap](https://www.openstreetmap.org/copyright)
contributors (ODbL).
