import Link from "next/link";
import { LEGAL } from "@/config/legal";
import { GitHubMark } from "@/components/brand/github-mark";
import { CookieSettingsButton } from "@/components/web/consent/consent-banner";
import { Logo } from "@/components/dashboard/logo";
import { FOOTER_LINKS } from "./nav-links";
import { REPO_HREF, REPO_LINK_PROPS } from "./repo";

const LINK = "transition-colors hover:text-ink";

export function SiteFooter() {
  return (
    <footer className="mx-auto max-w-[1400px] px-5 pt-12 pb-12 text-[14.5px] text-muted sm:px-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <Logo />
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {FOOTER_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={LINK} {...("external" in link && link.external && REPO_LINK_PROPS)}>
              {link.label}
            </Link>
          ))}
          <Link href="/auth" className={LINK}>
            Sign in
          </Link>
        </nav>
      </div>
      <div className="mt-8 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {new Date().getFullYear()} {LEGAL.company} · Open source under AGPL-3.0
        </p>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href="/terms" className={LINK}>
            Terms
          </Link>
          <Link href="/privacy" className={LINK}>
            Privacy
          </Link>
          <CookieSettingsButton className={LINK} />
          <a href={REPO_HREF} className={`flex items-center gap-1.5 ${LINK}`} {...REPO_LINK_PROPS}>
            <GitHubMark className="size-4" />
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}
