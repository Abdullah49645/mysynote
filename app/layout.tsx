import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mysynote — sound design, with an agent in the room",
  description:
    "A browser-native sound-design studio where a human and an AI agent collaboratively manipulate the same live Web Audio graph via WebMCP.",
};

export const viewport: Viewport = {
  themeColor: "#0a0b0f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-studio-bg text-studio-text antialiased">{children}</body>
    </html>
  );
}
