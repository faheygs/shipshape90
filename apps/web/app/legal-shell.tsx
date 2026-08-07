import Link from "next/link";
import type { ReactNode } from "react";

export function LegalShell({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: ReactNode }) {
  return (
    <main className="legalPage">
      <nav className="nav shell legalNav"><Link className="brand" href="/"><span className="mark">S90</span><span>ShipShape 90</span></Link><Link className="navCta legalHome" href="/">Back home</Link></nav>
      <header className="legalHero shell"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{intro}</p><span>Effective August 7, 2026</span></header>
      <article className="legalContent shell">{children}</article>
      <footer className="footer shell"><span>© 2026 ShipShape 90</span><div><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/support">Support</Link></div></footer>
    </main>
  );
}
