import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to ViPlay Studio to access your video editor, AI captions, custom templates, and cloud projects.",
  alternates: {
    canonical: "/login",
  },
  openGraph: {
    title: "Sign In · ViPlay Studio",
    description: "Sign in to ViPlay Studio to access your video editor, AI captions, and projects.",
    url: "/login",
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
