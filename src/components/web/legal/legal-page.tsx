// A long legal document: title, date, then sections
// with a contents list that stays in view on wide screens.
export type LegalSection = { id: string; title: string; body: React.ReactNode };

export function LegalPage({
  title,
  updated,
  sections,
}: {
  title: string;
  updated: string;
  sections: LegalSection[];
}) {
  return (
    <article className="px-3 pt-10 pb-24 sm:px-5 sm:pt-16 sm:pb-32 lg:pt-20">
      <header className="max-w-[820px]">
        <h1 className="headline text-[48px] leading-[0.95] font-semibold tracking-[-0.045em] text-balance sm:text-[76px]">{title}</h1>
        <p className="mt-6 text-[15px] text-muted">Last updated {updated}</p>
      </header>

      <div className="mt-16 grid grid-cols-1 gap-12 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-20">
        <nav aria-label="Contents" className="hidden lg:block">
          <ul className="sticky top-28 flex flex-col gap-2.5 text-[14.5px] text-muted">
            {sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="transition-colors hover:text-ink">
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="max-w-[720px]">
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-24 border-t border-line py-10 first:border-t-0 first:pt-0">
              <h2 className="headline text-[24px] leading-tight font-semibold tracking-[-0.03em] sm:text-[28px]">
                {section.title}
              </h2>
              <div className="mt-5 text-[16.5px] leading-relaxed text-pretty text-ink-2 [&_a]:font-medium [&_a]:text-ink [&_code]:rounded-[5px] [&_code]:bg-surface-2 [&_code]:px-1.5 [&_code]:py-px [&_code]:font-mono [&_code]:text-[14px] [&_code]:text-ink [&_a]:underline [&_a]:decoration-line-strong [&_a]:underline-offset-4 hover:[&_a]:decoration-ink [&_h3]:mt-7 [&_h3]:mb-2 [&_h3]:text-[17px] [&_h3]:font-semibold [&_h3]:text-ink [&_li]:mt-2 [&_li]:pl-1 [&_p+p]:mt-4 [&_p+ul]:mt-3 [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:list-disc [&_ul]:pl-5 [&_ul+p]:mt-4 [&_li]:marker:text-faint">
                {section.body}
              </div>
            </section>
          ))}
        </div>
      </div>
    </article>
  );
}
