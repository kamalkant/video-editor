"use client";

import { useResolvedTheme } from "@/lib/editor/theme";
import { FAQS } from "./faqs";

// (the questions live in ./faqs: the page reads them on the server too)
export { FAQS };

export function FaqSection() {
  const isLight = useResolvedTheme() === "light";
  return (
    <div className="w-full max-w-3xl mx-auto px-4 sm:px-8 py-16 sm:py-24">
      <h2 className={`text-3xl sm:text-4xl font-black tracking-tight text-center mb-10 ${isLight ? "text-slate-900" : "text-white"}`}>
        Questions, answered
      </h2>
      <div className="flex flex-col gap-3">
        {FAQS.map((f) => (
          <details
            key={f.q}
            className={`group rounded-2xl border px-5 py-4 transition ${
              isLight ? "bg-white/90 border-slate-200 open:border-purple-300" : "bg-slate-900/60 border-slate-800 open:border-purple-500/50"
            }`}
          >
            <summary className={`cursor-pointer list-none flex items-center justify-between gap-4 text-base font-semibold ${isLight ? "text-slate-900" : "text-white"}`}>
              {f.q}
              <span aria-hidden="true" className="text-xl transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className={`mt-3 text-sm leading-relaxed ${isLight ? "text-slate-600" : "text-slate-300"}`}>{f.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
