'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function SignupPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      setLoading(false);
      return;
    }

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });

    if (authError) {
      setError(authError.message === 'User already registered'
        ? 'Este email ya está registrado'
        : authError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      const { error: insertError } = await supabase.from('users').insert({
        id: data.user.id,
        full_name: fullName,
        email: email,
        role: 'coordinator',
      });

      if (insertError) {
        setError('Error al crear perfil: ' + insertError.message);
        setLoading(false);
        return;
      }
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <main className="min-h-screen gradient-mesh relative overflow-hidden flex items-center justify-center p-4">
        <div className="absolute top-20 left-10 w-72 h-72 bg-indigo-400/20 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-indigo-300/15 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }} />

        <div className="relative z-10 w-full max-w-md">
          <div className="glass-strong rounded-3xl p-8 sm:p-10 shadow-float text-center">
            <div className="w-16 h-16 gradient-success rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-zr-navy dark:text-zr-blue-pale mb-2">¡Cuenta creada!</h1>
            <p className="text-zr-blue-mid/70 text-sm mb-8">
              Revisa tu email para confirmar tu cuenta y luego inicia sesión.
            </p>
            <Link
              href="/login"
              className="block w-full gradient-primary text-white py-3.5 rounded-xl font-medium hover:shadow-lg hover:shadow-indigo-500/25 transition-all duration-300"
            >
              Ir a Iniciar Sesión
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen gradient-mesh relative overflow-hidden flex items-center justify-center p-4">
      <div className="absolute top-20 left-10 w-72 h-72 bg-indigo-400/20 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-indigo-300/15 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }} />

      <div className="relative z-10 w-full max-w-md">
        <div className="glass-strong rounded-3xl p-8 sm:p-10 shadow-float">
          <Link href="/" className="flex items-center gap-2.5 mb-8">
            <div className="w-10 h-10 gradient-primary rounded-xl flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-sm">ZR</span>
            </div>
            <span className="text-zr-navy dark:text-zr-blue-pale font-bold text-lg">ZRNote</span>
          </Link>

          <h1 className="text-2xl font-bold text-zr-navy dark:text-zr-blue-pale mb-1">
            Crear Cuenta
          </h1>
          <p className="text-zr-blue-mid/70 text-sm mb-8">
            Empieza a crear minutas inteligentes
          </p>

          {error && (
            <div className="bg-indigo-50/80 border border-indigo-100 rounded-xl p-3 mb-6">
              <p className="text-indigo-700 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-zr-navy dark:text-zr-blue-pale mb-1.5">Nombre completo</label>
              <div className="relative">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-zr-blue-mid/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  placeholder="Tu nombre completo"
                  className="w-full pl-11 pr-4 py-3 rounded-xl border border-zr-blue-pale/50 bg-white/80 dark:bg-white/5 text-zr-navy dark:text-zr-blue-pale placeholder-zr-blue-mid/30 focus:outline-none focus:ring-2 focus:ring-zr-blue-mid/30 focus:border-zr-blue-mid transition text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zr-navy dark:text-zr-blue-pale mb-1.5">Email</label>
              <div className="relative">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-zr-blue-mid/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                </svg>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="tu@email.com"
                  className="w-full pl-11 pr-4 py-3 rounded-xl border border-zr-blue-pale/50 bg-white/80 dark:bg-white/5 text-zr-navy dark:text-zr-blue-pale placeholder-zr-blue-mid/30 focus:outline-none focus:ring-2 focus:ring-zr-blue-mid/30 focus:border-zr-blue-mid transition text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zr-navy dark:text-zr-blue-pale mb-1.5">Contraseña</label>
              <div className="relative">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-zr-blue-mid/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Mínimo 6 caracteres"
                  className="w-full pl-11 pr-11 py-3 rounded-xl border border-zr-blue-pale/50 bg-white/80 dark:bg-white/5 text-zr-navy dark:text-zr-blue-pale placeholder-zr-blue-mid/30 focus:outline-none focus:ring-2 focus:ring-zr-blue-mid/30 focus:border-zr-blue-mid transition text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zr-blue-mid/40 hover:text-zr-blue-mid transition"
                >
                  {showPassword ? (
                    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zr-navy dark:text-zr-blue-pale mb-1.5">Confirmar Contraseña</label>
              <div className="relative">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-zr-blue-mid/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Repite tu contraseña"
                  className="w-full pl-11 pr-4 py-3 rounded-xl border border-zr-blue-pale/50 bg-white/80 dark:bg-white/5 text-zr-navy dark:text-zr-blue-pale placeholder-zr-blue-mid/30 focus:outline-none focus:ring-2 focus:ring-zr-blue-mid/30 focus:border-zr-blue-mid transition text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full gradient-primary text-white py-3.5 rounded-xl font-medium hover:shadow-lg hover:shadow-indigo-500/25 transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creando...
                </span>
              ) : 'Crear Cuenta'}
            </button>
          </form>

          <p className="text-center text-sm text-zr-blue-mid/60 mt-8">
            ¿Ya tienes cuenta?{' '}
            <Link href="/login" className="text-zr-blue font-medium hover:text-zr-navy dark:hover:text-zr-blue-pale transition">
              Iniciar sesión
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
