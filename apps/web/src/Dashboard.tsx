import { useState } from 'react';
import {
  useShifts,
  useDeliveries,
  useRoutes,
  Credits,
  type Me,
  type ShiftWithCourier,
} from '@delivery/shared';
import { supabase } from './lib/supabase';
import { SignOutButton } from './components/SignOutButton';
import { InviteCourier } from './features/shifts/InviteCourier';
import { ShiftsList } from './features/shifts/ShiftsList';
import { NewDelivery } from './features/deliveries/NewDelivery';
import { DeliveriesList } from './features/deliveries/DeliveriesList';
import { BusinessLocation } from './features/business/BusinessLocation';
import { DeliveryMap } from './features/map/DeliveryMap';
import { RouteBuilder } from './features/routes/RouteBuilder';
import { RouteCard } from './features/routes/RouteCard';

// קבוע ברמת המודול — המחרוזת נכנסת לרשימת התלויות של useShifts, ואילו
// נבנתה מחדש בכל render היא הייתה מפילה ובונה את מנוי ה-Realtime בלולאה.
const SHIFTS_SELECT = '*, couriers(courier_id, name, phone, vehicle_type)';

type Tab = 'deliveries' | 'map' | 'routes' | 'shifts';

export default function Dashboard({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const business = me.business!;
  const businessId = business.business_id;

  const [tab, setTab] = useState<Tab>('deliveries');
  const [locationSaved, setLocationSaved] = useState(false);

  const { shifts, loading: shiftsLoading, refetch: refetchShifts } = useShifts<ShiftWithCourier>(
    supabase,
    { enabled: true, select: SHIFTS_SELECT, column: 'business_id', value: businessId }
  );

  const {
    deliveries,
    loading: deliveriesLoading,
    refetch: refetchDeliveries,
  } = useDeliveries(supabase, businessId);

  const { routes, refetch: refetchRoutes } = useRoutes(supabase, 'business_id', businessId);

  // מסלול שהסתיים או בוטל יורד מהמסך — הוא נשמר ב-DB להיסטוריה.
  const liveRoutes = routes.filter(
    (r) => r.status === 'draft' || r.status === 'offered' || r.status === 'dispatched'
  );

  function refreshAll() {
    refetchRoutes();
    refetchDeliveries();
  }

  const needsLocation = business.lat === null && !locationSaved;

  // מונה על לשונית המפה — משלוח בלי מיקום נעלם מהעין ברשימה, ואז
  // גם מהמסלול. המספר על הלשונית הוא מה שמחזיר אותו לתשומת הלב.
  const unplaced = deliveries.filter(
    (d) =>
      (d.status === 'new' || d.status === 'ready') &&
      (d.lat === null || d.geocode_status === 'pending')
  ).length;

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-5">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{business.name}</h1>
        <SignOutButton onClick={onSignOut} />
      </header>

      {needsLocation && (
        <BusinessLocation business={business} onSaved={() => setLocationSaved(true)} />
      )}

      <nav className="flex gap-2">
        <TabButton active={tab === 'deliveries'} onClick={() => setTab('deliveries')}>
          משלוחים
        </TabButton>
        <TabButton active={tab === 'map'} onClick={() => setTab('map')}>
          מפה{unplaced > 0 ? ` (${unplaced})` : ''}
        </TabButton>
        <TabButton active={tab === 'routes'} onClick={() => setTab('routes')}>
          מסלולים{liveRoutes.length > 0 ? ` (${liveRoutes.length})` : ''}
        </TabButton>
        <TabButton active={tab === 'shifts'} onClick={() => setTab('shifts')}>
          שליחים
        </TabButton>
      </nav>

      {tab === 'deliveries' && (
        <>
          <NewDelivery businessId={businessId} onCreated={refetchDeliveries} />
          <DeliveriesList
            deliveries={deliveries}
            loading={deliveriesLoading}
            onChanged={refetchDeliveries}
          />
        </>
      )}

      {tab === 'map' && (
        <DeliveryMap business={business} deliveries={deliveries} onChanged={refetchDeliveries} />
      )}

      {tab === 'routes' && (
        <>
          <RouteBuilder
            business={business}
            deliveries={deliveries}
            routes={liveRoutes}
            shifts={shifts}
            onCreated={refreshAll}
          />
          {liveRoutes.map((route) => (
            <RouteCard
              key={route.route_id}
              route={route}
              business={business}
              deliveries={deliveries}
              onChanged={refreshAll}
            />
          ))}
        </>
      )}

      {tab === 'shifts' && (
        <>
          <InviteCourier businessId={businessId} shifts={shifts} onInvited={refetchShifts} />
          <ShiftsList shifts={shifts} loading={shiftsLoading} onChanged={refetchShifts} />
        </>
      )}

      <Credits />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? 'rounded-lg bg-primary px-4 py-2 text-white'
          : 'rounded-lg border border-border px-4 py-2 text-text-muted hover:border-text-muted'
      }
    >
      {children}
    </button>
  );
}
