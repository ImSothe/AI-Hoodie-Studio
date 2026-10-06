import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'ghost' | 'outline' | 'danger' | 'link';

const variants: Record<Variant, string> = {
  primary: 'bg-ivory text-ink hover:bg-white',
  ghost: 'border border-line text-fg hover:border-fg/40',
  outline: 'border border-fg/25 text-fg hover:border-fg/60',
  danger: 'border border-line text-muted hover:border-fg/40 hover:text-fg',
  link: 'px-0 text-muted underline-offset-4 hover:text-fg hover:underline',
};

/** Botón de atelier: esquinas rectas, versalitas espaciadas y filete de 1 px. */
export function Button({
  variant = 'ghost',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center gap-2 px-3 py-2.5 text-[10px] font-normal tracking-[0.22em] uppercase transition duration-300',
        'disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-fg',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

/** Selector segmentado minimal: texto en versalitas con subrayado fino en la opción activa. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex gap-4', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex items-center gap-1.5 border-b pb-1 text-[10px] tracking-[0.22em] uppercase transition duration-300',
            value === o.value ? 'border-fg text-fg' : 'border-transparent text-muted hover:text-fg',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}
