import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { celebratingFor, reducedMotion } from '../lib/feedback';
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

/** 숫자가 바뀌면 차례로 올라가거나 내려가며 따라간다. 축하 화면이 떠 있으면 그것이 걷힐 즈음에 시작한다. */
function useCountUp(target: number): number {
  const [shown, setShown] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const start = current.current;
    if (start === target) return;
    if (reducedMotion()) {
      current.current = target;
      setShown(target);
      return;
    }
    let wait = 0;
    let tick = 0;
    const run = () => {
      const steps = Math.min(Math.abs(target - start), 12);
      let step = 0;
      tick = window.setInterval(() => {
        step += 1;
        const value = step >= steps ? target : Math.round(start + ((target - start) * step) / steps);
        current.current = value;
        setShown(value);
        if (step >= steps) window.clearInterval(tick);
      }, 70);
    };
    // 늘어날 때는 축하 화면이 뜨는지 잠깐 기다려 본다(잔액이 장부보다 먼저 바뀌기도 한다).
    const first = window.setTimeout(
      () => {
        wait = window.setTimeout(run, target > start ? Math.max(0, celebratingFor() - 700) : 0);
      },
      target > start ? 250 : 0,
    );
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(wait);
      window.clearInterval(tick);
    };
  }, [target]);
  return shown;
}

export function CoinPill({ amount }: { amount: number }) {
  const shown = useCountUp(amount);
  return (
    <div className={shown === amount ? 'coin-pill' : 'coin-pill counting'} aria-label={`코인 ${amount}개`}>
      <Icon name="coin" size={24} />
      <span>{shown}</span>
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

interface FoldProps {
  title: string;
  /** 접혀 있을 때도 보이는 짧은 요약(개수 등) */
  summary?: string;
  children: ReactNode;
}

/** 접어 두는 구역: 제목 줄을 누르면 펼쳐진다. 자주 보지 않는 내용을 화면에서 덜어 낼 때 쓴다. */
export function Fold({ title, summary, children }: FoldProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <section className="fold" aria-label={title}>
      <button type="button" className="px fold-head" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <span className="t-capb">{title}</span>
        <span className="t-cap">
          {summary ? `${summary} ` : ''}
          {open ? '접기' : '펼치기'}
        </span>
      </button>
      {open && (
        <div id={id} className="stack">
          {children}
        </div>
      )}
    </section>
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
