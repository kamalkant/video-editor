/**
 * The home page's FAQs as plain data: the FAQ section (a client component) shows them, and the page (a server
 * component) puts them in the search engines' structured data. Data from a "use client" file can't be read on
 * the server (it arrives as a client reference), so it lives here.
 */
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
