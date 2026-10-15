import type { UserRole } from '@delivery/shared';

export type Role = NonNullable<UserRole>;

export function RoleChoice({ onChoose }: { onChoose: (role: Role) => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-3xl font-bold">מסלול</h1>
          <p className="text-text-muted">ייעול משלוחים למסעדות עם שליחים משלהן</p>
        </div>

        <div className="space-y-3">
          <DoorButton
            title="כניסה לבעלי עסקים"
            subtitle="משלוחים, מפה, מסלולים ושליחים"
            onClick={() => onChoose('business')}
          />
          <DoorButton
            title="כניסה לשליחים"
            subtitle="הזמנות למשמרת והמסלול שלי"
            onClick={() => onChoose('courier')}
          />
        </div>
      </div>
    </div>
  );
}

function DoorButton({
  title,
  subtitle,
  onClick,
}: {
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full space-y-1 rounded-xl border-2 border-transparent bg-surface p-5 text-start shadow hover:border-primary"
    >
      <span className="block text-lg font-bold">{title}</span>
      <span className="block text-sm text-text-muted">{subtitle}</span>
    </button>
  );
}
