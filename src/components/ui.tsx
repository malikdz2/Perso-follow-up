import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { ChevronLeft, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cx } from '../lib/cx';


type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-emerald-600 text-white active:bg-emerald-700 disabled:bg-emerald-600/40',
  secondary: 'bg-slate-100 text-slate-800 active:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:active:bg-slate-700',
  danger: 'bg-red-600 text-white active:bg-red-700',
  ghost: 'text-emerald-700 active:bg-emerald-50 dark:text-emerald-400 dark:active:bg-slate-800',
};

export function Button({
  variant = 'primary',
  block,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; block?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold transition-colors disabled:cursor-not-allowed',
        VARIANTS[variant],
        block && 'w-full',
        className,
      )}
    />
  );
}

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={cx(
        'block w-full rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-slate-800',
        onClick && 'active:bg-slate-50 dark:active:bg-slate-800',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function Field({ label, hint, group, children }: { label: string; hint?: ReactNode; group?: boolean; children: ReactNode }) {
  const title = <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>;
  const help = hint && <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{hint}</span>;
  // group : boutons (Segmented) → pas de <label>, sinon toucher le libellé activerait le 1er bouton.
  if (group) {
    return (
      <div role="group" aria-label={label}>
        {title}
        {children}
        {help}
      </div>
    );
  }
  return (
    <label className="block">
      {title}
      {children}
      {help}
    </label>
  );
}

const inputCls =
  'block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, className)} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cx(inputCls, 'appearance-none pr-8', className)}>
      {children}
    </select>
  );
}

/** Choix exclusif en boutons (ex. : clair / sombre / système). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-medium',
            value === o.value
              ? 'bg-white text-emerald-700 shadow-sm dark:bg-slate-950 dark:text-emerald-400'
              : 'text-slate-600 dark:text-slate-300',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** En-tête de page avec bouton retour. */
export function PageHeader({ title, back = true, action }: { title: string; back?: boolean; action?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-20 -mx-4 mb-4 flex min-h-14 items-center gap-1 bg-slate-50/90 px-2 backdrop-blur dark:bg-slate-950/90">
      {back ? (
        <button
          type="button"
          aria-label="Retour"
          onClick={() => navigate(-1)}
          className="flex size-11 items-center justify-center rounded-full active:bg-slate-200 dark:active:bg-slate-800"
        >
          <ChevronLeft className="size-6" />
        </button>
      ) : (
        <span className="w-2" />
      )}
      <h1 className="flex-1 truncate text-xl font-bold">{title}</h1>
      {action}
    </header>
  );
}

/** Feuille modale qui monte du bas de l'écran. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Fermer" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] dark:bg-slate-900">
        <div className="mb-3 flex items-center">
          <h2 className="flex-1 text-lg font-bold">{title}</h2>
          <button type="button" aria-label="Fermer" onClick={onClose} className="flex size-11 items-center justify-center rounded-full active:bg-slate-100 dark:active:bg-slate-800">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 px-6 py-10 text-center dark:border-slate-800">
      <div className="text-slate-400">{icon}</div>
      <p className="font-semibold">{title}</p>
      {children && <div className="text-sm text-slate-500 dark:text-slate-400">{children}</div>}
    </div>
  );
}

