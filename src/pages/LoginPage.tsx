import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, User, Eye, EyeOff, AlertCircle, FileSearch, Shield, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/store/authStore'

const FEATURES = [
  { icon: <TrendingUp className="h-5 w-5" />, text: 'Real-time tariff change monitoring and impact scoring' },
  { icon: <FileSearch className="h-5 w-5" />,  text: 'Customs entry analytics with IEEPA, Section 301 & 232 visibility' },
  { icon: <Shield className="h-5 w-5" />,      text: 'AES & ABI filing status tracking for US trade compliance' },
]

export function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const ok = await login(username, password)
    setLoading(false)
    if (ok) {
      navigate('/dashboard')
    } else {
      setError('Invalid credentials. Please try again.')
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div
        className="hidden lg:flex flex-col justify-between w-1/2 p-12 text-white"
        style={{ backgroundColor: '#073b49' }}
      >
        <div>
          <div className="flex items-start justify-between mb-12">
            <div className="bg-white rounded-lg px-4 py-2 inline-block">
              <img
                src="https://www.jdgroup.net/wp-content/uploads/2023/05/logo-jd-group@2.png"
                alt="JD Group"
                className="h-10 w-auto object-contain"
              />
            </div>
          </div>
          <h1 className="text-4xl font-bold leading-tight mb-4">Trade Compliance Portal</h1>
          <p className="text-teal-200 text-lg leading-relaxed mb-2">
            Real-time customs intelligence for Grupo JD operations
          </p>
          <p className="text-teal-300 text-sm leading-relaxed">
            Monitor tariff changes, track entries, and stay ahead of US trade policy.
          </p>
        </div>
        <div className="space-y-4">
          {FEATURES.map((f, i) => (
            <div key={i} className="flex items-start gap-3 text-sm text-teal-100">
              <span className="text-teal-300 mt-0.5 flex-shrink-0">{f.icon}</span>
              <span>{f.text}</span>
            </div>
          ))}
          <p className="text-xs text-teal-400 pt-4">
            © {new Date().getFullYear()} JD Group — Agencia Aduanal Jorge Díaz, S.C.
          </p>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex flex-1 items-center justify-center bg-slate-50 p-4 sm:p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden text-center mb-8">
            <img
              src="https://www.jdgroup.net/wp-content/uploads/2023/05/logo-jd-group@2.png"
              alt="JD Group"
              className="h-10 w-auto object-contain mx-auto mb-3"
            />
            <p className="text-sm text-slate-500">Trade Compliance Portal</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-xl font-bold text-slate-800 mb-1">Sign in</h2>
            <p className="text-xs text-slate-500 mb-6">Access your compliance dashboard</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-xs font-medium text-slate-700">Username</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="username or email"
                    className="pl-9"
                    autoComplete="username"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-medium text-slate-700">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-9 pr-9"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full rounded-full font-semibold"
                style={{ backgroundColor: '#3A6FF9' }}
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in…
                  </span>
                ) : 'Sign in'}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
