import { useState } from "react";

export default function InfoTooltip({ title, items }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-block">
      <button
        type="button"
        aria-label={`What is ${title}?`}
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-ink/20 text-[9px] leading-none text-ink/70 hover:border-terracotta hover:text-terracotta"
      >
        i
      </button>
      {open && (
        <div
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className="hoop-card-outline absolute right-0 top-full z-30 mt-2 w-56 p-3 text-left shadow-xl"
        >
          <p className="hoop-stat-label mb-2">{title}</p>
          <ul className="space-y-1.5">
            {items.map((item) => (
              <li key={item.label} className="text-xs">
                <span className="font-semibold text-ink">{item.label}</span>
                <span className="text-ink/70"> — {item.range || item.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
}
