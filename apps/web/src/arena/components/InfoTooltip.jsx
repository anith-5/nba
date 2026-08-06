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
        className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-slate-600 text-[9px] leading-none text-slate-400 hover:border-court hover:text-court-glow"
      >
        i
      </button>
      {open && (
        <div
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className="card absolute right-0 top-full z-30 mt-2 w-56 p-3 text-left shadow-xl"
        >
          <p className="stat-label mb-2">{title}</p>
          <ul className="space-y-1.5">
            {items.map((item) => (
              <li key={item.label} className="text-xs">
                <span className="font-semibold text-white">{item.label}</span>
                <span className="text-slate-400"> — {item.range || item.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
}
