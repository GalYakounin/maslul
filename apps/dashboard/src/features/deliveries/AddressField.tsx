import { useState } from 'react';
import { useAddressSearch, type AddressSuggestion } from '@delivery/shared';
import { supabase } from '../../lib/supabase';

// שדה כתובת עם הצעות. בחירה מהרשימה היא מה שמצרף קואורדינטות לכתובת.
//
// אבל לא כל בחירה שווה: אימות מול OSM הראה שבגוש דן מספרי הבתים קיימים,
// ובבאר שבע כמעט תמיד חסרים. הצעה בלי מספר בית מחזירה את מרכז הרחוב,
// ולכן היא מוצגת כאן כמסומנת במפורש ולא כהצלחה. המשתמש צריך לראות
// את ההבדל ברגע הבחירה, לא לגלות אותו כששליח עומד בכתובת הלא נכונה.
//
// הקלדה חופשית בלי בחירה נשארת מותרת: בשעת עומס אסור שהמערכת תחסום
// הזנת משלוח רק כי OSM לא מכיר את הכתובת.

export type Precision = 'none' | 'street' | 'exact';

export function AddressField({
  value,
  onChange,
  onPick,
  precision,
}: {
  value: string;
  onChange: (value: string) => void;
  onPick: (suggestion: AddressSuggestion) => void;
  precision: Precision;
}) {
  const [open, setOpen] = useState(false);
  const { suggestions, searching, failed } = useAddressSearch(supabase, open ? value : '');

  return (
    <div className="space-y-1">
      <label className="block text-sm text-text-muted">כתובת</label>

      <input
        type="text"
        required
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="רחוב ומספר בית"
        className="w-full rounded-lg border border-border px-3 py-2"
      />

      {open && value.trim().length >= 3 && (
        <div className="rounded-lg border border-border">
          {searching && <p className="px-3 py-2 text-sm text-text-muted">מחפש...</p>}

          {!searching &&
            suggestions.map((suggestion) => (
              <button
                key={`${suggestion.lat},${suggestion.lng},${suggestion.label}`}
                type="button"
                onClick={() => {
                  onPick(suggestion);
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-right text-sm hover:bg-surface"
              >
                {suggestion.label}
                {!suggestion.precise && (
                  <span className="text-text-muted"> — ללא מספר בית, מיקום מקורב</span>
                )}
              </button>
            ))}

          {!searching && suggestions.length === 0 && (
            <p className="px-3 py-2 text-sm text-text-muted">
              {failed
                ? 'חיפוש הכתובות אינו זמין כרגע. אפשר להקליד את הכתובת ולהמשיך.'
                : 'לא נמצאה כתובת מתאימה. אפשר להקליד אותה ידנית ולהמשיך.'}
            </p>
          )}
        </div>
      )}

      {precision === 'street' && (
        <p className="text-xs text-danger">
          נבחר מרכז הרחוב. המיקום מקורב ויידרש דיוק ידני על המפה.
        </p>
      )}

      {precision === 'none' && value.trim().length > 0 && (
        <p className="text-xs text-text-muted">
          הכתובת תישמר בלי מיקום על המפה. עדיף לבחור מהרשימה.
        </p>
      )}
    </div>
  );
}
