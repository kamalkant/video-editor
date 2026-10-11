"use client";

import { useResolvedTheme } from "@/lib/editor/theme";

/** The questions people ask before signing up, answered plainly (and only with what the product does today). */
export const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "Is there a free plan?",
    a: "Yes. The Free plan costs ₹0 with no card: 10 AI credits a month, 720p and 1080p export, on one device. Paid plans add 4K, more AI credits and more devices, each with a free trial.",
  },
  {
    q: "Does it work in Hindi and Hinglish?",
    a: "Yes. Auto captions understand Hindi (written in Devanagari), Hinglish (Hindi in English letters), English and 18 more languages, including Bengali, Tamil, Telugu, Marathi, Gujarati, Kannada, Malayalam, Punjabi and Urdu. Dubbing turns Hindi into English and back, in a natural voice.",
  },
  {
    q: "Are my videos uploaded to the cloud?",
    a: "Your source files stay in your own storage, and editing and exporting happen there. Only the AI features (captions, dubbing, generation) send what they need, such as the clip's sound or your words, to Google, and only when you click them.",
  },
  {
    q: "Do I get a GST invoice?",
    a: "Yes. Prices are in ₹ plus 18% GST, and every payment has an invoice in your account under Billing.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes, from Billing in your account. Your plan keeps working until the end of the period you paid for.",
  },
  {
    q: "What is a transparent web avatar?",
    a: "A green-screen or AI-generated presenter video with the background removed, exported for websites as WebM (Chrome, Android) and MOV (Safari, iPhone) together with ready-to-paste embed code, so it floats over your page in every browser.",
  },
];

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
