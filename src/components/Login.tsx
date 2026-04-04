import { LogIn, Building2 } from 'lucide-react';
import { loginWithGoogle } from '../firebase';
import { useState } from 'react';

export default function Login() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
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

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-indigo-200">
            <Building2 className="text-white" size={32} />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-slate-900">TriloyTech Financials</h1>
            <p className="text-slate-500">Admin Dashboard Access</p>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 text-rose-600 text-sm font-medium rounded-xl border border-rose-100">
              {error}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white border-2 border-slate-200 hover:border-indigo-600 hover:bg-slate-50 text-slate-700 font-bold rounded-2xl transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-slate-300 border-t-indigo-600 rounded-full animate-spin" />
            ) : (
              <LogIn className="group-hover:text-indigo-600 transition-colors" size={20} />
            )}
            Sign in with Google
          </button>

          <p className="text-xs text-slate-400">
            Secure access for authorized personnel only.
          </p>
        </div>
      </div>
    </div>
  );
}
