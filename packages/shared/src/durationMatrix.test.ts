import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getDurationMatrix } from './durationMatrix';
import type { Point } from './optimize';

// החוזה שנבדק כאן הוא "נופל רך": כשהספק אינו זמין מוחזרת הערכה
// **ומסומנת ככזו**. הסימון הוא העיקר — הערכה שמוצגת כנתון אמיתי היא
// אותו כשל של קואורדינטה שגויה בשקט, בשכבה אחרת.

const POINTS: Point[] = [
  { lat: 31.2362, lng: 34.789 },
  { lat: 31.2421, lng: 34.7914 },
  { lat: 31.2426, lng: 34.7975 },
];

/** קליינט מזויף — רק `functions.invoke` נדרש כאן. */
function fakeClient(invoke: () => Promise<unknown>) {
  return { functions: { invoke } } as unknown as SupabaseClient;
}

describe('getDurationMatrix', () => {
  it('מחזיר את מטריצת הספק כשהקריאה מצליחה', async () => {
    const durations = [
      [0, 100, 200],
      [100, 0, 150],
      [200, 150, 0],
    ];
    const result = await getDurationMatrix(
      fakeClient(async () => ({ data: { durations }, error: null })),
      POINTS
    );
    expect(result.source).toBe('provider');
    expect(result.durations).toEqual(durations);
    expect(result.reason).toBeUndefined();
  });

  it('נופל להערכה כשהספק מחזיר שגיאה, ומסמן זאת', async () => {
    const result = await getDurationMatrix(
      fakeClient(async () => ({ data: null, error: new Error('boom') })),
      POINTS
    );
    expect(result.source).toBe('estimate');
    expect(result.reason).toBeTruthy();
    expect(result.durations).toHaveLength(POINTS.length);
  });

  it('נופל להערכה גם כשהקריאה זורקת', async () => {
    const result = await getDurationMatrix(
      fakeClient(async () => {
        throw new Error('network down');
      }),
      POINTS
    );
    expect(result.source).toBe('estimate');
  });

  it('דוחה מטריצה בגודל שגוי במקום להשתמש בה', async () => {
    // מטריצה קטנה מדי הייתה מייצרת undefined בחישוב ואז NaN, וסדר
    // שרירותי שנראה תקין לחלוטין על המסך.
    const result = await getDurationMatrix(
      fakeClient(async () => ({ data: { durations: [[0, 1]] }, error: null })),
      POINTS
    );
    expect(result.source).toBe('estimate');
  });

  it('ההערכה היא מטריצה שמישה — סימטרית ואפס באלכסון', async () => {
    const { durations } = await getDurationMatrix(
      fakeClient(async () => ({ data: null, error: new Error('x') })),
      POINTS
    );
    for (let i = 0; i < POINTS.length; i++) {
      expect(durations[i][i]).toBe(0);
      for (let j = 0; j < POINTS.length; j++) {
        expect(durations[i][j]).toBeCloseTo(durations[j][i], 6);
      }
    }
  });
});
