import { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Autenticación',
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}