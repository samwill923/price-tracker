import { Activity, LayoutDashboard, Search } from "lucide-react";

export const VIEWS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "search", label: "Find products", icon: Search },
  { id: "activity", label: "Activity", icon: Activity },
];

export default function Sidebar({ view, onView, trackedCount, connection }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark">
          <Activity size={18} strokeWidth={2.4} />
        </div>
        <div className="brand-copy">
          <strong>Price Tracker</strong>
          <span>INE mock store</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Sections">
        {VIEWS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={view === id ? "nav-item is-active" : "nav-item"}
            onClick={() => onView(id)}
            aria-current={view === id ? "page" : undefined}
          >
            <Icon size={17} />
            <span>{label}</span>
            {id === "dashboard" && trackedCount > 0 && <em className="nav-count">{trackedCount}</em>}
          </button>
        ))}
      </nav>

      <div className="sidebar-foot">
        <div className={`conn conn-${connection}`}>
          <span className="conn-dot" />
          {connection === "connected"
            ? "Backend connected"
            : connection === "error"
              ? "Backend unavailable"
              : "Connecting…"}
        </div>
        <p className="sidebar-note">Scheduled scrape runs every 2 hours.</p>
      </div>
    </aside>
  );
}
