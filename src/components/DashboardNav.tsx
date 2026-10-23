'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ZRLogo from '@/components/ZRLogo';
import ThemeToggle from '@/components/ThemeToggle';
import InstallAppButton from '@/components/InstallAppButton';

/**
 * Barra superior de escritorio.
 *
 * Flotante y en forma de píldora, con la sección activa marcada (antes no se
 * sabía en qué pantalla estabas), «Nueva» siempre a mano y acceso directo a
 * Ayuda y Ajustes — que antes sólo se alcanzaban pulsando el círculo de la
 * inicial, sin ninguna pista de que ahí estuvieran.
 *
 * El tour de bienvenida apunta a estos enlaces por su `href` y a
 * `data-tour="action-items"` / `data-tour="install"`: no cambiarlos sin
 * revisar OnboardingTour.tsx.
 */

const LINKS: { href: string; label: string; exact?: boolean; tour?: string }[] = [
  { href: '/dashboard', label: 'Inicio', exact: true },
  { href: '/dashboard/meetings', label: 'Reuniones' },
  { href: '/dashboard/action-items', label: 'Tareas', tour: 'action-items' },
];

export default function DashboardNav({ userInitial, version }: { userInitial: string; version: string }) {
  const pathname = usePathname() || '';

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    // «Reuniones» no debe quedar activo dentro de «Nueva reunión».
    if (href === '/dashboard/meetings' && pathname.startsWith('/dashboard/meetings/new')) return false;
    return pathname.startsWith(href);
  };

  const iconBtn =
    'w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-900/5 dark:hover:bg-white/10 transition';

  return (
    <nav className="hidden sm:block sticky top-0 z-50 px-4 sm:px-6 lg:px-8 pt-3">
      <div className="max-w-7xl mx-auto glass-strong rounded-2xl px-3 lg:px-4">
        <div className="flex items-center justify-between h-14 gap-3">
          <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0">
            <ZRLogo className="w-8 h-8 rounded-xl shadow-md" />
            <span className="font-bold text-slate-900 dark:text-slate-100 tracking-tight hidden md:block">ZR Note</span>
            <span className="hidden lg:inline-flex px-1.5 py-0.5 text-[10px] font-mono font-medium text-blue-500 bg-blue-50 dark:bg-blue-950/50 rounded-md border border-blue-200 dark:border-blue-800">
              v{version}
            </span>
          </Link>

          {/* Selector de sección: una píldora con la activa resaltada. */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/[0.04] dark:bg-white/[0.06]">
            {LINKS.map((l) => {
              const active = isActive(l.href, l.exact);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  data-tour={l.tour}
                  aria-current={active ? 'page' : undefined}
                  className={`px-3 lg:px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    active
                      ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Link
              href="/dashboard/meetings/new"
              className="hidden md:inline-flex items-center gap-1.5 gradient-primary text-white pl-3 pr-4 py-2 rounded-xl text-sm font-semibold shadow-md shadow-blue-500/25 hover:shadow-lg hover:shadow-blue-500/30 hover:-translate-y-0.5 transition-all mr-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.4} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Nueva
            </Link>

            <span data-tour="install"><InstallAppButton iconOnly /></span>
            <ThemeToggle />
            <Link href="/dashboard/ayuda" className={iconBtn} aria-label="Ayuda" title="Ayuda">
              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={1.9} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </Link>
            <Link
              href="/dashboard/profile"
              className={`flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-xl transition ml-0.5 ${
                pathname.startsWith('/dashboard/profile')
                  ? 'bg-blue-500/10 text-blue-600 dark:text-blue-300'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-900/5 dark:hover:bg-white/10'
              }`}
              aria-label="Ajustes"
              title="Ajustes"
            >
              <span className="w-7 h-7 gradient-primary rounded-full flex items-center justify-center shadow-sm">
                <span className="text-white text-xs font-bold">{userInitial}</span>
              </span>
              <svg className="w-4 h-4 hidden lg:block" fill="none" stroke="currentColor" strokeWidth={1.9} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
