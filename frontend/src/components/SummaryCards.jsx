import { CheckCircle2, Clock3, PackageX, ShoppingBag } from "lucide-react";

export default function SummaryCards({ stats }) {
  const cards = [
    {
      label: "Tracked products",
      value: stats.total,
      icon: ShoppingBag,
      tone: "neutral",
      hint: stats.unknown > 0 ? `${stats.unknown} awaiting first scrape` : null,
    },
    { label: "In stock", value: stats.inStock, icon: CheckCircle2, tone: "good" },
    { label: "Out of stock", value: stats.outOfStock, icon: PackageX, tone: "bad" },
    {
      label: "Last sync",
      value: stats.lastSyncRelative || "—",
      icon: Clock3,
      tone: "neutral",
      hint: stats.lastSyncAbsolute,
      small: true,
    },
  ];

  return (
    <div className="summary-grid">
      {cards.map(({ label, value, icon: Icon, tone, hint, small }) => (
        <div className="summary-card" key={label}>
          <span className={`summary-icon summary-icon-${tone}`}>
            <Icon size={16} strokeWidth={2.2} />
          </span>
          <div className="summary-body">
            <span className="summary-label">{label}</span>
            <strong className={small ? "summary-value summary-value-sm" : "summary-value"}>
              {value}
            </strong>
            {hint && <span className="summary-hint">{hint}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
