'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { authAPI } from '../../../services/api'

export default function SignInPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mounted, setMounted] = useState(false)

  const router = useRouter()

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const result = await authAPI.signIn(email, password)

      localStorage.setItem('access_token', result.access_token)
      localStorage.setItem('refresh_token', result.refresh_token)
      console.log('[DEBUG] Tokens stored:', { access_token: result.access_token?.substring(0, 20) + '...', refresh_token: result.refresh_token?.substring(0, 20) + '...' })
      router.push('/chat')
    } catch (err) {
      setError(err.response?.data?.message || 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  // ✅ prevents hydration mismatch properly
  if (!mounted) return null

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
            Welcome back to <span style={{ color: '#b39ddb', fontStyle: 'italic' }}>MindfulChat</span>
          </h2>
          <p className="mt-3 text-lg" style={{ 
            fontFamily: 'Playfair Display, Georgia, serif',
            fontStyle: 'italic',
            fontWeight: '400',
            color: '#8a7a9e'
          }}>
            Your elegant AI wellness companion for mental clarity
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: '#6246a3', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                Email address
              </label>
              <input
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
              <label className="block text-sm font-medium mb-2" style={{ color: '#6246a3', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                Password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-primary w-full"
                placeholder="Enter your password"
              />
            </div>

          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full flex justify-center items-center"
          >
            {loading ? (
              <div className="loading-spinner" />
            ) : (
              'Sign in'
            )}
          </button>

          <div className="text-center">
            <p className="text-sm" style={{ color: '#8a7a9e', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              Don&apos;t have an account?{' '}
              <a
                href="/auth/signup"
                style={{ color: '#6246a3', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                className="font-medium hover:text-purple-d transition-colors"
              >
                Sign up
              </a>
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}