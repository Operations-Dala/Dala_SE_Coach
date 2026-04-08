import { redirect } from 'next/navigation';

import AdminLoginForm from '@/app/components/AdminLoginForm';
import { shouldEnforceAdminApiAuth } from '@/lib/admin-auth';

export const metadata = {
  title: 'Admin Login | SE Coach',
};

export default async function LoginPage({ searchParams }) {
  if (!shouldEnforceAdminApiAuth()) {
    redirect('/');
  }

  const params = await searchParams;
  const nextPath = typeof params?.next === 'string' ? params.next : '/';
  const setupRequired = params?.setup === '1';

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(239,68,68,0.12),_transparent_35%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-4">
      <div className="w-full max-w-md rounded-3xl border border-white/70 bg-white/90 p-8 shadow-[0_24px_60px_rgba(15,23,42,0.14)] backdrop-blur">
        <AdminLoginForm nextPath={nextPath} setupRequired={setupRequired} />
      </div>
    </div>
  );
}
