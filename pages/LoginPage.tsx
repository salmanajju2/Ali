import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/* ── Eye icon ── */
const Eye = ({ open }: { open: boolean }) => open
  ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
  : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>;

const LoginPage: React.FC = () => {
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();

  const friendlyError = (err: any) => {
    const code = err?.code || '';
    if (code === 'auth/user-not-found')         return 'Yeh email registered nahi hai.';
    if (code === 'auth/wrong-password')         return 'Password galat hai.';
    if (code === 'auth/invalid-email')          return 'Email address sahi nahi hai.';
    if (code === 'auth/invalid-credential')     return 'Email ya password galat hai.';
    if (code === 'auth/too-many-requests')      return 'Bahut zyada attempts. Thodi der baad try karein.';
    if (code === 'auth/network-request-failed') return 'Network error. Internet check karein.';
    return err?.message || 'Login failed. Please try again.';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(friendlyError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: 'linear-gradient(135deg, #F5F7FF 0%, #EEF2FF 40%, #EDE9FE 100%)',
      }}
    >
      {/* Decorative elements */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="absolute -top-32 -left-32 h-80 w-80 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)' }}
        />
        <div
          className="absolute -bottom-32 -right-32 h-80 w-80 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.10) 0%, transparent 70%)' }}
        />
        <div
          className="absolute top-1/3 right-1/4 h-48 w-48 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 70%)' }}
        />
        {/* Decorative dots */}
        <div className="absolute top-20 right-20 opacity-30">
          {[...Array(9)].map((_, i) => (
            <div key={i} className="inline-block m-1.5 w-1.5 h-1.5 rounded-full" style={{ background: '#6366F1' }} />
          ))}
        </div>
      </div>

      <div className="relative w-full max-w-sm animate-in scale-in">

        {/* Card */}
        <div
          className="rounded-3xl p-8"
          style={{
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(224,231,255,0.8)',
            boxShadow: '0 20px 60px rgba(99,102,241,0.15), 0 8px 20px rgba(99,102,241,0.08)',
          }}
        >
          {/* Logo & Title */}
          <div className="text-center mb-8">
            <div
              className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
              style={{
                background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
                boxShadow: '0 8px 24px rgba(99,102,241,0.40)',
              }}
            >
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
            <h1
              className="text-2xl font-black tracking-tight"
              style={{ color: '#1E1B4B' }}
            >
              ALI ENTERPRISES
            </h1>
            <p
              className="text-[11px] font-bold uppercase tracking-widest mt-1.5"
              style={{ color: '#6366F1' }}
            >
              Sign in to continue
            </p>
          </div>

          {/* Error */}
          {error && (
            <div
              className="mb-5 px-4 py-3 rounded-2xl text-sm font-medium text-center"
              style={{
                background: '#FFF1F2',
                border: '1px solid #FECDD3',
                color: '#E11D48',
              }}
            >
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Email */}
            <div>
              <label
                className="block text-[11px] font-black uppercase tracking-widest mb-1.5 ml-1"
                style={{ color: '#6366F1' }}
              >
                Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#A5B4FC' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                  </svg>
                </div>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-3 rounded-2xl text-sm outline-none transition-all"
                  style={{
                    background: '#F5F7FF',
                    border: '1.5px solid #E0E7FF',
                    color: '#1E1B4B',
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = '#818CF8';
                    e.target.style.background = '#fff';
                    e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)';
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = '#E0E7FF';
                    e.target.style.background = '#F5F7FF';
                    e.target.style.boxShadow = 'none';
                  }}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label
                className="block text-[11px] font-black uppercase tracking-widest mb-1.5 ml-1"
                style={{ color: '#6366F1' }}
              >
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#A5B4FC' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                  </svg>
                </div>
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-12 py-3 rounded-2xl text-sm outline-none transition-all"
                  style={{
                    background: '#F5F7FF',
                    border: '1.5px solid #E0E7FF',
                    color: '#1E1B4B',
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = '#818CF8';
                    e.target.style.background = '#fff';
                    e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)';
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = '#E0E7FF';
                    e.target.style.background = '#F5F7FF';
                    e.target.style.boxShadow = 'none';
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-colors"
                  style={{ color: '#A5B4FC' }}
                >
                  <Eye open={showPw} />
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 rounded-2xl font-black text-sm uppercase tracking-widest text-white transition-all mt-2 active:scale-95 disabled:opacity-60"
              style={{
                background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
                boxShadow: '0 6px 20px rgba(99,102,241,0.40)',
              }}
            >
              {isLoading
                ? <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Please wait…
                  </span>
                : 'Sign In'
              }
            </button>
          </form>

          {/* Info note */}
          <div
            className="mt-6 px-4 py-3 rounded-2xl text-center"
            style={{
              background: '#F5F7FF',
              border: '1px solid #E0E7FF',
            }}
          >
            <p
              className="text-[10px] font-bold uppercase tracking-widest leading-relaxed"
              style={{ color: '#9CA3AF' }}
            >
              🔒 Access by invite only<br />Contact admin to get an account
            </p>
          </div>
        </div>

        <p
          className="text-center text-[10px] font-black uppercase tracking-widest mt-5"
          style={{ color: '#A5B4FC' }}
        >
          Transaction Management System
        </p>
      </div>
    </div>
  );
};

export default LoginPage;