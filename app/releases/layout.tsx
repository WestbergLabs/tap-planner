import type { Metadata } from "next";

// The page itself is a client component (it has a view toggle), so its metadata
// lives here instead.
export const metadata: Metadata = {
  title: "BrewPack Release Timeline",
  description:
    "An unofficial, best-guess timeline of every Pinter BrewPack: what is on sale now, when each one first appeared, and which have come back around.",
  alternates: {
    canonical: "/releases",
  },
};

export default function ReleasesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
