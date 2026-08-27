import { type FormEvent, useState } from 'react'
import { validateCredentials } from '../lib/session'

type LoginViewProps = {
  onSuccess: () => void
}

export function LoginView({ onSuccess }: LoginViewProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!validateCredentials(username, password)) {
      setError('Invalid username or password')
      return
    }
    setError('')
    onSuccess()
  }

  return (
    <div className="min-h-svh grid place-items-center p-6">
      <form
        className="w-full max-w-[420px] p-7 border border-border rounded-xl bg-surface/90 shadow-lg grid gap-4"
        onSubmit={onSubmit}
      >
        <div className="flex items-center gap-3.5">
          <span className="min-w-[42px] h-[42px] px-2.5 rounded-xl grid place-items-center font-display text-[13px] font-[800] text-white bg-gradient-to-br from-accent to-[#c4004a]">
            WX
          </span>
          <div>
            <h1 className="m-0 font-display text-[1.45rem] tracking-tight">wetaccess</h1>
            <p className="mt-0.5 m-0 text-muted text-[0.92rem]">Sign in to choose a catalog</p>
          </div>
        </div>

        <label className="grid gap-1.5">
          <span className="text-[0.8rem] text-muted font-semibold tracking-wide uppercase">
            Username
          </span>
          <input
            className="w-full p-3 px-3.5 rounded-xl border border-border bg-inset text-foreground outline-none focus:border-accent/45 transition-colors"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-[0.8rem] text-muted font-semibold tracking-wide uppercase">
            Password
          </span>
          <input
            className="w-full p-3 px-3.5 rounded-xl border border-border bg-inset text-foreground outline-none focus:border-accent/45 transition-colors"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
          />
        </label>

        {error ? <p className="m-0 text-danger text-[0.9rem]">{error}</p> : null}

        <button
          type="submit"
          className="border-none rounded-xl p-3 px-4 font-bold cursor-pointer text-white bg-gradient-to-br from-accent to-[#c4004a] hover:brightness-[1.06] transition-all"
        >
          Continue
        </button>
      </form>
    </div>
  )
}
