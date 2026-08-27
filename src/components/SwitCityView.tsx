import { useCallback, useEffect, useState, type SyntheticEvent } from 'react'
import {
  type ScCreator,
  type ScHealthCheck,
  fetchScDiscover,
  fetchScHealth,
  scAvatarPlaceholder,
} from '../lib/switcity'

type SwitCityViewProps = {
  onSwitchSite: () => void
  onLogout: () => void
}

type ScTab = 'discover' | 'health' | 'info'

export function SwitCityView({ onSwitchSite, onLogout }: SwitCityViewProps) {
  const [tab, setTab] = useState<ScTab>('discover')

  return (
    <div className="min-h-svh grid grid-rows-[auto_1fr]">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-4 px-6 py-3.5 border-b border-border bg-base/82 backdrop-blur-xl backdrop-saturate-[1.4]">
        <div className="flex items-center gap-3 min-w-0">
          <span className="min-w-[34px] h-[34px] px-2 rounded-xl grid place-items-center font-display text-xs font-[900] text-white bg-gradient-to-br from-[#f59e0b] to-[#d97706] shadow-[0_8px_24px_rgba(245,158,11,0.22)]">
            SC
          </span>
          <span className="hidden sm:inline font-display text-[22px] font-[800] tracking-tight">
            SwitCity
          </span>

          <nav className="inline-flex gap-1 p-1 border border-border rounded-full bg-inset">
            {([
              ['discover', 'Discover'],
              ['health', 'Health'],
              ['info', 'Info'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={
                  tab === key
                    ? 'text-white bg-gradient-to-br from-[#f59e0b] to-[#d97706] shadow-[0_6px_16px_rgba(245,158,11,0.22)] rounded-full px-3.5 py-2 text-[12px] font-semibold tracking-wide uppercase cursor-pointer'
                    : 'text-muted rounded-full px-3.5 py-2 text-[12px] font-semibold tracking-wide uppercase hover:text-foreground hover:bg-white/[0.04] transition-all cursor-pointer'
                }
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="border border-border rounded-full px-3.5 py-2 text-xs font-semibold tracking-wide uppercase bg-card hover:border-[#f59e0b]/35 hover:bg-[#f59e0b]/10 hover:text-white transition-all cursor-pointer"
            onClick={onSwitchSite}
          >
            Switch site
          </button>
          <button
            type="button"
            className="border border-border rounded-full px-3.5 py-2 text-xs font-semibold tracking-wide uppercase bg-card hover:border-danger/35 hover:bg-danger/10 hover:text-danger transition-all cursor-pointer"
            onClick={onLogout}
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="w-full max-w-[1240px] mx-auto px-3.5 md:px-6 py-4 md:py-7">
        {tab === 'discover' && <DiscoverTab />}
        {tab === 'health' && <HealthTab />}
        {tab === 'info' && <InfoTab />}
      </main>
    </div>
  )
}

function DiscoverTab() {
  const [creators, setCreators] = useState<ScCreator[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    void fetchScDiscover()
      .then((data) => {
        if (cancelled) return
        setCreators(data.creators)
        setSource(data.source)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load discover')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  const handleImgError = (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    const letter = img.alt?.charAt(0) || 'S'
    img.src = scAvatarPlaceholder(letter)
  }

  return (
    <>
      <section className="relative overflow-hidden mb-7 p-7 border border-border rounded-3xl bg-gradient-to-br from-[#f59e0b]/[0.08] via-transparent to-transparent bg-surface shadow-sm">
        <p className="mb-2.5 text-[#f59e0b] text-xs font-bold tracking-[0.14em] uppercase">
          SwitCity
        </p>
        <h1 className="m-0 font-display text-[clamp(2rem,6vw,3rem)] leading-[0.95] font-[900] tracking-tighter max-w-[14ch]">
          Discover creators
        </h1>
        <p className="mt-3.5 max-w-[48ch] text-muted text-[15px]">
          {loading
            ? 'Scraping switcity.com discover page...'
            : creators.length > 0
              ? `${creators.length} creators found via ${source} scrape`
              : 'Creator data may require authentication. Browse the public health data or site info.'}
        </p>
      </section>

      {error ? (
        <p className="m-0 mb-4 p-3 px-3.5 rounded-2xl border border-danger/25 bg-danger/[0.08] text-danger text-sm">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3.5">
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={i}
              className="aspect-[0.82] relative overflow-hidden rounded-xl bg-card border border-border after:absolute after:inset-0 after:-translate-x-full after:bg-gradient-to-r after:from-transparent after:via-white/[0.06] after:to-transparent after:animate-[shimmer_1.4s_infinite]"
            />
          ))}
        </div>
      ) : null}

      {!loading && creators.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3.5">
          {creators.map((c) => (
            <a
              key={c.username}
              href={`https://switcity.com/${c.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group grid gap-3.5 p-4 border border-border bg-card rounded-xl transition-all hover:-translate-y-0.5 hover:border-[#f59e0b]/30 hover:bg-card-hover hover:shadow-lg"
            >
              <img
                src={c.avatar || scAvatarPlaceholder(c.username.charAt(0).toUpperCase())}
                alt={c.displayName}
                loading="lazy"
                onError={handleImgError}
                className="w-full aspect-square rounded-2xl object-cover bg-inset"
              />
              <div className="grid gap-1 min-w-0">
                <strong className="font-display text-[15px] font-bold truncate">
                  @{c.username}
                </strong>
                <span className="text-[13px] text-muted truncate">{c.displayName}</span>
                {c.bio ? (
                  <span className="text-[12px] text-soft truncate">{c.bio}</span>
                ) : null}
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {c.verified ? (
                    <span className="px-2 py-0.5 rounded-full bg-[#f59e0b]/15 text-[#fbbf24] text-[10px] font-bold uppercase tracking-wide">
                      Verified
                    </span>
                  ) : null}
                  {c.subscriberCount > 0 ? (
                    <span className="px-2 py-0.5 rounded-full bg-inset text-soft text-[10px] font-semibold uppercase tracking-wide">
                      {c.subscriberCount} subs
                    </span>
                  ) : null}
                  {c.postCount > 0 ? (
                    <span className="px-2 py-0.5 rounded-full bg-inset text-soft text-[10px] font-semibold uppercase tracking-wide">
                      {c.postCount} posts
                    </span>
                  ) : null}
                </div>
              </div>
            </a>
          ))}
        </div>
      ) : null}

      {!loading && creators.length === 0 && !error ? (
        <div className="p-12 text-center border border-dashed border-border rounded-xl bg-white/[0.02]">
          <p className="text-muted text-[15px] mb-3">
            No public creator data extracted. The discover page may require authentication or use client-side rendering.
          </p>
          <a
            href="https://switcity.com/discover"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex px-4 py-2.5 rounded-full border border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#fbbf24] text-sm font-semibold hover:bg-[#f59e0b]/20 transition-all"
          >
            Open switcity.com/discover
          </a>
        </div>
      ) : null}
    </>
  )
}

function HealthTab() {
  const [health, setHealth] = useState<ScHealthCheck | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    setLoading(true)
    setError(null)
    void fetchScHealth()
      .then(setHealth)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { reload() }, [reload])

  return (
    <>
      <section className="relative overflow-hidden mb-7 p-7 border border-border rounded-3xl bg-gradient-to-br from-[#f59e0b]/[0.08] via-transparent to-transparent bg-surface shadow-sm">
        <p className="mb-2.5 text-[#f59e0b] text-xs font-bold tracking-[0.14em] uppercase">
          Infrastructure
        </p>
        <h1 className="m-0 font-display text-[clamp(1.6rem,5vw,2.4rem)] leading-[0.95] font-[900] tracking-tighter">
          Health endpoint
        </h1>
        <p className="mt-3 max-w-[52ch] text-muted text-sm">
          Live data from <code className="text-soft text-[13px]">api.switcity.com/health</code> — publicly accessible without authentication (CRITICAL finding).
        </p>
        <button
          type="button"
          className="mt-4 px-4 py-2 rounded-full border border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#fbbf24] text-sm font-semibold hover:bg-[#f59e0b]/20 transition-all cursor-pointer"
          onClick={reload}
        >
          Refresh
        </button>
      </section>

      {loading ? (
        <div className="grid gap-3.5">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 relative overflow-hidden rounded-xl bg-card border border-border after:absolute after:inset-0 after:-translate-x-full after:bg-gradient-to-r after:from-transparent after:via-white/[0.06] after:to-transparent after:animate-[shimmer_1.4s_infinite]"
            />
          ))}
        </div>
      ) : null}

      {error ? (
        <p className="m-0 p-3 px-3.5 rounded-2xl border border-danger/25 bg-danger/[0.08] text-danger text-sm">
          {error}
        </p>
      ) : null}

      {!loading && health ? (
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-3">
            <StatusPill
              label="Overall"
              value={health.status}
              ok={health.status === 'ok'}
            />
            <StatusPill
              label="Database"
              value={health.checks.database.status}
              ok={health.checks.database.status === 'ok'}
            />
            <StatusPill
              label="Cache"
              value={health.checks.cache.status}
              ok={health.checks.cache.status === 'ok'}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-5 border border-border rounded-xl bg-card">
              <h3 className="m-0 mb-4 text-xs font-bold tracking-[0.08em] uppercase text-muted">
                Database Pool
              </h3>
              <div className="grid gap-3">
                <MetricRow label="Latency" value={`${health.checks.database.latencyMs}ms`} />
                <MetricRow label="Probes total" value={String(health.checks.database.probesTotal)} />
                <MetricRow label="Probes failed" value={String(health.checks.database.probesFailed)} warn={health.checks.database.probesFailed > 0} />
                <MetricRow label="Pool used" value={String(health.checks.database.pool.used)} />
                <MetricRow label="Pool free" value={String(health.checks.database.pool.free)} />
                <MetricRow label="Pending acquires" value={String(health.checks.database.pool.pendingAcquires)} warn={health.checks.database.pool.pendingAcquires > 0} />
              </div>
            </div>

            <div className="p-5 border border-border rounded-xl bg-card">
              <h3 className="m-0 mb-4 text-xs font-bold tracking-[0.08em] uppercase text-muted">
                Redis Cache
              </h3>
              <div className="grid gap-3">
                <MetricRow label="Latency" value={`${health.checks.cache.latencyMs}ms`} />
                <MetricRow
                  label="Namespaces"
                  value={String(Object.keys(health.checks.cache.metrics.namespaces).length)}
                />
              </div>
            </div>
          </div>

          <div className="p-5 border border-border rounded-xl bg-card">
            <h3 className="m-0 mb-4 text-xs font-bold tracking-[0.08em] uppercase text-muted">
              Cache Namespaces
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-soft border-b border-border">
                    <th className="py-2 pr-4 font-semibold">Namespace</th>
                    <th className="py-2 pr-4 font-semibold tabular-nums">Hits</th>
                    <th className="py-2 pr-4 font-semibold tabular-nums">Misses</th>
                    <th className="py-2 pr-4 font-semibold tabular-nums">Errors</th>
                    <th className="py-2 pr-4 font-semibold tabular-nums">Hit Rate</th>
                    <th className="py-2 font-semibold tabular-nums">Avg Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(health.checks.cache.metrics.namespaces).map(
                    ([name, ns]) => {
                      const total = ns.hits + ns.misses
                      const hitRate = total > 0 ? ((ns.hits / total) * 100).toFixed(1) : '—'
                      return (
                        <tr key={name} className="border-b border-border/50">
                          <td className="py-2.5 pr-4 font-medium text-foreground">{name}</td>
                          <td className="py-2.5 pr-4 tabular-nums text-muted">{ns.hits.toLocaleString()}</td>
                          <td className="py-2.5 pr-4 tabular-nums text-muted">{ns.misses.toLocaleString()}</td>
                          <td className={`py-2.5 pr-4 tabular-nums ${ns.errors > 0 ? 'text-danger font-semibold' : 'text-muted'}`}>
                            {ns.errors.toLocaleString()}
                          </td>
                          <td className="py-2.5 pr-4 tabular-nums text-muted">{hitRate}%</td>
                          <td className="py-2.5 tabular-nums text-muted">{(ns.loaderAvgMs ?? ns.avgLatencyMs ?? 0).toFixed(1)}ms</td>
                        </tr>
                      )
                    },
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <details className="p-4 border border-border rounded-xl bg-card">
            <summary className="text-xs font-bold tracking-[0.08em] uppercase text-muted cursor-pointer">
              Raw JSON
            </summary>
            <pre className="mt-3 p-3 rounded-lg bg-inset text-[11px] text-soft overflow-auto max-h-[360px]">
              {JSON.stringify(health, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}
    </>
  )
}

function InfoTab() {
  return (
    <>
      <section className="relative overflow-hidden mb-7 p-7 border border-border rounded-3xl bg-gradient-to-br from-[#f59e0b]/[0.08] via-transparent to-transparent bg-surface shadow-sm">
        <p className="mb-2.5 text-[#f59e0b] text-xs font-bold tracking-[0.14em] uppercase">
          Platform Intel
        </p>
        <h1 className="m-0 font-display text-[clamp(1.6rem,5vw,2.4rem)] leading-[0.95] font-[900] tracking-tighter">
          SwitCity Overview
        </h1>
        <p className="mt-3 max-w-[52ch] text-muted text-sm">
          Key intelligence from the security audit. Platform targets African creator economy with local payment rails.
        </p>
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        <InfoCard title="Technology Stack">
          <InfoRow label="Frontend" value="Next.js (App Router + Turbopack)" />
          <InfoRow label="Backend" value="NestJS (Node.js)" />
          <InfoRow label="Web Server" value="nginx/1.24.0 (Ubuntu)" />
          <InfoRow label="Database" value="Relational (10-conn pool)" />
          <InfoRow label="Cache" value="Redis (7 namespaces)" />
          <InfoRow label="Real-time" value="Socket.IO" />
          <InfoRow label="Media" value="Google Cloud Platform" />
          <InfoRow label="Moderation" value="Google Cloud Vision API" />
        </InfoCard>

        <InfoCard title="Infrastructure">
          <InfoRow label="Hosting" value="Contabo VPS" />
          <InfoRow label="IP" value="167.86.126.204" />
          <InfoRow label="DNS" value="ns1/2/3.contabo.net" />
          <InfoRow label="SSL" value="Let's Encrypt, TLS 1.3" />
          <InfoRow label="CDN/WAF" value="None" warn />
          <InfoRow label="Email" value="Zoho Mail" />
        </InfoCard>

        <InfoCard title="Business">
          <InfoRow label="Payments" value="Bani (PCI-DSS)" />
          <InfoRow label="Currency" value="Nigerian Naira (NGN)" />
          <InfoRow label="Market" value="Africa (Nigeria focus)" />
          <InfoRow label="White-label" value="Fork of Ndloo (ndloo.com)" />
          <InfoRow label="Auth" value="JWT + refresh tokens" />
          <InfoRow label="Video calls" value="Custom implementation" />
        </InfoCard>

        <InfoCard title="Security Issues" danger>
          <InfoRow label="CRITICAL" value="/health exposes DB + Redis metrics" warn />
          <InfoRow label="HIGH" value="JWT in localStorage (XSS risk)" warn />
          <InfoRow label="HIGH" value="Server-Timing header leaks DB timing" warn />
          <InfoRow label="HIGH" value="No CSP/HSTS on frontend" warn />
          <InfoRow label="MEDIUM" value="nginx version disclosure (CVEs)" warn />
          <InfoRow label="MEDIUM" value="Unauthenticated Socket.IO" warn />
          <InfoRow label="MEDIUM" value="Incomplete Ndloo rebranding" />
          <InfoRow label="MEDIUM" value="Checkbox-only age verification" />
        </InfoCard>

        <InfoCard title="API Endpoints">
          <InfoRow label="GET /health" value="Public (no auth)" warn />
          <InfoRow label="POST /auth/login" value="Public" />
          <InfoRow label="POST /auth/refresh-token" value="Auth required" />
          <InfoRow label="GET /feed" value="Auth required" />
          <InfoRow label="GET /notifications" value="Auth required" />
          <InfoRow label="GET /socket.io/" value="No auth for handshake" warn />
          <InfoRow label="GET /video-calls/*" value="Auth required" />
        </InfoCard>

        <InfoCard title="Cache Namespaces">
          <InfoRow label="demo" value="Highest hit count — shared prod DB?" warn />
          <InfoRow label="signup" value="User registration cache" />
          <InfoRow label="creator" value="Creator profile data" />
          <InfoRow label="subscription-plans" value="Monetization plans" />
          <InfoRow label="discover" value="Browse/discover data" />
          <InfoRow label="platform-settings" value="Global config" />
          <InfoRow label="content-rules" value="Moderation rules" />
        </InfoCard>
      </div>
    </>
  )
}

function StatusPill({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full border text-sm font-semibold ${
        ok
          ? 'border-emerald-500/40 text-emerald-400'
          : 'border-danger/40 text-danger'
      }`}
    >
      <span className={`w-2 h-2 rounded-full ${ok ? 'bg-emerald-400' : 'bg-danger'}`} />
      {label}: {value}
    </span>
  )
}

function MetricRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted text-[13px]">{label}</span>
      <span className={`font-semibold tabular-nums text-sm ${warn ? 'text-danger' : 'text-foreground'}`}>
        {value}
      </span>
    </div>
  )
}

function InfoCard({
  title,
  danger,
  children,
}: {
  title: string
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={`p-5 rounded-xl border ${
        danger ? 'border-danger/30 bg-danger/[0.04]' : 'border-border bg-card'
      }`}
    >
      <h3 className="m-0 mb-4 text-xs font-bold tracking-[0.08em] uppercase text-muted">
        {title}
      </h3>
      <div className="grid gap-2.5">{children}</div>
    </div>
  )
}

function InfoRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted text-[13px] shrink-0">{label}</span>
      <span
        className={`text-sm text-right ${warn ? 'text-[#fbbf24] font-semibold' : 'text-foreground'}`}
      >
        {value}
      </span>
    </div>
  )
}
