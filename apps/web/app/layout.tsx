import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./styles.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://shipshape90.com"),
  title: { default: "ShipShape 90 — Turn commitments into a scoreboard", template: "%s · ShipShape 90" },
  description: "Create or join accountability challenges, complete daily commitments, build streaks, and compete on transparent leaderboards.",
  openGraph: { title: "ShipShape 90", description: "A daily scoreboard for the commitments that matter.", url: "https://shipshape90.com", siteName: "ShipShape 90", type: "website" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
