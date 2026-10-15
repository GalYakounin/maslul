export function SignOutButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-border px-3 py-2 text-sm text-text-muted hover:border-text-muted"
    >
      התנתקות
    </button>
  );
}
