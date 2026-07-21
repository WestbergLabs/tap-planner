import type { Metadata } from "next";
import "./globals.css";

const siteUrl = "https://tap-planner.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Tap Planner",
    template: "%s | Tap Planner",
  },
  description:
    "Choose a Pinter BrewPack and desired tap date to calculate when brewing, cold crashing, and conditioning should begin.",
  applicationName: "Tap Planner",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    title: "Tap Planner",
    description:
      "Plan backward from tap day and know exactly when to start your Pinter BrewPack.",
    siteName: "Tap Planner",
    images: [
      {
        url: "/tap-handles.jpg",
        width: 1200,
        height: 630,
        alt: "A row of beer taps behind a bar",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tap Planner",
    description:
      "Plan backward from tap day and know exactly when to start your Pinter BrewPack.",
    images: ["/tap-handles.jpg"],
  },
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
