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
    <div className="min-h-screen flex items-center justify-center bg-[#0D0F14] px-4">
      <div className="max-w-md w-full space-y-8">
        
        <div className="text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-[#3D3669] border border-[#7C6FCD]/40 flex items-center justify-center">
            <span className="text-lg font-bold text-[#7C6FCD]">M</span>
          </div>
          <h2 className="mt-6 text-3xl font-bold text-[#F0EEF9]">
            Sign in to Mira
          </h2>
          <p className="mt-2 text-sm text-[#4A4760]">
            Your AI wellbeing companion
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">

            <div>
              <label className="block text-sm font-medium text-[#8B87A8] mb-2">
                Email address
              </label>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-[#151821] border border-[rgba(255,255,255,0.07)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7C6FCD] text-[#F0EEF9] placeholder-[#4A4760]"
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#8B87A8] mb-2">
                Password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-[#151821] border border-[rgba(255,255,255,0.07)] rounded-lg text-[#F0EEF9] placeholder-[#4A4760] focus:outline-none focus:border-[#7C6FCD] focus:ring-1 focus:ring-[#7C6FCD]"
                placeholder="Enter your password"
              />
            </div>

          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2 px-4 rounded-lg text-sm font-medium text-white bg-[#7C6FCD] hover:bg-[#6B5EBC] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              'Sign in'
            )}
          </button>

          <div className="text-center">
            <p className="text-sm text-[#4A4760]">
              Don&apos;t have an account?{' '}
              <a
                href="/auth/signup"
                className="font-medium text-[#7C6FCD] hover:text-[#6B5EBC]"
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