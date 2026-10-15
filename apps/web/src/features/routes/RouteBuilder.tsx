import { useState } from 'react';
import {
  translateDbError,
  type Business,
  type Delivery,
  type RouteWithStops,
  type ShiftWithCourier,
} from '@delivery/shared';
import { supabase } from '../../lib/supabase';

// הרכבת אצווה. **כל יציאה היא אצווה סגורה** — שליח שיצא לא חוזר
// למסעדה באמצע לאסוף עוד. לכן ההרכבה קורית פעם אחת, כאן, לפני היציאה.
//
// אין כאן שורה של אופטימיזציה במכוון: אם בעל העסק לא מקבץ ידנית
// במסך הזה, אין טעם באלגוריתם בשלב 6. זו הבדיקה האמיתית של המוצר.

export function RouteBuilder({
  business,
  deliveries,
  routes,
  shifts,
  onCreated,
}: {
  business: Business;
  deliveries: Delivery[];
  routes: RouteWithStops[];
  shifts: ShiftWithCourier[];
  onCreated: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [courierId, setCourierId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // מועמדים לאצווה: מוכן או בהכנה, **ועדיין לא שובץ למסלול חי**.
  //
  // הסינון לפי סטטוס בלבד אינו מספיק, וזה לא היה גלוי בשלב 4: שם כל
  // מסלול שוגר מיד, מה שמעביר את המשלוחים ל-picked_up ומוציא אותם
  // מהרשימה. משלוח שיושב במסלול *טיוטה* נשאר 'ready' — ונשאר מועמד.
  // בחירה חוזרת בו נכשלת על אילוץ הייחודיות של route_stops.delivery_id.
  const assigned = new Set(
    routes
      .filter((r) => r.status === 'draft' || r.status === 'offered' || r.status === 'dispatched')
      .flatMap((r) => (r.route_stops ?? []).map((stop: { delivery_id: string }) => stop.delivery_id))
  );
  const candidates = deliveries.filter(
    (d) => (d.status === 'new' || d.status === 'ready') && !assigned.has(d.delivery_id)
  );
  const activeCouriers = shifts.filter((s) => s.status === 'active' && s.couriers);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function create() {
    setError('');
    const ids = [...selected];
    if (ids.length === 0 || !courierId) return;

    setSaving(true);

    const { data: route, error: routeError } = await supabase
      .from('routes')
      .insert({ business_id: business.business_id, courier_id: courierId, status: 'draft' })
      .select('route_id')
      .single();

    if (routeError || !route) {
      setSaving(false);
      setError(translateDbError(routeError));
      return;
    }

    // סדר הבחירה הוא הסדר ההתחלתי. בעל העסק מסדר מחדש בכרטיס המסלול.
    const stops = ids.map((delivery_id, index) => ({
      route_id: route.route_id,
      delivery_id,
      sequence: index + 1,
    }));

    const { error: stopsError } = await supabase.from('route_stops').insert(stops);
    if (stopsError) {
      setSaving(false);
      setError(translateDbError(stopsError));
      return;
    }

    const { error: statusError } = await supabase
      .from('deliveries')
      .update({ status: 'assigned' })
      .in('delivery_id', ids);

    setSaving(false);

    if (statusError) {
      setError(translateDbError(statusError));
      return;
    }

    setSelected(new Set());
    setCourierId('');
    onCreated();
  }

  if (activeCouriers.length === 0) {
    return (
      <p className="text-text-muted">
        אין שליחים במשמרת. הזמינו שליח בלשונית "שליחים" לפני שמרכיבים מסלול.
      </p>
    );
  }

  if (candidates.length === 0) {
    return <p className="text-text-muted">אין משלוחים פנויים לשיבוץ.</p>;
  }

  const overSize = selected.size > business.batch_max_size;

  return (
    <section className="rounded-xl bg-surface p-5 shadow">
      <h2 className="mb-3 text-lg font-bold">מסלול חדש</h2>

      <ul className="mb-3 space-y-2">
        {candidates.map((delivery) => (
          <li key={delivery.delivery_id}>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={selected.has(delivery.delivery_id)}
                onChange={() => toggle(delivery.delivery_id)}
                className="mt-1 h-5 w-5 shrink-0"
              />
              <span className="min-w-0">
                <span className="block">{delivery.address}</span>
                <span className="block text-sm text-text-muted">
                  {delivery.customer_name ? `${delivery.customer_name} · ` : ''}
                  {delivery.status === 'ready' ? 'מוכן לאיסוף' : 'בהכנה'}
                  {delivery.lat === null ? ' · ללא מיקום' : ''}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="space-y-1">
        <label className="block text-sm text-text-muted">שליח</label>
        <select
          value={courierId}
          onChange={(e) => setCourierId(e.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2"
        >
          <option value="">בחרו שליח</option>
          {activeCouriers.map((shift) => (
            <option key={shift.shift_id} value={shift.courier_id}>
              {shift.couriers?.name}
            </option>
          ))}
        </select>
      </div>

      {overSize && (
        <p className="mt-2 text-sm text-danger">
          נבחרו {selected.size} משלוחים, והעסק הוגדר ל-{business.batch_max_size} לאצווה. אפשר
          להמשיך — זו אזהרה, לא חסימה.
        </p>
      )}

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <button
        onClick={create}
        disabled={saving || selected.size === 0 || !courierId}
        className="mt-3 w-full rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-dark disabled:opacity-50"
      >
        {saving ? 'יוצר...' : `יצירת מסלול (${selected.size})`}
      </button>
    </section>
  );
}
