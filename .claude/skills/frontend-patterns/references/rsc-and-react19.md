# React Server Component Patterns

## Parallel Data Fetching via Composition

Make parent Server Components synchronous and let each async child fetch its own data in parallel.

```typescript
// ❌ BAD: Sequential — Sidebar waits for header fetch
async function Page() {
  const header = await fetchHeader()
  return (
    <div>
      <div>{header}</div>
      <Sidebar />
    </div>
  )
}

// ✅ GOOD: Parallel — both fetch simultaneously
async function Header() {
  const data = await fetchHeader()
  return <div>{data}</div>
}

async function Sidebar() {
  const items = await fetchSidebarItems()
  return <nav>{items.map(renderItem)}</nav>
}

export default function Page() {
  return (
    <div>
      <Header />
      <Sidebar />
    </div>
  )
}
```

## Suspense Streaming with Async Children

Push `await` into child async Server Components wrapped in `<Suspense>` so the layout streams immediately.

```tsx
// ✅ Layout renders instantly, data streams in
function Page() {
  return (
    <div>
      <div>Sidebar</div>
      <div>Header</div>
      <Suspense fallback={<Skeleton />}>
        <DataDisplay />
      </Suspense>
      <div>Footer</div>
    </div>
  )
}

async function DataDisplay() {
  const data = await fetchData() // Only blocks this component
  return <div>{data.content}</div>
}
```

Share a single promise across multiple components with `use()`:

```tsx
function Page() {
  const dataPromise = fetchData() // Start fetch, don't await
  return (
    <Suspense fallback={<Skeleton />}>
      <DataDisplay dataPromise={dataPromise} />
      <DataSummary dataPromise={dataPromise} />
    </Suspense>
  )
}

function DataDisplay({ dataPromise }: { dataPromise: Promise<Data> }) {
  const data = use(dataPromise) // Unwraps the promise
  return <div>{data.content}</div>
}
```

## Minimize Serialization at RSC/Client Boundaries

Pass only the fields a client component needs — not entire objects. All props crossing the boundary are serialized into HTML.

```tsx
// ❌ BAD: Serializes all 50 fields of user
async function Page() {
  const user = await fetchUser()
  return <Profile user={user} />
}

// ✅ GOOD: Serializes only what's used
async function Page() {
  const user = await fetchUser()
  return <Profile name={user.name} />
}
```

## Eager Promise Start in Server Actions

Start independent operations immediately, await later.

```typescript
export async function GET(request: Request) {
  const sessionPromise = auth()
  const configPromise = fetchConfig()
  const session = await sessionPromise
  const [config, data] = await Promise.all([
    configPromise,
    fetchData(session.user.id)
  ])
  return Response.json({ data, config })
}
```

## Per-Request Deduplication with React.cache()

Deduplicate database/auth queries within a single RSC render pass. Pass primitive arguments — inline objects break cache hits.

```typescript
import { cache } from 'react'

export const getCurrentUser = cache(async () => {
  const session = await auth()
  if (!session?.user?.id) return null
  return await db.user.findUnique({ where: { id: session.user.id } })
})

// ❌ Cache miss — new object reference each call
const getUser = cache(async (params: { uid: number }) => { ... })

// ✅ Cache hit — primitive value equality
const getUser = cache(async (uid: number) => { ... })
```

## Non-Blocking Post-Response Work with after()

Use `after()` from `next/server` to schedule work after the response is sent (logging, analytics, cache invalidation).

```typescript
import { after } from 'next/server'

export async function POST(request: Request) {
  await updateDatabase(request)

  after(async () => {
    const userAgent = (await headers()).get('user-agent') || 'unknown'
    logUserAction({ userAgent })
  })

  return Response.json({ status: 'success' })
}
```

Works in Server Actions, Route Handlers, and Server Components. Runs even if the response fails.

# React 19 Patterns

## useTransition for Loading States

Replace manual `isLoading` useState with `useTransition`. Provides automatic `isPending`, error resilience, and interruption handling.

```tsx
import { useTransition, useState } from 'react'

function SearchResults() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [isPending, startTransition] = useTransition()

  const handleSearch = (value: string) => {
    setQuery(value)
    startTransition(async () => {
      const data = await fetchResults(value)
      setResults(data)
    })
  }

  return (
    <>
      <input onChange={(e) => handleSearch(e.target.value)} />
      {isPending && <Spinner />}
      <ResultsList results={results} />
    </>
  )
}
```

## Activity Component for Show/Hide

React 19's `<Activity>` preserves state and DOM for components that toggle visibility, avoiding expensive re-mounts.

```tsx
import { Activity } from 'react'

function Dropdown({ isOpen }: Props) {
  return (
    <Activity mode={isOpen ? 'visible' : 'hidden'}>
      <ExpensiveMenu />
    </Activity>
  )
}
```
