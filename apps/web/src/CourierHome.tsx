import {
  useShifts,
  useRoutes,
  Credits,
  type Me,
  type ShiftWithBusiness,
} from '@delivery/shared';
import { supabase } from './lib/supabase';
import { SignOutButton } from './components/SignOutButton';
import { ShiftInvites } from './features/shifts/ShiftInvites';
import { MyRoute } from './features/routes/MyRoute';

// ראו הערה מקבילה ב-Dashboard.tsx: המחרוזת חייבת להיות יציבה.
const SHIFTS_SELECT = '*, businesses(business_id, name, address, phone)';

export default function CourierHome({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
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
