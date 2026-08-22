import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Should I Buy This? — your shopping companion",
  description: "A warm, honest, independent second opinion on what you're about to buy.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-cream text-ink antialiased">{children}</body>
    </html>
  );
}
