import {
  type SyntheticEvent,
  useEffect,
  useState,
} from 'react'
import './App.css'
import { AfricanCastingView } from './components/AfricanCastingView'
import { FanBusyView } from './components/FanBusyView'
import { FanTribeView } from './components/FanTribeView'
import { LeakedZoneView } from './components/LeakedZoneView'
import { AppShell } from './components/AppShell'
import { CreatorsView } from './components/CreatorsView'
import { ProfileView } from './components/ProfileView'
import {
  DropDetailView,
  DropsListView,
  navigateToDropsList,
} from './components/DropsView'
import { LoginView } from './components/LoginView'
import { SitePicker } from './components/SitePicker'
import {
  type AppSite,
  clearSession,
  readSession,
  type SessionState,
  writeSession,
} from './lib/session'
import { WatchView } from './components/WatchView'
import { useFavorites } from './lib/favorites'
import { wet3AssetUrl, placeholderImage } from './lib/wet3'

type AppRoute =
  | { view: 'creators' }
  | { view: 'twitter' }
  | { view: 'drops' }
  | { view: 'favorites' }
  | { view: 'drop'; dropId: number }
  | { view: 'profile'; username: string; from?: 'creators' | 'twitter' | 'drops' }
  | { view: 'watch'; mediaId: string }

type ProfileBack = 'creators' | 'twitter' | 'drops'

const BROWSE_HASH_KEY = 'wetaccess:browseHash'
const TWITTER_BROWSE_HASH_KEY = 'wetaccess:twitterBrowseHash'
const PROFILE_BACK_KEY = 'wetaccess:profileBack'

function parseRoute(): AppRoute {
  const watchMatch = window.location.hash.match(/^#\/watch\/([^/?#]+)/)

  if (watchMatch) {
    return { view: 'watch', mediaId: decodeURIComponent(watchMatch[1]) }
  }

  const profileMatch = window.location.hash.match(/^#\/user\/([^/?#]+)/)

  if (profileMatch) {
    const hash = window.location.hash
    const queryStart = hash.indexOf('?')
    const params = new URLSearchParams(
      queryStart >= 0 ? hash.slice(queryStart + 1) : '',
    )
    const fromRaw = params.get('from') ?? sessionStorage.getItem(PROFILE_BACK_KEY)
    const from: ProfileBack | undefined =
      fromRaw === 'twitter' || fromRaw === 'drops' || fromRaw === 'creators'
        ? fromRaw
        : undefined
    return {
      view: 'profile',
      username: decodeURIComponent(profileMatch[1]),
      from,
    }
  }

  const dropMatch = window.location.hash.match(/^#\/drops\/(\d+)/)

  if (dropMatch) {
    return { view: 'drop', dropId: Number(dropMatch[1]) }
  }

  if (window.location.hash.startsWith('#/drops')) {
    return { view: 'drops' }
  }

  if (window.location.hash.startsWith('#/favorites')) {
    return { view: 'favorites' }
  }

  if (window.location.hash.startsWith('#/twitter')) {
    return { view: 'twitter' }
  }

  return { view: 'creators' }
}

function navigateToCreators() {
  const savedBrowseHash = sessionStorage.getItem(BROWSE_HASH_KEY)
  window.location.hash = savedBrowseHash || '#/'
}

function navigateToTwitter() {
  const saved = sessionStorage.getItem(TWITTER_BROWSE_HASH_KEY)
  window.location.hash = saved || '#/twitter'
}

function profileBackTarget(from?: ProfileBack): ProfileBack {
  if (from === 'twitter' || from === 'drops' || from === 'creators') {
    return from
  }
  const stored = sessionStorage.getItem(PROFILE_BACK_KEY)
  if (stored === 'twitter' || stored === 'drops') {
    return stored
  }
  return 'creators'
}

function App() {
  const [session, setSession] = useState<SessionState>(() => readSession())

  function persist(next: SessionState) {
    writeSession(next)
    setSession(next)
  }

  function handleLogin() {
    persist({ loggedIn: true, site: null })
  }

  function handlePickSite(site: AppSite) {
    persist({ loggedIn: true, site })
    window.location.hash = '#/'
  }

  function handleSwitchSite() {
    persist({ loggedIn: true, site: null })
    window.location.hash = '#/'
  }

  function handleLogout() {
    clearSession()
    setSession({ loggedIn: false, site: null })
    window.location.hash = '#/'
  }

  if (!session.loggedIn) {
    return <LoginView onSuccess={handleLogin} />
  }

  if (!session.site) {
    return <SitePicker onPick={handlePickSite} onLogout={handleLogout} />
  }

  if (session.site === 'africancasting') {
    return (
      <AfricanCastingView
        onSwitchSite={handleSwitchSite}
        onLogout={handleLogout}
      />
    )
  }

  if (session.site === 'fanbusy') {
    return (
      <FanBusyView
        onSwitchSite={handleSwitchSite}
        onLogout={handleLogout}
      />
    )
  }

  if (session.site === 'fantribe') {
    return (
      <FanTribeView
        onSwitchSite={handleSwitchSite}
        onLogout={handleLogout}
      />
    )
  }

  if (session.site === 'leakedzone') {
    return (
      <LeakedZoneView
        onSwitchSite={handleSwitchSite}
        onLogout={handleLogout}
      />
    )
  }

  return (
    <WetaccessApp onSwitchSite={handleSwitchSite} onLogout={handleLogout} />
  )
}

type WetaccessAppProps = {
  onSwitchSite: () => void
  onLogout: () => void
}

function WetAccessFavoritesView() {
  const { items, toggle, clear, count } = useFavorites('wetaccess')

  function handleImageError(e: SyntheticEvent<HTMLImageElement>) {
    e.currentTarget.src = placeholderImage()
  }

  return (
    <>
      <section className="relative overflow-hidden mb-7 p-7 max-md:p-[18px] max-md:mb-[18px] border border-border rounded-3xl bg-gradient-to-br from-accent/[0.08] via-transparent to-transparent bg-surface shadow-sm">
        <div className="absolute -right-[10%] -bottom-[60%] w-[280px] h-[280px] rounded-full bg-[radial-gradient(circle,rgba(224,100,152,0.16),transparent_68%)] pointer-events-none" />
        <p className="m-0 mb-2.5 text-accent text-xs font-bold tracking-[0.14em] uppercase">
          Saved
        </p>
        <h1 className="m-0 max-w-[12ch] font-display text-[clamp(1.75rem,8vw,2.4rem)] md:text-[clamp(2.2rem,6vw,3.4rem)] leading-[0.95] font-[800] tracking-tight">
          Your favorites
        </h1>
        <p className="mt-3.5 m-0 max-w-[48ch] text-muted text-[15px] max-md:text-sm">
          {count} saved creator{count !== 1 ? 's' : ''}
        </p>
      </section>

      {items.length === 0 ? (
        <p className="m-0 py-12 px-5 text-center text-muted text-[15px] border border-dashed border-border rounded-2xl bg-white/[0.02]">
          No favorites yet. Click the heart on any creator to save them here.
        </p>
      ) : (
        <>
          <div className="flex justify-end mb-4">
            <button
              type="button"
              className="border border-border rounded-full px-3.5 py-2 text-xs font-semibold tracking-wide uppercase bg-card hover:border-danger/35 hover:bg-danger/10 hover:text-danger transition-all cursor-pointer"
              onClick={() => { if (window.confirm('Clear all WetAccess favorites?')) clear('wetaccess') }}
            >
              Clear all
            </button>
          </div>
          <section className="grid grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3.5 max-md:gap-3">
            {items.map((fav) => (
              <div
                key={fav.id}
                className="group relative grid gap-3.5 max-md:gap-2.5 text-left p-4 max-md:p-3 border border-border bg-card rounded-2xl transition-all hover:-translate-y-0.5 hover:border-accent/30 hover:bg-card-hover hover:shadow-lg"
              >
                <a
                  href={fav.url || `#/user/${encodeURIComponent(fav.id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="contents no-underline text-inherit"
                >
                  <img
                    className="w-full aspect-square rounded-[18px] object-cover bg-inset"
                    src={fav.thumb || placeholderImage()}
                    alt=""
                    loading="lazy"
                    onError={handleImageError}
                  />
                  <div className="grid gap-1 min-w-0">
                    <strong className="font-display text-[15px] font-bold">
                      {fav.title}
                    </strong>
                    {fav.meta ? (
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-muted">
                        {fav.meta}
                      </span>
                    ) : null}
                  </div>
                </a>
                <button
                  type="button"
                  className="absolute top-2 right-2 w-8 h-8 grid place-items-center rounded-full bg-black/50 text-red-400 text-sm opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer border-none hover:bg-black/70 hover:text-red-300"
                  aria-label="Remove from favorites"
                  onClick={() => toggle({ id: fav.id, site: 'wetaccess', title: fav.title })}
                >
                  ❤
                </button>
              </div>
            ))}
          </section>
        </>
      )}
    </>
  )
}

function WetaccessApp({ onSwitchSite, onLogout }: WetaccessAppProps) {
  const [route, setRoute] = useState(parseRoute)
  const { count: favCount } = useFavorites('wetaccess')
  const shellExtra = { onSwitchSite, onLogout, favCount }

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  if (route.view === 'watch') {
    return (
      <AppShell
        activeNav="creators"
        breadcrumb={`watch ${route.mediaId}`}
        backLabel="Back"
        onHome={() => window.history.back()}
        onBack={() => window.history.back()}
        {...shellExtra}
      >
        <WatchView mediaId={route.mediaId} />
      </AppShell>
    )
  }

  if (route.view === 'profile') {
    const backTo = profileBackTarget(route.from)
    const onBack =
      backTo === 'drops'
        ? navigateToDropsList
        : backTo === 'twitter'
          ? navigateToTwitter
          : navigateToCreators

    return (
      <AppShell
        activeNav={backTo}
        breadcrumb={`@${route.username}`}
        backLabel={
          backTo === 'drops'
            ? 'All drops'
            : backTo === 'twitter'
              ? 'Twitter creators'
              : 'All creators'
        }
        onHome={onBack}
        onBack={onBack}
        {...shellExtra}
      >
        <ProfileView username={route.username} />
      </AppShell>
    )
  }

  if (route.view === 'drop') {
    return (
      <AppShell
        activeNav="drops"
        breadcrumb={`#${route.dropId}`}
        backLabel="All drops"
        onHome={navigateToDropsList}
        onBack={navigateToDropsList}
        {...shellExtra}
      >
        <DropDetailView dropId={route.dropId} />
      </AppShell>
    )
  }

  if (route.view === 'drops') {
    return (
      <AppShell activeNav="drops" onHome={navigateToCreators} {...shellExtra}>
        <DropsListView />
      </AppShell>
    )
  }

  if (route.view === 'favorites') {
    return (
      <AppShell activeNav="favorites" onHome={navigateToCreators} {...shellExtra}>
        <WetAccessFavoritesView />
      </AppShell>
    )
  }

  if (route.view === 'twitter') {
    return (
      <AppShell activeNav="twitter" onHome={navigateToTwitter} {...shellExtra}>
        <CreatorsView twitterOnly />
      </AppShell>
    )
  }

  return (
    <AppShell activeNav="creators" onHome={navigateToCreators} {...shellExtra}>
      <CreatorsView />
    </AppShell>
  )
}

export default App
