import React, { useState } from 'react';
import {
  Shield,
  Activity,
  Sparkles,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import BrandLogo, { BRAND_NAME } from '../components/BrandLogo';
import { C } from '../theme/colors';

const CAPABILITIES = [
  { icon: Shield, label: 'Unified threat detection across 19 security integrations' },
  { icon: Activity, label: 'Governance, compliance & policy control frameworks' },
  { icon: Sparkles, label: 'AI security, model risk & incident response' },
];

const SSO_PROVIDERS = ['Microsoft Entra ID', 'Okta', 'SAML 2.0'];

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Enter your email and password to continue.');
      return;
    }

    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      onLogin({ remember });
    }, 650);
  };

  const handleSso = (provider) => {
    setError('');
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      onLogin({ remember, provider });
    }, 500);
  };

  return (
    <div
      className="font-display min-h-screen flex"
      style={{ background: C.bg, color: C.ink }}
    >
      {/* Left — logo & branding */}
      <aside
        className="hidden md:flex md:w-[46%] lg:w-[44%] flex-col justify-between p-10 xl:p-14"
        style={{
          background: `linear-gradient(180deg, ${C.sidebar} 0%, ${C.sidebarSoft} 100%)`,
          borderRight: `1px solid ${C.borderDark}`,
        }}
      >
        <div className="flex-1 flex flex-col items-center justify-center">
          <BrandLogo variant="panel" />

          <p
            className="mt-12 text-sm text-center max-w-sm leading-relaxed"
            style={{ color: '#94a3b8' }}
          >
            Unified command centre for security, governance & AI security
          </p>

          <ul className="mt-10 space-y-4 w-full max-w-sm">
            {CAPABILITIES.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex items-start gap-3 px-4 py-3"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10 }}
              >
                <span
                  className="mt-0.5 w-8 h-8 flex-shrink-0 flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 8 }}
                >
                  <Icon size={15} style={{ color: C.accent }} strokeWidth={2} />
                </span>
                <span className="text-sm" style={{ color: '#cbd5e1' }}>
                  {label}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p
          className="text-[10px] font-mono-num uppercase tracking-wider text-center"
          style={{ color: '#475569' }}
        >
          Authorized personnel only · Session audited
        </p>
      </aside>

      {/* Right — sign-in */}
      <main className="flex-1 flex flex-col justify-center px-6 py-10 sm:px-12 lg:px-16 xl:px-20 overflow-y-auto">
        <div
          className="w-full max-w-[430px] mx-auto slide-in p-8 sm:p-9"
          style={{ background: 'rgba(255,255,255,0.9)', border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: C.shadow }}
        >
          {/* Mobile — compact logo above form */}
          <div className="mb-10 md:hidden flex justify-center">
            <BrandLogo variant="panel" />
          </div>

          <p
            className="text-[10px] uppercase tracking-[0.18em] font-mono-num font-medium mb-2"
            style={{ color: C.accent }}
          >
            Secure access
          </p>
          <h2 className="text-2xl font-semibold tracking-tight" style={{ color: C.ink }}>
            Sign in to {BRAND_NAME}
          </h2>
          <p className="mt-2 text-sm" style={{ color: C.inkSoft }}>
            Use your organization credentials or enterprise SSO.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {error && (
              <div
                className="text-[13px] px-3 py-2.5"
                style={{
                  background: '#fef2f2',
                  border: `1px solid #fecaca`,
                  borderRadius: 4,
                  color: C.crit,
                }}
                role="alert"
              >
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="login-email"
                className="block text-[11px] font-medium uppercase tracking-wide mb-1.5"
                style={{ color: C.inkSoft }}
              >
                Work email
              </label>
              <div className="relative">
                <Mail
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: C.inkMute }}
                />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="username"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="azure-input w-full pl-9 pr-3 py-2.5 text-[13px]"
                  style={{
                    color: C.ink,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="login-password"
                  className="text-[11px] font-medium uppercase tracking-wide"
                  style={{ color: C.inkSoft }}
                >
                  Password
                </label>
                <button
                  type="button"
                  className="text-[11px] font-medium hover:underline"
                  style={{ color: C.accent }}
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: C.inkMute }}
                />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="azure-input w-full pl-9 pr-10 py-2.5 text-[13px]"
                  style={{
                    color: C.ink,
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5"
                  style={{ color: C.inkMute }}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="rounded border"
                style={{ accentColor: C.accent }}
              />
              <span className="text-[13px]" style={{ color: C.inkSoft }}>
                Keep me signed in on this device
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-70"
              style={{ background: C.accent, borderRadius: 8 }}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight size={16} strokeWidth={2.2} />
                </>
              )}
            </button>
          </form>

          <div className="flex items-center gap-3 my-8">
            <div className="flex-1 h-px" style={{ background: C.border }} />
            <span className="text-[11px] font-mono-num" style={{ color: C.inkMute }}>
              OR SSO
            </span>
            <div className="flex-1 h-px" style={{ background: C.border }} />
          </div>

          <div className="space-y-2">
            {SSO_PROVIDERS.map((provider) => (
              <button
                key={provider}
                type="button"
                disabled={loading}
                onClick={() => handleSso(provider)}
                className="w-full py-2.5 text-[13px] font-medium transition-colors disabled:opacity-60"
                style={{
                  background: C.panel,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  color: C.ink,
                }}
              >
                Continue with {provider}
              </button>
            ))}
          </div>

          <p className="mt-10 text-center text-[11px] font-mono-num" style={{ color: C.inkMute }}>
            {BRAND_NAME} v2.4.1 · Demo — any credentials accepted
          </p>
        </div>
      </main>
    </div>
  );
}
