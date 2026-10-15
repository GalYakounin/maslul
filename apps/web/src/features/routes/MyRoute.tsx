import { useState } from 'react';
import {
  sortStops,
  translateDbError,
  PAYMENT_LABELS,
  type RouteWithStops,
} from '@delivery/shared';
import { supabase } from '../../lib/supabase';

// המסלול של השליח, בסדר שנקבע. הסדר הוא כל המוצר — לכן הוא מוצג
// כרשימה ממוספרת ולא כאוסף.
//
// `delivered_at` נכתב כאן, וזו החצי השנייה של פונקציית המטרה:
// Σ(זמן הגעה − ready_at). בלי הרגע הזה אין מה למדוד, ושלב 6 מאבד
// את הבסיס להשוואה.

export function MyRoute({ route, onChanged }: { route: RouteWithStops; onChanged: () => void }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const stops = sortStops(route.route_stops ?? []);
  const dispatched = route.status === 'dispatched';
  const remaining = stops.filter((s) => s.deliveries?.status !== 'delivered').length;

  async function markDelivered(deliveryId: string) {
    setError('');
    setBusyId(deliveryId);

    const { data, error: updateError } = await supabase
      .from('deliveries')
      .update({ status: 'delivered', delivered_at: new Date().toISOString() })
      .eq('delivery_id', deliveryId)
      .select('delivery_id');

    setBusyId(null);

    if (updateError) {
      setError(translateDbError(updateError));
      return;
    }
    if (!data || data.length === 0) {
      setError('לא הצלחנו לעדכן את המשלוח. ודאו שהמסלול יצא לדרך.');
      return;
    }

    onChanged();
  }

  return (
    <section className="space-y-3">
      <div className="rounded-xl bg-surface p-4 shadow">
        <p className="text-sm text-text-muted">
          {dispatched ? 'המסלול שלכם' : 'מסלול חדש — ממתין ליציאה'}
        </p>
        <p className="text-xl font-bold">
          {stops.length} עצירות{dispatched ? ` · נותרו ${remaining}` : ''}
        </p>
        {!dispatched && (
          <p className="mt-1 text-sm text-text-muted">
            אפשרו לבעל העסק לסמן שיצאתם, ואז תוכלו לסמן מסירות.
          </p>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <ol className="space-y-3">
        {stops.map((stop, index) => {
          const delivery = stop.deliveries;
          const done = delivery?.status === 'delivered';

          return (
            <li
              key={stop.delivery_id}
              className={`rounded-xl bg-surface p-4 shadow ${done ? 'opacity-50' : ''}`}
            >
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-white">
                  {index + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="font-bold">{delivery?.address}</p>
                  {delivery?.address_note && (
                    <p className="text-sm text-text-muted">{delivery.address_note}</p>
                  )}
                  {delivery?.customer_name && <p className="text-sm">{delivery.customer_name}</p>}

                  {delivery?.customer_phone && (
                    <a href={`tel:${delivery.customer_phone}`} className="text-sm text-secondary">
                      {delivery.customer_phone}
                    </a>
                  )}

                  {delivery && (
                    <p className="mt-1 text-sm text-text-muted">
                      {(delivery.price_agorot / 100).toFixed(2)} ₪ ·{' '}
                      {PAYMENT_LABELS[delivery.payment_method]}
                    </p>
                  )}
                </div>
              </div>

              {dispatched && !done && (
                <button
                  onClick={() => markDelivered(stop.delivery_id)}
                  disabled={busyId === stop.delivery_id}
                  className="mt-3 w-full rounded-lg bg-primary px-4 py-3 text-white hover:bg-primary-dark disabled:opacity-50"
                >
                  {busyId === stop.delivery_id ? 'מעדכן...' : 'נמסר'}
                </button>
              )}

              {done && <p className="mt-2 text-sm text-text-muted">נמסר</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
