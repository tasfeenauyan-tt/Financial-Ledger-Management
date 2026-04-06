import { LogIn, Building2, User, Lock, Mail } from 'lucide-react';
import { loginWithGoogle, loginWithEmail } from '../firebase';
import React, { useState } from 'react';

export default function Login() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isManual, setIsManual] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Failed to login with Google');
    } finally {
      setLoading(false);
    }
  };

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await loginWithEmail(email, password);
    } catch (err: any) {
      console.error('Login error:', err);
      setError('Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-indigo-200">
            <Building2 className="text-white" size={32} />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-slate-900">TriloyTech Financial Ledger</h1>
            <p className="text-slate-500">Secure Access Portal</p>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 text-rose-600 text-sm font-medium rounded-xl border border-rose-100">
              {error}
            </div>
          )}

          {!isManual ? (
            <div className="space-y-4">
              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white border-2 border-slate-200 hover:border-indigo-600 hover:bg-slate-50 text-slate-700 font-bold rounded-2xl transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-slate-300 border-t-indigo-600 rounded-full animate-spin" />
                ) : (
                  <LogIn className="group-hover:text-indigo-600 transition-colors" size={20} />
                )}
                Admin Sign in with Google
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-slate-400">Or Team Member Access</span>
                </div>
              </div>

              <button
                onClick={() => setIsManual(true)}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-slate-50 border-2 border-transparent hover:bg-slate-100 text-slate-600 font-bold rounded-2xl transition-all"
              >
                <User size={20} />
                Sign in with Email & Password
              </button>
            </div>
          ) : (
            <form onSubmit={handleManualLogin} className="space-y-4 text-left">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 ml-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 ml-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  'Sign In'
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsManual(false)}
                className="w-full text-center text-sm font-semibold text-slate-500 hover:text-indigo-600 transition-colors"
              >
                Back to Google Sign In
              </button>
            </form>
          )}

          <p className="text-xs text-slate-400">
            Secure access for authorized personnel only.
          </p>
        </div>
      </div>
    </div>
  );
}
