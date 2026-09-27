import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';

const ToastContext = createContext(null);

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const COLORS = {
  success: 'var(--ok)',
  error: 'var(--danger)',
  warning: '#d97706',
  info: 'var(--brand)',
};

let counter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback((toast) => {
    counter += 1;
    const id = `t${counter}`;
    const entry = { id, variant: 'info', duration: 5200, ...toast };
    setToasts((prev) => [...prev.slice(-4), entry]);
    if (entry.duration > 0) {
      timers.current.set(id, setTimeout(() => dismiss(id), entry.duration));
    }
    return id;
  }, [dismiss]);

  useEffect(() => () => {
    for (const t of timers.current.values()) clearTimeout(t);
    timers.current.clear();
  }, []);

  const api = useMemo(() => ({
    success: (title, msg, opts) => push({ variant: 'success', title, message: msg, ...opts }),
    error: (title, msg, opts) => push({ variant: 'error', title, message: msg, duration: 9000, ...opts }),
    warning: (title, msg, opts) => push({ variant: 'warning', title, message: msg, duration: 7000, ...opts }),
    info: (title, msg, opts) => push({ variant: 'info', title, message: msg, ...opts }),
    dismiss,
  }), [push, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="toasts" role="region" aria-label="Notifications" aria-live="polite">
          {toasts.map((t) => {
            const Icon = ICONS[t.variant] || Info;
            return (
              <div key={t.id} className={`toast toast--${t.variant}`} role={t.variant === 'error' ? 'alert' : 'status'}>
                <span className="toast__bar" style={{ background: COLORS[t.variant] }} aria-hidden="true" />
                <Icon size={17} style={{ color: COLORS[t.variant], flex: 'none', marginTop: 1 }} aria-hidden="true" />
                <div className="grow">
                  <div className="toast__title">{t.title}</div>
                  {t.message ? <div className="toast__msg">{t.message}</div> : null}
                </div>
                <button type="button" className="toast__close" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
};

export default ToastProvider;
