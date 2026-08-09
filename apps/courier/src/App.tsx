import { useState } from 'react';
import {
  useAuth,
  useMe,
  useShifts,
  useRoutes,
  Credits,
  type Me,
  type ShiftWithBusiness,
} from '@delivery/shared';
import { supabase } from './lib/supabase';
import { Login } from './features/auth/Login';
import { SignUp } from './features/auth/SignUp';
import { ShiftInvites } from './features/shifts/ShiftInvites';
import { MyRoute } from './features/routes/MyRoute';

// ראו הערה מקבילה ב-App.tsx של הדשבורד: המחרוזת חייבת להיות יציבה.
const SHIFTS_SELECT = '*, businesses(business_id, name, address, phone)';

export default function App() {
  const { session, loading, signOut } = useAuth();
  const { me, loading: meLoading } = useMe(supabase, !!session);
  const [screen, setScreen] = useState<'login' | 'signup'>('login');

  if (loading) return <CenteredMessage text="טוען..." />;

  if (!session) {
    return screen === 'login' ? (
      <Login onSwitchToSignUp={() => setScreen('signup')} />
    ) : (
      <SignUp onSwitchToLogin={() => setScreen('login')} />
    );
  }

  if (meLoading) return <CenteredMessage text="טוען פרטים..." />;

  if (me?.role !== 'courier' || !me.courier) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-text-muted">
          החשבון הזה אינו רשום כשליח. אם אתם בעלי עסק, השתמשו בלוח הבקרה.
        </p>
        <SignOutButton onClick={signOut} />
      </div>
    );
  }

  return <CourierHome me={me} onSignOut={signOut} />;
}

function CourierHome({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const { shifts, loading, refetch } = useShifts<ShiftWithBusiness>(supabase, {
    enabled: true,
    select: SHIFTS_SELECT,
    column: 'courier_id',
    value: me.courier?.courier_id,
  });

  const { routes, refetch: refetchRoutes } = useRoutes(
    supabase,
    'courier_id',
    me.courier?.courier_id
  );

  // מסלול חי אחד לכל היותר — אצווה סגורה, שליח אחד, יציאה אחת.
  const activeRoute = routes.find((r) => r.status === 'offered' || r.status === 'dispatched');

  return (
    <div className="mx-auto max-w-md space-y-5 p-5">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{me.courier?.name}</h1>
        <SignOutButton onClick={onSignOut} />
      </header>

      {activeRoute ? (
        <MyRoute route={activeRoute} onChanged={refetchRoutes} />
      ) : (
        <ShiftInvites shifts={shifts} loading={loading} onChanged={refetch} />
      )}

      <Credits />
    </div>
  );
}

function SignOutButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-border px-3 py-2 text-sm text-text-muted hover:border-text-muted"
    >
      התנתקות
    </button>
  );
}

function CenteredMessage({ text }: { text: string }) {
  return <div className="flex min-h-screen items-center justify-center text-text-muted">{text}</div>;
}
