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
    <div className="gate">
      <form className="gate-card" onSubmit={onSubmit}>
        <div className="gate-brand">
          <span className="gate-mark">WX</span>
          <div>
            <h1>wetaccess</h1>
            <p>Sign in to choose a catalog</p>
          </div>
        </div>

        <label className="gate-field">
          <span>Username</span>
          <input
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
          />
        </label>

        <label className="gate-field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
          />
        </label>

        {error ? <p className="gate-error">{error}</p> : null}

        <button type="submit" className="gate-submit">
          Continue
        </button>
      </form>
    </div>
  )
}
