// ייחוס מקורות. זו חובה משפטית ולא נימוס:
//   - מאגר הכתובות מפורסם ברישיון CC BY, שדורש ייחוס.
//   - נתוני OpenStreetMap (אריחי המפה וחיפוש הגיבוי ב-Photon)
//     ברישיון ODbL, שגם הוא דורש ייחוס.
//
// Leaflet מציג ייחוס משלו בפינת המפה, אבל הוא מכסה רק את האריחים
// ורק במסך שבו יש מפה. הרכיב הזה מכסה גם את הכתובות, וגם מסכים
// שמציגים כתובת בלי מפה — כולל אפליקציית השליח.

export function Credits() {
  return (
    <footer className="pt-2 text-center text-xs text-text-muted">
      נתוני כתובות:{' '}
      <a
        href="https://www.odata.org.il/dataset/ac1ae1fa-6d43-4685-8434-9953e950ca9b"
        target="_blank"
        rel="noreferrer"
        className="underline"
      >
        רשימת כתובות בישראל
      </a>{' '}
      (CC BY) · מפות ונתונים משלימים:{' '}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        className="underline"
      >
        © OpenStreetMap
      </a>{' '}
      (ODbL)
    </footer>
  );
}
