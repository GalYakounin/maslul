import { lazy, Suspense, useState } from 'react';
import { useAuth, useMe } from '@delivery/shared';
import { supabase } from './lib/supabase';
import { CenteredMessage } from './components/CenteredMessage';
import { SignOutButton } from './components/SignOutButton';
import { RoleChoice, type Role } from './features/auth/RoleChoice';
import { Login } from './features/auth/Login';
import { BusinessSignUp } from './features/auth/BusinessSignUp';
import { CourierSignUp } from './features/auth/CourierSignUp';

// כל צד נטען רק כשצריך אותו. השליח פותח את האתר בנייד, ואין סיבה
// שיוריד את Leaflet ואת כל מסכי הדשבורד כדי לראות רשימת עצירות.
const Dashboard = lazy(() => import('./Dashboard'));
const CourierHome = lazy(() => import('./CourierHome'));

// קישור ישיר לדלת: /courier נפתח ישר בהתחברות השליח — למשל קישור
// שבעל העסק שולח לשליח חדש. אין ראוטר; זה המקום היחיד שנוגע בנתיב.
function roleFromPath(): Role | null {
  const path = window.location.pathname;
  if (path.startsWith('/courier')) return 'courier';
  if (path.startsWith('/business')) return 'business';
  return null;
}

export default function App() {
  const { session, loading, signOut } = useAuth();
  const { me, loading: meLoading } = useMe(supabase, session?.user.id);

  // הדלת קובעת רק איזה טופס הרשמה מוצג. אחרי ההתחברות התפקיד נקבע
  // מ-me() — מי שנכנס בדלת הלא נכונה מגיע בכל זאת למסך שלו.
  const [door, setDoor] = useState<Role | null>(roleFromPath);
  const [screen, setScreen] = useState<'login' | 'signup'>('login');

  function chooseDoor(role: Role | null) {
    setDoor(role);
    setScreen('login');
    window.history.replaceState(null, '', role ? `/${role}` : '/');
  }

  if (loading) return <CenteredMessage text="טוען..." />;

  if (!session) {
    if (!door) return <RoleChoice onChoose={chooseDoor} />;

    if (screen === 'login') {
      return (
        <Login
          role={door}
          onSwitchToSignUp={() => setScreen('signup')}
          onBack={() => chooseDoor(null)}
        />
      );
    }

    return door === 'business' ? (
      <BusinessSignUp onSwitchToLogin={() => setScreen('login')} />
    ) : (
      <CourierSignUp onSwitchToLogin={() => setScreen('login')} />
    );
  }

  if (meLoading) return <CenteredMessage text="טוען פרטים..." />;

  if (me?.role === 'business' && me.business) {
    return (
      <Suspense fallback={<CenteredMessage text="טוען..." />}>
        <Dashboard me={me} onSignOut={signOut} />
      </Suspense>
    );
  }

  if (me?.role === 'courier' && me.courier) {
    return (
      <Suspense fallback={<CenteredMessage text="טוען..." />}>
        <CourierHome me={me} onSignOut={signOut} />
      </Suspense>
    );
  }

  // משתמש מחובר שאין לו פרופיל — me() נכשל, או שההרשמה לא השלימה.
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-text-muted">
        לא הצלחנו לטעון את פרטי החשבון. רעננו את הדף, ואם זה חוזר — התנתקו
        והתחברו מחדש.
      </p>
      <SignOutButton onClick={signOut} />
    </div>
  );
}
