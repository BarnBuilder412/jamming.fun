import type { CSSProperties, PropsWithChildren } from 'react';

export const jamThemeVars: CSSProperties = {
  '--jam-bg': '#0b0d10',
  '--jam-panel': '#14181d',
  '--jam-panel-border': '#2b3138',
  '--jam-text': '#f5f4ee',
  '--jam-text-muted': '#9ca3af',
  '--jam-accent': '#f59e0b',
  '--jam-accent-2': '#f97316',
} as CSSProperties;

type PanelProps = PropsWithChildren<{
  title?: string;
  subtitle?: string;
  style?: CSSProperties;
}>;

export function Panel({ title, subtitle, style, children }: PanelProps) {
  return (
    <section
      style={{
        border: '1px solid var(--jam-panel-border)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.16))',
        borderRadius: 14,
        padding: 14,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
        ...style,
      }}
    >
      {title ? (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13, color: 'var(--jam-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {title}
          </div>
          {subtitle ? <div style={{ fontSize: 12, color: 'var(--jam-text-muted)' }}>{subtitle}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Pill({ children, tone = 'default' }: PropsWithChildren<{ tone?: 'default' | 'accent' | 'success' | 'danger' }>) {
  const styles: Record<string, CSSProperties> = {
    default: { background: '#1f2937', color: '#e5e7eb' },
    accent: { background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24' },
    success: { background: 'rgba(16, 185, 129, 0.18)', color: '#34d399' },
    danger: { background: 'rgba(239, 68, 68, 0.18)', color: '#fca5a5' },
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 999,
        padding: '4px 8px',
        fontSize: 12,
        fontWeight: 600,
        ...styles[tone],
      }}
    >
      {children}
    </span>
  );
}

export function Button({ children, onClick, disabled, variant = 'primary', type = 'button' }: PropsWithChildren<{ onClick?: () => void; disabled?: boolean; variant?: 'primary' | 'ghost'; type?: 'button' | 'submit' }>) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        borderRadius: 10,
        border: variant === 'ghost' ? '1px solid var(--jam-panel-border)' : '1px solid rgba(245, 158, 11, 0.55)',
        background:
          variant === 'ghost'
            ? 'rgba(255,255,255,0.02)'
            : 'linear-gradient(180deg, rgba(245, 158, 11, 0.22), rgba(249, 115, 22, 0.18))',
        color: 'var(--jam-text)',
        padding: '8px 12px',
        fontSize: 13,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}
