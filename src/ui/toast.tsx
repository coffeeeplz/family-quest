import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

/** 알림 옆에 붙는 버튼(예: 되돌리기) */
export interface ToastAction {
  label: string;
  run: () => void;
}

type Notify = (message: string, action?: ToastAction) => void;

const ToastContext = createContext<Notify>(() => {});

/** 화면 아래에 잠깐 떴다 사라지는 한 줄 알림 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const [action, setAction] = useState<ToastAction | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const notify = useCallback<Notify>((text, next) => {
    if (!text) return;
    setMessage(text);
    setAction(next ?? null);
    window.clearTimeout(timer.current);
    // 버튼이 있으면 누를 시간을 넉넉히 준다.
    timer.current = window.setTimeout(() => {
      setMessage('');
      setAction(null);
    }, next ? 5000 : 2800);
  }, []);

  function press() {
    if (!action) return;
    window.clearTimeout(timer.current);
    setMessage('');
    setAction(null);
    action.run();
  }

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div aria-live="polite" role="status">
        {message && (
          <div className={action ? 'toast with-action' : 'toast'}>
            <span>{message}</span>
            {action && (
              <button type="button" className="toast-action" onClick={press}>
                {action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Notify {
  return useContext(ToastContext);
}

/** 오류를 사용자에게 보여 줄 문장으로 바꾼다. */
export function errorText(error: unknown): string {
  if (error instanceof Error && error.name === 'AppError') return error.message;
  console.error(error);
  return '문제가 생겼어요. 잠시 뒤에 다시 해 주세요.';
}

/** 버튼을 눌러 실행하는 일의 공통 처리: 진행 중 표시, 성공 알림, 오류 알림 */
export function useAction() {
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (work: () => Promise<unknown>, success?: string): Promise<boolean> => {
      setBusy(true);
      try {
        await work();
        if (success) notify(success);
        return true;
      } catch (error) {
        notify(errorText(error));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [notify],
  );
  return { busy, run };
}
