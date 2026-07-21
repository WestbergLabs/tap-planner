import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tap Planner",
  description:
    "Plan when to start your Pinter brew so it is ready for your desired tap date.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}