import { AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react";
import { formatDate } from "../lib/format";

// The scraper records three outcomes; anything unrecognised is shown as-is
// rather than being forced into one of them.
const OUTCOMES = {
  success: { tone: "good", icon: CheckCircle2, label: "Success" },
  retried: { tone: "warn", icon: RotateCcw, label: "Retried" },
  failed: { tone: "bad", icon: AlertTriangle, label: "Failed" },
};

export function OutcomeBadge({ outcome }) {
  const key = String(outcome || "").toLowerCase();
  const meta = OUTCOMES[key] || { tone: "muted", icon: AlertTriangle, label: outcome || "Unknown" };
  const Icon = meta.icon;
  return (
    <span className={`badge badge-${meta.tone}`}>
      <Icon size={12} strokeWidth={2.4} />
      {meta.label}
    </span>
  );
}

export default function LogList({ logs, showProduct = false }) {
  return (
    <ul className="log-list">
      {logs.map((log, index) => {
        const reason = log.reason || log.message;
        const attempt = log.attempt_number ?? index + 1;
        const siteAttempts = log.site_reported_attempts;
        return (
          <li className="log-row" key={`${log.id || log.logged_at || index}-${attempt}`}>
            <OutcomeBadge outcome={log.outcome || log.status} />
            <div className="log-body">
              <p className="log-title">
                {showProduct && log.productName ? (
                  <span className="log-product">{log.productName}</span>
                ) : null}
                Attempt {attempt}
                {siteAttempts != null && <span className="log-dim"> · site reported {siteAttempts}</span>}
              </p>
              {/* A successful attempt has no reason to report; printing a
                  placeholder on every row would bury the ones that do. */}
              {reason && <p className="log-reason">{reason}</p>}
            </div>
            <time className="log-time">{formatDate(log.logged_at || log.created_at || log.timestamp)}</time>
          </li>
        );
      })}
    </ul>
  );
}
