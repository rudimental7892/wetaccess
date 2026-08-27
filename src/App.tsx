import {
  useEffect,
  useState,
} from 'react'
import './App.css'
import { AfricanCastingView } from './components/AfricanCastingView'
import { FanBusyView } from './components/FanBusyView'
import { FanTribeView } from './components/FanTribeView'
import { LeakedZoneView } from './components/LeakedZoneView'
import { SwitCityView } from './components/SwitCityView'
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

type AppRoute =
  | { view: 'creators' }
  | { view: 'twitter' }
  | { view: 'drops' }
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

  if (session.site === 'switcity') {
    return (
      <SwitCityView
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

function WetaccessApp({ onSwitchSite, onLogout }: WetaccessAppProps) {
  const [route, setRoute] = useState(parseRoute)
  const shellExtra = { onSwitchSite, onLogout }

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
