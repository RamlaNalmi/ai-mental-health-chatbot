'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authAPI } from '../../../services/api'

export default function SignUpPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    try {
      const result = await authAPI.signUp(email, password, name)
      localStorage.setItem('token', result.token)
      router.push('/chat')
    } catch (err) {
      setError(err.response?.data?.message || 'Sign up failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'linear-gradient(160deg, #fefcff 0%, #f4effe 35%, #ede4fc 65%, #f8f4ff 100%)' }}>
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 rounded-2xl shadow-2xl flex items-center justify-center animate-float" style={{ background: 'linear-gradient(135deg, #8b6bbf, #7c4dbe)' }}>
            <span className="text-2xl font-bold text-white">MC</span>
          </div>
          <h2 className="mt-8 text-4xl font-bold" style={{ 
            fontFamily: 'Playfair Display, Georgia, serif',
            fontWeight: '700',
            lineHeight: '0.92',
            letterSpacing: '-0.03em',
            color: '#6246a3'
          }}>
            Create your <span style={{ color: '#b39ddb', fontStyle: 'italic' }}>MindfulChat</span> account
          </h2>
          <p className="mt-3 text-lg" style={{ 
            fontFamily: 'Playfair Display, Georgia, serif',
            fontStyle: 'italic',
            fontWeight: '400',
            color: '#8a7a9e'
          }}>
            Start your elegant wellness journey
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium mb-2" style={{ color: '#6246a3', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                Full name
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-primary w-full"
                placeholder="Enter your full name"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2" style={{ color: '#6246a3', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-primary w-full"
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-2" style={{ color: '#6246a3', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-primary w-full"
                placeholder="Create a password"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2" style={{ color: '#c7b8ea', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-primary w-full"
                placeholder="Confirm your password"
              />
            </div>
          </div>

          {error && (
            <div style={{ 
              background: 'rgba(239,68,68,0.1)', 
              border: '1px solid rgba(239,68,68,0.2)', 
              borderRadius: '12px', 
              padding: '12px 16px' 
            }}>
              <p style={{ fontSize: '0.875rem', color: '#dc2626', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{error}</p>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex justify-center items-center"
              style={{ fontSize: '0.84rem', padding: '15px 38px' }}
            >
              {loading ? (
                <div className="loading-spinner" />
              ) : (
                'Create account'
              )}
            </button>
          </div>

          <div className="text-center">
            <p style={{ 
              fontSize: '0.875rem', 
              color: '#8a7a9e', 
              fontFamily: 'Plus Jakarta Sans, sans-serif' 
            }}>
              Already have an account?{' '}
              <a
                href="/auth/signin"
                style={{ 
                  color: '#6246a3', 
                  fontFamily: 'Plus Jakarta Sans, sans-serif',
                  fontWeight: '500'
                }}
                className="font-medium hover:text-purple-d transition-colors"
              >
                Sign in
              </a>
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}
