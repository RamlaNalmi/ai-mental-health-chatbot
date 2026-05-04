'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DarkModeToggle from '../components/DarkModeToggle'

export default function LandingPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleGetStarted = () => {
    router.push('/auth/signup')
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #fefcff 0%, #f4effe 35%, #ede4fc 65%, #f8f4ff 100%)' }}>
      {/* Navigation */}
      <nav className="glass">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-2">
              <div className="h-10 w-10 rounded-xl shadow-lg flex items-center justify-center animate-float" style={{ background: 'linear-gradient(135deg, #8b6bbf, #7c4dbe)' }}>
                <span className="text-lg font-bold text-white">MC</span>
              </div>
              <span className="text-2xl font-bold text-gradient" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>Mindful<span style={{ color: '#b39ddb', fontStyle: 'italic' }}>Chat</span></span>
            </div>
            
            <div className="flex items-center space-x-6">
              {mounted && <DarkModeToggle />}
              <Link 
                href="/auth/signin" 
                className="text-purple-700 hover:text-purple-d font-medium transition-colors"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                Sign In
              </Link>
              {mounted && (
                <button 
                  onClick={handleGetStarted}
                  className="btn-primary"
                  suppressHydrationWarning={true}
                >
                  Get Started
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            {/* Hero Badge */}
            <div className="inline-flex items-center gap-2 mb-8" style={{ 
              fontSize: '0.71rem', 
              fontWeight: '600', 
              letterSpacing: '0.16em', 
              textTransform: 'uppercase',
              color: '#6246a3',
              background: 'rgba(139,107,191,0.1)',
              border: '1px solid rgba(139,107,191,0.22)',
              padding: '7px 18px', 
              borderRadius: '100px',
              fontFamily: 'Plus Jakarta Sans, sans-serif'
            }}>
              <div className="w-2 h-2 rounded-full" style={{ background: '#8b6bbf', animation: 'pulse 2.8s ease-in-out infinite' }}></div>
              AI Wellness Companion
            </div>

            {/* Hero Logo */}
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-2xl shadow-2xl flex items-center justify-center animate-float" style={{ background: 'linear-gradient(135deg, #8b6bbf, #7c4dbe)' }}>
                <span className="text-2xl font-bold text-white">MC</span>
              </div>
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6" style={{ 
              fontFamily: 'Playfair Display, Georgia, serif',
              fontWeight: '700',
              lineHeight: '0.92',
              letterSpacing: '-0.03em',
              color: '#6246a3'
            }}>
              Your Elegant AI
              <br />
              <span style={{ color: '#b39ddb', fontStyle: 'italic' }}>Wellness Journey</span>
            </h1>
            
            <p className="text-xl sm:text-2xl mb-8 max-w-3xl mx-auto" style={{ 
              fontFamily: 'Playfair Display, Georgia, serif',
              fontStyle: 'italic',
              fontWeight: '400',
              color: '#8a7a9e'
            }}>
              Experience personalized mental wellness support with elegant AI technology. 
              Track your stress levels, get intelligent insights, and find your path to mental clarity.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              {mounted && (
                <button 
                  onClick={handleGetStarted}
                  className="btn-primary"
                  style={{ fontSize: '0.84rem', padding: '15px 38px' }}
                  suppressHydrationWarning={true}
                >
                  Start Your Elegant Journey
                </button>
              )}
              <Link 
                href="/auth/signin"
                className="btn-secondary"
                style={{ fontSize: '0.84rem', padding: '12px 28px' }}
              >
                I Already Have an Account
              </Link>
            </div>

            {/* Email Signup */}
            <div className="max-w-md mx-auto">
              <div className="flex flex-col sm:flex-row gap-3">
                <input 
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="input-primary flex-1"
                />
                {mounted && (
                  <button 
                    onClick={handleGetStarted}
                    className="btn-primary px-6"
                    suppressHydrationWarning={true}
                  >
                    Get Started
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8" style={{ background: 'var(--misty)' }}>
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            {/* Section Eyebrow */}
            <div className="inline-flex items-center gap-2 mb-4" style={{ 
              fontSize: '0.7rem', 
              fontWeight: '600', 
              letterSpacing: '0.2em', 
              textTransform: 'uppercase',
              color: '#8b6bbf',
              fontFamily: 'Plus Jakarta Sans, sans-serif'
            }}>
              <div className="h-1.5 w-9" style={{ background: '#c4aee8' }}></div>
              Elegant Features
            </div>
            
            <h2 className="text-4xl font-bold mb-4" style={{ 
              fontFamily: 'Playfair Display, Georgia, serif',
              fontWeight: '500',
              lineHeight: '1.1',
              letterSpacing: '-0.02em',
              color: '#2d2640'
            }}>
              Beautiful <em style={{ color: '#6246a3' }}>Wellness</em> Features
            </h2>
            <p className="text-xl" style={{ color: '#8a7a9e', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              Cutting-edge technology for comprehensive mental health support
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="card p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center animate-float" style={{ background: 'linear-gradient(135deg, #8b6bbf, #7c4dbe)' }}>
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div className="text-xs font-semibold mb-3" style={{ 
                fontWeight: '600', 
                letterSpacing: '0.14em', 
                textTransform: 'uppercase',
                color: '#8b6bbf',
                fontFamily: 'Plus Jakarta Sans, sans-serif'
              }}>
                Smart Detection
              </div>
              <h3 className="text-xl font-semibold mb-3" style={{ 
                fontFamily: 'Playfair Display, Georgia, serif',
                fontWeight: '600',
                color: '#2d2640'
              }}>
                Elegant Stress Analysis
              </h3>
              <p style={{ color: '#4a4060', fontFamily: 'Plus Jakarta Sans, sans-serif', lineHeight: '1.82' }}>
                Advanced AI analyzes your voice, facial expressions, and typing patterns to detect stress levels in real-time.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="card-beautiful p-8 text-center group hover:scale-105 transition-transform">
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-coral-500 to-pink-500 flex items-center justify-center group-hover:shadow-xl transition-shadow animate-float">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-coral-900 dark:text-coral-100 mb-3">
                Beautiful Conversations
              </h3>
              <p className="text-coral-700 dark:text-coral-300">
                Natural, empathetic conversations that adapt to your emotional state and provide personalized support.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="card-beautiful p-8 text-center group hover:scale-105 transition-transform">
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-mint-500 to-sky-500 flex items-center justify-center group-hover:shadow-xl transition-shadow animate-float">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-mint-900 dark:text-mint-100 mb-3">
                Beautiful Analytics
              </h3>
              <p className="text-mint-700 dark:text-mint-300">
                Comprehensive insights and trends to help you understand your mental health patterns over time.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="card-elevated p-8 text-center group hover:scale-105 transition-transform">
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center group-hover:shadow-xl transition-shadow">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-purple-900 dark:text-purple-100 mb-3">
                Voice Analysis
              </h3>
              <p className="text-purple-700 dark:text-purple-300">
                Advanced voice processing analyzes tone, pitch, and patterns to detect emotional states and stress indicators.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="card-elevated p-8 text-center group hover:scale-105 transition-transform">
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center group-hover:shadow-xl transition-shadow">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-purple-900 dark:text-purple-100 mb-3">
                Personalized Support
              </h3>
              <p className="text-purple-700 dark:text-purple-300">
                Tailored recommendations and coping strategies based on your unique stress patterns and preferences.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="card-elevated p-8 text-center group hover:scale-105 transition-transform">
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center group-hover:shadow-xl transition-shadow">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-purple-900 dark:text-purple-100 mb-3">
                24/7 Availability
              </h3>
              <p className="text-purple-700 dark:text-purple-300">
                Round-the-clock support whenever you need it, with intelligent responses that understand your context.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="card-elevated p-12">
            <h2 className="text-4xl font-bold gradient-text mb-6">
              Ready to Transform Your Mental Wellness?
            </h2>
            <p className="text-xl text-purple-700 dark:text-purple-300 mb-8">
              Join thousands of users who have found clarity and peace with MindfulChat.
            </p>
            {mounted && (
              <button 
                onClick={handleGetStarted}
                className="btn-primary text-lg px-8 py-4"
                suppressHydrationWarning={true}
              >
                Start Your Free Journey
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-purple-200 dark:border-purple-800 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-2 mb-4 md:mb-0">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-600 to-purple-800 flex items-center justify-center">
                <span className="text-sm font-bold text-white">MC</span>
              </div>
              <span className="text-lg font-semibold gradient-text">MindfulChat</span>
            </div>
            
            <div className="text-purple-600 dark:text-purple-400 text-sm">
              © 2024 MindfulChat. Your journey to mental clarity starts here.
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
