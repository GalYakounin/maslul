import { describe, it, expect } from 'vitest';
import {
  type DurationMatrix,
  type Point,
  bestOrder,
  fifoOrder,
  haversineMeters,
  nearestNeighbourOrder,
  permutations,
  randomOrder,
  totalArrivalTime,
  totalWait,
} from './optimize';

// הבדיקות כאן אינן מכסות קוד — הן מקבעות את הטענות שהתיעוד מבטיח.
// כל טענה ב-README ובאפיון שאפשר להפריך במספרים, מופיעה כאן כבדיקה.
// אם מישהו יחליף את פונקציית המטרה ב-TSP, שלוש מהן ייפלו מיד.

/** מטריצה אוקלידית ממישור מופשט. הדוגמאות בתיעוד אינן גיאוגרפיות. */
function euclideanMatrix(points: [number, number][]): DurationMatrix {
  return points.map(([ax, ay]) =>
    points.map(([bx, by]) => Math.hypot(bx - ax, by - ay))
  );
}

// ═══════════════ הדוגמה הנגדית מה-README ═══════════════
// R=(0,0), A=(1,0), B=(0,1), C=(10,10)
// אינדקסים: R=0, A=1, B=2, C=3
const COUNTEREXAMPLE = euclideanMatrix([
  [0, 0],
  [1, 0],
  [0, 1],
  [10, 10],
]);

describe('הדוגמה הנגדית: המעגל הקצר ביותר אינו הסדר הנכון', () => {
  const SHORTEST_CYCLE = [1, 3, 2]; // R→A→C→B
  const OPTIMAL = [1, 2, 3]; // R→A→B→C

  function cycleLength(order: number[], m: DurationMatrix) {
    let total = 0;
    let prev = 0;
    for (const s of order) {
      total += m[prev][s];
      prev = s;
    }
    return total + m[prev][0]; // כולל חזרה למסעדה — זה מה ש-TSP ממזער
  }

  it('R→A→C→B הוא באמת המעגל הקצר ביותר', () => {
    const stops = [1, 2, 3];
    let best = Infinity;
    for (const perm of permutations(stops)) {
      best = Math.min(best, cycleLength(perm, COUNTEREXAMPLE));
    }
    expect(cycleLength(SHORTEST_CYCLE, COUNTEREXAMPLE)).toBeCloseTo(best, 6);
    expect(best).toBeCloseTo(28.907, 2);
  });

  it('ושני כיווניו נותנים סכום המתנה 43.4 — פי 2.2 מהאופטימום', () => {
    const forward = totalArrivalTime(SHORTEST_CYCLE, COUNTEREXAMPLE);
    const backward = totalArrivalTime([...SHORTEST_CYCLE].reverse(), COUNTEREXAMPLE);

    expect(forward).toBeCloseTo(43.361, 2);
    // הנקודה כולה: בחירת כיוון לא מצילה. שני הכיוונים זהים.
    expect(backward).toBeCloseTo(forward, 6);
  });

  it('האופטימום הוא R→A→B→C עם 19.3, והוא מסלול *ארוך יותר*', () => {
    expect(bestOrder(COUNTEREXAMPLE)).toEqual(OPTIMAL);
    expect(totalArrivalTime(OPTIMAL, COUNTEREXAMPLE)).toBeCloseTo(19.282, 2);

    // זו השורה שהופכת את הטיעון לבדיקה: הסדר הנכון עולה יותר במרחק.
    expect(cycleLength(OPTIMAL, COUNTEREXAMPLE)).toBeGreaterThan(
      cycleLength(SHORTEST_CYCLE, COUNTEREXAMPLE)
    );
  });

  it('שכן קרוב נופל כאן בדיוק כמו TSP', () => {
    // A ו-B קרובים למסעדה ואחד לשני, ולכן שכן-קרוב מתחיל נכון —
    // אבל C הרחוק נשאר לסוף בשני המקרים. כאן הוא דווקא מוצא את
    // האופטימום; ראו הבדיקה הבאה למקרה שבו הוא נכשל.
    expect(nearestNeighbourOrder(COUNTEREXAMPLE)).toEqual(OPTIMAL);
  });
});

describe('שכן קרוב אינו אופטימלי', () => {
  it('נסחף לכיוון אחד ומשלם על החזרה', () => {
    // המסעדה באמצע. משמאל נקודה בודדת קרובה, מימין אשכול של שתיים.
    // שכן-קרוב יקפוץ שמאלה כי זה הכי קרוב, ואז יחצה את כל הרוחב.
    const m = euclideanMatrix([
      [0, 0], // R
      [-3, 0], // 1 — הקרובה ביותר למסעדה
      [4, 0], // 2
      [5, 0], // 3
    ]);

    const greedy = nearestNeighbourOrder(m);
    const optimal = bestOrder(m);

    expect(greedy).toEqual([1, 2, 3]);
    expect(optimal).toEqual([2, 3, 1]);
    expect(totalArrivalTime(optimal, m)).toBeLessThan(totalArrivalTime(greedy, m));
  });
});

// ═══════════════ הטענה המתמטית שהאפיון נשען עליה ═══════════════

describe('בתוך אצווה, מזעור זמני הגעה שקול למזעור המתנה', () => {
  const m = euclideanMatrix([
    [0, 0],
    [2, 1],
    [-1, 4],
    [3, -2],
    [1, 1],
  ]);
  const readyOffsets = [0, 600, 120, 300, 45]; // אינדקס 0 = מסעדה, לא בשימוש

  it('ההפרש בין המתנה לזמן הגעה קבוע לכל סדר', () => {
    const constant = readyOffsets.slice(1).reduce((a, b) => a + b, 0);
    for (const perm of permutations([1, 2, 3, 4])) {
      expect(totalWait(perm, m, readyOffsets) - totalArrivalTime(perm, m)).toBeCloseTo(
        constant,
        9
      );
    }
  });

  it('ולכן הסדר שממזער זמני הגעה ממזער גם המתנה', () => {
    let bestByWait: number[] = [];
    let bestWait = Infinity;
    for (const perm of permutations([1, 2, 3, 4])) {
      const w = totalWait(perm, m, readyOffsets);
      if (w < bestWait) {
        bestWait = w;
        bestByWait = perm;
      }
    }
    // bestOrder אינו מקבל את readyOffsets בכלל — וזו בדיוק הנקודה.
    expect(bestOrder(m)).toEqual(bestByWait);
  });
});

// ═══════════════ קווי הבסיס ═══════════════

describe('קווי בסיס', () => {
  it('FIFO מסדר לפי מי שהמתין הכי הרבה', () => {
    // המתנה גדולה יותר = יצא מהמטבח מוקדם יותר
    expect(fifoOrder([0, 100, 900, 400])).toEqual([2, 3, 1]);
  });

  it('אקראי הוא תמורה חוקית ולא מאבד עצירות', () => {
    let seed = 42;
    const lcg = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const order = randomOrder(6, lcg);
    expect([...order].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('אף קו בסיס לא מנצח את האופטימום', () => {
    let seed = 7;
    const lcg = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

    for (let trial = 0; trial < 200; trial++) {
      const pts: [number, number][] = [[0, 0]];
      for (let i = 0; i < 6; i++) pts.push([lcg() * 20 - 10, lcg() * 20 - 10]);
      const m = euclideanMatrix(pts);
      const offsets = [0, ...Array.from({ length: 6 }, () => lcg() * 900)];

      const optimal = totalWait(bestOrder(m), m, offsets);
      for (const candidate of [
        fifoOrder(offsets),
        nearestNeighbourOrder(m),
        randomOrder(6, lcg),
      ]) {
        expect(totalWait(candidate, m, offsets)).toBeGreaterThanOrEqual(optimal - 1e-9);
      }
    }
  });
});

// ═══════════════ עזרים ═══════════════

describe('עזרים', () => {
  it('permutations מחזיר n! תמורות ייחודיות', () => {
    const all = [...permutations([1, 2, 3, 4])];
    expect(all).toHaveLength(24);
    expect(new Set(all.map((p) => p.join(','))).size).toBe(24);
  });

  it('bestOrder מסרב לגדול מדי במקום להיתקע', () => {
    const big: DurationMatrix = Array.from({ length: 11 }, () => new Array(11).fill(1));
    expect(() => bestOrder(big)).toThrow(/Held-Karp/);
  });

  it('haversine מודד מרחק אמיתי נכון', () => {
    // שתי כתובות אמיתיות בבאר שבע מתוך מאגר הכתובות
    const smilansky: Point = { lat: 31.236237, lng: 34.789024 };
    const histadrut: Point = { lat: 31.2421, lng: 34.791429 };
    const d = haversineMeters(smilansky, histadrut);
    expect(d).toBeGreaterThan(600);
    expect(d).toBeLessThan(800);
  });

  it('haversine סימטרי ומתאפס על עצמו', () => {
    const a: Point = { lat: 31.25, lng: 34.79 };
    const b: Point = { lat: 31.26, lng: 34.8 };
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 9);
    expect(haversineMeters(a, a)).toBe(0);
  });
});
