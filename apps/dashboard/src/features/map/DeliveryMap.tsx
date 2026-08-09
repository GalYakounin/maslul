import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { translateDbError, type Business, type Delivery } from '@delivery/shared';
import { supabase } from '../../lib/supabase';

// המפה קיימת בשביל שני דברים, והשני חשוב יותר:
//   1. לראות איפה המשלוחים הפתוחים.
//   2. **לנעוץ ידנית** משלוח שאין לו מיקום. 18% מכתובות באר שבע הגיעו
//      במקור בלי קואורדינטות, ובלי נעיצה הן לעולם לא ייכנסו למסלול.
//
// Leaflet רגיל, בלי react-leaflet: כל מה שנדרש כאן הוא מפה, סיכות
// וקליק — עטיפה נוספת לא מוסיפה דבר ומוסיפה תלות.
//
// אין שימוש בסמלי ברירת המחדל של Leaflet (הם נשענים על נתיבי תמונות
// שנשברים תחת bundler). divIcon עם טוקני הצבע שלנו פותר גם את זה
// וגם מאפשר לקודד משמעות בצבע.

const ISRAEL_CENTER: [number, number] = [31.4, 34.9];

function dot(color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="background:${color};width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.3)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

const ICONS = {
  business: dot('var(--color-primary)'),
  precise: dot('var(--color-secondary)'),
  approximate: dot('var(--color-danger)'),
};

function needsPin(delivery: Delivery): boolean {
  return delivery.lat === null || delivery.geocode_status === 'pending';
}

export function DeliveryMap({
  business,
  deliveries,
  onChanged,
}: {
  business: Business;
  deliveries: Delivery[];
  onChanged: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null);

  const [pinning, setPinning] = useState<Delivery | null>(null);
  const pinningRef = useRef<Delivery | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  pinningRef.current = pinning;

  const open = deliveries.filter((d) => d.status === 'new' || d.status === 'ready');
  const unplaced = open.filter(needsPin);

  // יצירת המפה פעם אחת. הקליק קורא את מצב הנעיצה דרך ref ולא דרך
  // closure — אחרת היינו צריכים לבנות את המפה מחדש בכל שינוי מצב.
  useEffect(() => {
    if (!container.current || map.current) return;

    const instance = L.map(container.current).setView(ISRAEL_CENTER, 8);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(instance);

    instance.on('click', (event: L.LeafletMouseEvent) => {
      const target = pinningRef.current;
      if (target) void placePin(target, event.latlng.lat, event.latlng.lng);
    });

    map.current = instance;
    markers.current = L.layerGroup().addTo(instance);

    return () => {
      instance.remove();
      map.current = null;
      markers.current = null;
    };
  }, []);

  // ציור מחדש של הסיכות בכל שינוי במשלוחים.
  useEffect(() => {
    const layer = markers.current;
    const instance = map.current;
    if (!layer || !instance) return;

    layer.clearLayers();

    const points: [number, number][] = [];

    if (business.lat !== null && business.lng !== null) {
      L.marker([business.lat, business.lng], { icon: ICONS.business })
        .bindTooltip(business.name, { direction: 'top' })
        .addTo(layer);
      points.push([business.lat, business.lng]);
    }

    for (const delivery of open) {
      if (delivery.lat === null || delivery.lng === null) continue;
      const approximate = delivery.geocode_status === 'pending';
      L.marker([delivery.lat, delivery.lng], {
        icon: approximate ? ICONS.approximate : ICONS.precise,
      })
        .bindTooltip(`${delivery.address}${approximate ? ' — מיקום מקורב' : ''}`, {
          direction: 'top',
        })
        .addTo(layer);
      points.push([delivery.lat, delivery.lng]);
    }

    if (points.length === 1) {
      instance.setView(points[0], 15);
    } else if (points.length > 1) {
      instance.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16 });
    }
  }, [business, deliveries]);

  async function placePin(delivery: Delivery, lat: number, lng: number) {
    setError('');
    setSaving(true);

    // geocode_status='manual' — אדם קבע את הנקודה, וזו הרשומה
    // האמינה ביותר שיש לנו. שונה מ-'pending', שמשמעו מיקום מקורב
    // שעדיין ממתין לאדם.
    const { data, error: updateError } = await supabase
      .from('deliveries')
      .update({ lat, lng, geocode_status: 'manual' })
      .eq('delivery_id', delivery.delivery_id)
      .select('delivery_id');

    setSaving(false);
    setPinning(null);

    if (updateError) {
      setError(translateDbError(updateError));
      return;
    }
    if (!data || data.length === 0) {
      setError('לא הצלחנו לשמור את המיקום. רעננו את הדף ונסו שוב.');
      return;
    }

    onChanged();
  }

  return (
    <section className="space-y-3">
      {pinning && (
        <div className="rounded-xl border border-primary bg-surface p-4">
          <p className="font-bold">לחצו על המפה במיקום של {pinning.address}</p>
          {pinning.address_note && (
            <p className="text-sm text-text-muted">{pinning.address_note}</p>
          )}
          <button
            onClick={() => setPinning(null)}
            className="mt-2 text-sm text-secondary"
            disabled={saving}
          >
            ביטול
          </button>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <div
        ref={container}
        className="h-80 w-full overflow-hidden rounded-xl border border-border"
        style={{ cursor: pinning ? 'crosshair' : '' }}
      />

      {unplaced.length > 0 && (
        <div className="rounded-xl bg-surface p-4 shadow">
          <h3 className="mb-2 font-bold">ממתינים למיקום ({unplaced.length})</h3>
          <p className="mb-3 text-sm text-text-muted">
            משלוחים אלה לא ייכנסו לחישוב מסלול עד שייקבע להם מיקום מדויק.
          </p>
          <ul className="space-y-2">
            {unplaced.map((delivery) => (
              <li key={delivery.delivery_id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm">{delivery.address}</p>
                  <p className="text-xs text-text-muted">
                    {delivery.lat === null ? 'ללא מיקום' : 'מיקום מקורב'}
                  </p>
                </div>
                <button
                  onClick={() => setPinning(delivery)}
                  className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-sm text-white hover:bg-primary-dark"
                >
                  נעיצה על המפה
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
