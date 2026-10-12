import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Free Account",
  description: "Create your free ViPlay Studio account. Start editing videos with word-by-word Hindi and Hinglish captions, AI dubbing, and 4K exports.",
  alternates: {
    canonical: "/signup",
  },
  openGraph: {
    title: "Create Free Account · ViPlay Studio",
    description: "Create your free ViPlay Studio account. Start editing videos with AI captions, dubbing, and fast social exports.",
    url: "/signup",
  },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
