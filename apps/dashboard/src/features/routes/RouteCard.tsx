import { useState } from 'react';
import {
  sortStops,
  translateDbError,
  DELIVERY_STATUS_LABELS,
  ROUTE_STATUS_LABELS,
  type RouteWithStops,
} from '@delivery/shared';
import { supabase } from '../../lib/supabase';

// כרטיס מסלול. ניתן לעריכה **רק בטיוטה** — ברגע שנשלח לשליח הוא קופא.
// זה נובע ישירות מהאילוץ העסקי: אצווה שיצאה היא סגורה, ואין ניתוב
// מחדש תוך כדי נסיעה. מי שמציע לערוך מסלול משוגר סותר את הבסיס.

export function RouteCard({ route, onChanged }: { route: RouteWithStops; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const stops = sortStops(route.route_stops ?? []);
  const editable = route.status === 'draft';
  const deliveryIds = stops.map((s) => s.delivery_id);
  const deliveredCount = stops.filter((s) => s.deliveries?.status === 'delivered').length;

  async function run(action: () => Promise<{ error: unknown }>) {
    setError('');
    setBusy(true);
    const { error: actionError } = await action();
    setBusy(false);
    if (actionError) {
      setError(translateDbError(actionError));
      return;
    }
    onChanged();
  }

  // החלפת מקומות בין שתי עצירות. `sequence` הוא מספר רגיל בלי אילוץ
  // ייחודיות, ולכן החלפה פשוטה בטוחה.
  async function swap(indexA: number, indexB: number) {
    const a = stops[indexA];
    const b = stops[indexB];
    if (!a || !b) return;

    await run(async () => {
      const first = await supabase
        .from('route_stops')
        .update({ sequence: b.sequence })
        .eq('route_id', route.route_id)
        .eq('delivery_id', a.delivery_id);
      if (first.error) return { error: first.error };

      return await supabase
        .from('route_stops')
        .update({ sequence: a.sequence })
        .eq('route_id', route.route_id)
        .eq('delivery_id', b.delivery_id);
    });
  }

  const send = () =>
    run(async () => await supabase.from('routes').update({ status: 'offered' }).eq('route_id', route.route_id));

  // יציאה בפועל: המסלול משוגר, וכל המשלוחים נאספו יחד. picked_up_at
  // אחיד לכולם כי זו אצווה סגורה — השליח לקח את כולם באותו רגע.
  const dispatch = () =>
    run(async () => {
      const now = new Date().toISOString();
      const routeUpdate = await supabase
        .from('routes')
        .update({ status: 'dispatched', dispatched_at: now })
        .eq('route_id', route.route_id);
      if (routeUpdate.error) return { error: routeUpdate.error };

      return await supabase
        .from('deliveries')
        .update({ status: 'picked_up', picked_up_at: now })
        .in('delivery_id', deliveryIds);
    });

  // ביטול מחזיר את המשלוחים למאגר הפנוי, אחרת הם נעולים לנצח.
  const cancel = () =>
    run(async () => {
      const routeUpdate = await supabase
        .from('routes')
        .update({ status: 'cancelled' })
        .eq('route_id', route.route_id);
      if (routeUpdate.error) return { error: routeUpdate.error };

      return await supabase
        .from('deliveries')
        .update({ status: 'ready' })
        .in('delivery_id', deliveryIds);
    });

  return (
    <article className="rounded-xl bg-surface p-4 shadow">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="font-bold">{route.couriers?.name ?? 'ללא שליח'}</p>
          <p className="text-sm text-text-muted">
            {ROUTE_STATUS_LABELS[route.status]} · {stops.length} עצירות
            {route.status === 'dispatched' ? ` · נמסרו ${deliveredCount}` : ''}
          </p>
        </div>
      </header>

      <ol className="space-y-2">
        {stops.map((stop, index) => (
          <li key={stop.delivery_id} className="flex items-start gap-3 rounded-lg border border-border p-2">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-sm text-white">
              {index + 1}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate">{stop.deliveries?.address}</p>
              {stop.deliveries?.address_note && (
                <p className="text-sm text-text-muted">{stop.deliveries.address_note}</p>
              )}
              <p className="text-sm text-text-muted">
                {stop.deliveries ? DELIVERY_STATUS_LABELS[stop.deliveries.status] : ''}
              </p>
            </div>

            {editable && (
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => swap(index, index - 1)}
                  disabled={busy || index === 0}
                  className="rounded border border-border px-2 py-1 text-sm disabled:opacity-30"
                  aria-label="הזזה למעלה"
                >
                  ↑
                </button>
                <button
                  onClick={() => swap(index, index + 1)}
                  disabled={busy || index === stops.length - 1}
                  className="rounded border border-border px-2 py-1 text-sm disabled:opacity-30"
                  aria-label="הזזה למטה"
                >
                  ↓
                </button>
              </div>
            )}
          </li>
        ))}
      </ol>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <div className="mt-3 flex gap-2">
        {route.status === 'draft' && (
          <button
            onClick={send}
            disabled={busy || stops.length === 0}
            className="flex-1 rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-dark disabled:opacity-50"
          >
            שליחה לשליח
          </button>
        )}

        {route.status === 'offered' && (
          <button
            onClick={dispatch}
            disabled={busy}
            className="flex-1 rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-dark disabled:opacity-50"
          >
            השליח יצא
          </button>
        )}

        {/* השליח אינו רשאי לעדכן routes (אין לו policy), ולכן סגירת
            המסלול היא פעולה של בעל העסק — אחרי שכל העצירות נמסרו. */}
        {route.status === 'dispatched' && deliveredCount === stops.length && stops.length > 0 && (
          <button
            onClick={() =>
              run(async () =>
                await supabase
                  .from('routes')
                  .update({ status: 'completed', completed_at: new Date().toISOString() })
                  .eq('route_id', route.route_id)
              )
            }
            disabled={busy}
            className="flex-1 rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-dark disabled:opacity-50"
          >
            סגירת מסלול
          </button>
        )}

        {(route.status === 'draft' || route.status === 'offered') && (
          <button
            onClick={cancel}
            disabled={busy}
            className="rounded-lg border border-border px-4 py-2 text-sm text-text-muted hover:border-text-muted disabled:opacity-50"
          >
            ביטול
          </button>
        )}
      </div>
    </article>
  );
}
