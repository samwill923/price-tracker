import { AlertTriangle, CheckCircle2, X } from "lucide-react";

export default function Toasts({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div className={`toast toast-${toast.tone}`} key={toast.id}>
          {toast.tone === "bad" ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
          <p>{toast.text}</p>
          <button onClick={() => onDismiss(toast.id)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
