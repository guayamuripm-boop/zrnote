'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function SignupPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      const { error: insertError } = await supabase.from('users').insert({
        id: data.user.id,
        full_name: fullName,
        email: email,
        role: 'participant',
      });

      if (insertError) {
        setError('Error al crear perfil: ' + insertError.message);
        setLoading(false);
        return;
      }
    }

    router.push('/dashboard');
    router.refresh();
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-8 bg-zr-pattern">
      <div className="w-full max-w-sm space-y-6 bg-white/95 backdrop-blur-sm rounded-2xl p-8 shadow-2xl">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="bg-zr-blue text-white font-bold text-lg px-2 py-1 rounded-lg font-raleway">
              ZR
            </div>
            <span className="text-zr-navy font-raleway font-bold text-lg">Mecacademy</span>
          </div>
          <h1 className="text-2xl font-bold text-zr-navy font-raleway">Crear Cuenta</h1>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zr-navy mb-1">Nombre completo</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="w-full border border-zr-blue-pale rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-zr-blue focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zr-navy mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-zr-blue-pale rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-zr-blue focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zr-navy mb-1">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full border border-zr-blue-pale rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-zr-blue focus:border-transparent"
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-zr-blue text-white py-3 rounded-lg font-medium hover:bg-zr-navy transition disabled:opacity-50 font-raleway"
          >
            {loading ? 'Creando...' : 'Crear Cuenta'}
          </button>
        </form>

        <p className="text-center text-sm text-zr-blue-mid">
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="underline hover:text-zr-navy font-medium">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
