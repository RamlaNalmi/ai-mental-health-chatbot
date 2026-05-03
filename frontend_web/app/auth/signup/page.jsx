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
    <div className="min-h-screen flex items-center justify-center bg-[#0D0F14] px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-[#3D3669] border border-[#7C6FCD]/40 flex items-center justify-center">
            <span className="text-lg font-bold text-[#7C6FCD]">M</span>
          </div>
          <h2 className="mt-6 text-3xl font-bold text-[#F0EEF9]">Create your Mira account</h2>
          <p className="mt-2 text-sm text-[#4A4760]">Start your wellbeing journey</p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-[#8B87A8] mb-2">
                Full name
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-[#151821] border border-[rgba(255,255,255,0.07)] rounded-lg text-[#F0EEF9] placeholder-[#4A4760] focus:outline-none focus:border-[#7C6FCD] focus:ring-1 focus:ring-[#7C6FCD]"
                placeholder="Enter your full name"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[#8B87A8] mb-2">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-[#151821] border border-[rgba(255,255,255,0.07)] rounded-lg text-[#F0EEF9] placeholder-[#4A4760] focus:outline-none focus:border-[#7C6FCD] focus:ring-1 focus:ring-[#7C6FCD]"
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[#8B87A8] mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-[#151821] border border-[rgba(255,255,255,0.07)] rounded-lg text-[#F0EEF9] placeholder-[#4A4760] focus:outline-none focus:border-[#7C6FCD] focus:ring-1 focus:ring-[#7C6FCD]"
                placeholder="Create a password"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-[#8B87A8] mb-2">
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 bg-[#151821] border border-[rgba(255,255,255,0.07)] rounded-lg text-[#F0EEF9] placeholder-[#4A4760] focus:outline-none focus:border-[#7C6FCD] focus:ring-1 focus:ring-[#7C6FCD]"
                placeholder="Confirm your password"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-[#7C6FCD] hover:bg-[#6B5EBC] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#7C6FCD] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                'Create account'
              )}
            </button>
          </div>

          <div className="text-center">
            <p className="text-sm text-[#4A4760]">
              Already have an account?{' '}
              <a
                href="/auth/signin"
                className="font-medium text-[#7C6FCD] hover:text-[#6B5EBC] transition-colors"
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
