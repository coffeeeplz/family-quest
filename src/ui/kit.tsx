import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Sprite';

type ButtonTone = 'pink' | 'mint' | 'plain';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ButtonTone;
  big?: boolean;
  block?: boolean;
  fixed?: boolean;
}

export function Button({ tone = 'pink', big, block, fixed, className, type, ...rest }: ButtonProps) {
  const classes = ['btn', tone !== 'pink' && tone, big && 'big', block && 'block', fixed && 'fixed', className]
    .filter(Boolean)
    .join(' ');
  return <button type={type ?? 'button'} className={classes} {...rest} />;
}

/** 더보기 안쪽 화면에서 돌아가는 링크 */
export function BackLink({ to = '/more', label = '더보기' }: { to?: string; label?: string }) {
  return (
    <Link className="link back-link" to={to}>
      ‹ {label}
    </Link>
  );
}

export function CoinPill({ amount }: { amount: number }) {
  return (
    <div className="coin-pill" aria-label={`코인 ${amount}개`}>
      <Icon name="coin" size={24} />
      <span>{amount}</span>
    </div>
  );
}

export function CoinInline({ amount, sign }: { amount: number; sign?: boolean }) {
  const text = sign && amount > 0 ? `+${amount}` : String(amount);
  return (
    <span className="coin-inline" aria-label={`코인 ${text}`}>
      <Icon name="coin" size={12} />
      <span>{text}</span>
    </span>
  );
}

export function Empty({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="px empty">
      {icon}
      <p className="t-body">{title}</p>
      {hint && <p className="t-cap">{hint}</p>}
    </div>
  );
}

interface FieldProps {
  label: string;
  children: (id: string) => ReactNode;
  hint?: string;
}

export function Field({ label, children, hint }: FieldProps) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <p className="t-cap">{hint}</p>}
    </div>
  );
}

/** 여러 개 중 하나를 고르는 묶음(라디오 그룹) */
export function FieldGroup({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="field" role="radiogroup" aria-labelledby={id}>
      <div className="label" id={id}>
        {label}
      </div>
      {children}
    </div>
  );
}

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** 화면 아래에서 올라오는 창. 바깥을 누르거나 Esc 로 닫는다. */
export function Sheet({ title, onClose, children }: SheetProps) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  // onClose 가 매번 새 함수여도 아래 효과가 다시 돌지 않게 한다(입력 중 포커스가 튀는 것을 막는다).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);

  return (
    <div
      className="sheet-back"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={ref}>
        <h2 className="t-title" id={titleId}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
