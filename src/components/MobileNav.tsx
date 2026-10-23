'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface MobileNavProps {
  userInitial: string;
}

interface NavItem {
  href: string;
  label: string;
  exact?: boolean;
  fab?: boolean;
  avatar?: boolean;
  icon?: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Inicio',
    exact: true,
    icon: (
      <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" strokeWidth={1.9} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    href: '/dashboard/meetings',
    label: 'Reuniones',
    icon: (
      <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" strokeWidth={1.9} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
      </svg>
    ),
  },
  {
    href: '/dashboard/meetings/new',
    label: 'Nueva',
    fab: true,
    icon: (
      <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" strokeWidth={2.4} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
      </svg>
    ),
  },
  {
    href: '/dashboard/action-items',
    label: 'Tareas',
    icon: (
      <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" strokeWidth={1.9} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    // Antes «Perfil»: es la pantalla de ajustes (tema, avisos, instalar, datos),
    // y con ese nombre nadie la encontraba.
    href: '/dashboard/profile',
    label: 'Ajustes',
    avatar: true,
  },
];

/**
 * Barra inferior del móvil: flotante y redondeada, separada del borde, con la
 * sección activa resaltada en una píldora y «Nueva» elevado en el centro.
 */
export default function MobileNav({ userInitial }: MobileNavProps) {
  const pathname = usePathname() || '';

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    if (href === '/dashboard/meetings' && pathname.startsWith('/dashboard/meetings/new')) return false;
    return pathname.startsWith(href);
  };

  return (
    <nav
      aria-label="Navegación principal"
      className="sm:hidden fixed bottom-safe inset-x-3 z-50 rounded-[1.75rem] bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200/70 dark:border-slate-700/60 shadow-[0_10px_40px_-10px_rgba(15,23,42,0.35)]"
    >
      <div className="grid grid-cols-5 items-center h-16 px-1.5">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href, item.exact);

          if (item.fab) {
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label="Nueva reunión"
                className="flex justify-center -mt-7"
              >
                <span className="relative w-[3.75rem] h-[3.75rem] rounded-full gradient-primary flex items-center justify-center shadow-xl shadow-blue-500/40 ring-4 ring-white dark:ring-slate-900 active:scale-95 transition-transform">
                  {item.icon}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className="flex flex-col items-center justify-center gap-0.5 h-full"
            >
              <span
                className={`flex items-center justify-center w-12 h-8 rounded-full transition-colors ${
                  active
                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-300 dark:bg-blue-400/15'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {item.avatar ? (
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center ${
                      active ? 'gradient-primary' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  >
                    <span className="text-white text-[10px] font-bold">{userInitial}</span>
                  </span>
                ) : (
                  item.icon
                )}
              </span>
              <span
                className={`text-[10px] font-medium leading-none ${
                  active ? 'text-blue-600 dark:text-blue-300' : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
