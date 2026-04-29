import { ArrowUpRight } from "lucide-react";

import { ExampleCard } from "@/components/ExampleCard";
import { HeroBackdrop } from "@/components/HeroBackdrop";
import { TopBar, docsUrl, githubUrl, npmUrl } from "@/components/TopBar";
import {
  categories,
  categoryStyle,
  examples,
  examplesByCategory,
} from "@/lib/examples-manifest";
import { cn } from "@/lib/utils";

const HERO_STATS = [
  { value: String(examples.length), label: "примеров" },
  { value: String(categories.length), label: "категории" },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-canvas-parchment text-ink">
      <TopBar />

      <header className="relative isolate overflow-hidden border-b border-hairline bg-canvas">
        <HeroBackdrop />

        <div className="relative mx-auto flex max-w-6xl flex-col gap-7 px-6 py-20 md:py-28">
          <p className="text-caption-strong text-primary">lite-fsm · playground</p>
          <h1 className="text-display-md text-ink md:text-display-lg lg:text-hero-display">
            Сборник примеров <span className="whitespace-nowrap text-primary">lite-fsm</span>
          </h1>
          <p className="max-w-2xl text-body text-ink-muted-80 md:text-lead">
            Технические демо: sync-машины, async-эффекты, actor-шаблоны и SSR-streaming. Каждый пример —
            самодостаточная папка со своим{" "}
            <code className="rounded-sm bg-canvas-parchment px-1.5 py-0.5 text-[0.92em] text-ink">store</code>,{" "}
            <code className="rounded-sm bg-canvas-parchment px-1.5 py-0.5 text-[0.92em] text-ink">machines</code> и
            React-компонентами.
          </p>

          <dl className="flex flex-wrap items-center gap-x-3 gap-y-3 pt-1">
            {HERO_STATS.map((stat, index) => (
              <div key={stat.label} className="flex items-center gap-3">
                {index > 0 ? (
                  <span aria-hidden className="size-1 rounded-full bg-ink-muted-48/40" />
                ) : null}
                <div className="flex items-baseline gap-2">
                  <dd className="text-display-md font-semibold text-ink">{stat.value}</dd>
                  <dt className="text-caption uppercase tracking-[0.08em] text-ink-muted-48">
                    {stat.label}
                  </dt>
                </div>
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap gap-2 pt-1 text-caption text-ink-muted-80">
            <a
              href="#examples"
              className="inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-canvas/70 px-3 py-1.5 backdrop-blur transition-colors hover:border-primary hover:text-primary"
            >
              К примерам
            </a>
            <a
              href={docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-canvas/70 px-3 py-1.5 backdrop-blur transition-colors hover:border-primary hover:text-primary"
            >
              Документация
              <ArrowUpRight className="size-3.5" strokeWidth={2} />
            </a>
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-canvas/70 px-3 py-1.5 backdrop-blur transition-colors hover:border-primary hover:text-primary"
            >
              GitHub
              <ArrowUpRight className="size-3.5" strokeWidth={2} />
            </a>
          </div>
        </div>
      </header>

      <section id="examples" className="px-6 py-16 md:py-24">
        <div className="mx-auto flex max-w-6xl flex-col gap-16">
          {categories.map((category, index) => {
            const list = examplesByCategory[category.id];
            if (!list.length) return null;
            const styles = categoryStyle[category.id];

            return (
              <div key={category.id} id={category.id} className="flex scroll-mt-16 flex-col gap-7">
                <div className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-5">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className={cn("text-fine-print font-mono uppercase text-ink-muted-48")}
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span
                        aria-hidden
                        className={cn("size-1.5 rounded-full", styles.accent)}
                      />
                      <span
                        className={cn(
                          "text-caption-strong uppercase tracking-[0.12em]",
                          styles.text,
                        )}
                      >
                        {category.short}
                      </span>
                    </div>
                    <h2 className="text-display-md text-ink">{category.label}</h2>
                    <p className="max-w-xl text-body text-ink-muted-80">{category.description}</p>
                  </div>
                  <p className="text-caption text-ink-muted-48">
                    {list.length} {list.length === 1 ? "пример" : "примеров"}
                  </p>
                </div>

                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {list.map((example) => (
                    <ExampleCard key={example.id} example={example} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="border-t border-hairline bg-canvas px-6 py-12">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="flex max-w-md flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-primary" />
              <p className="text-caption-strong text-ink">lite-fsm</p>
              <span className="rounded-pill bg-canvas-parchment px-2 py-0.5 text-fine-print font-medium text-ink-muted-48">
                playground
              </span>
            </div>
            <p className="text-body text-ink-muted-80">
              Минималистичная FSM-библиотека для React. Все примеры на этой странице запускаются из
              исходников <code className="rounded-sm bg-canvas-parchment px-1 text-[0.92em] text-ink">lite-fsm</code>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-12 gap-y-3 text-caption sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <p className="text-fine-print font-medium uppercase tracking-[0.08em] text-ink-muted-48">
                Документация
              </p>
              <FooterExternalLink href={docsUrl}>Гайд</FooterExternalLink>
              <FooterExternalLink href={`${docsUrl}guide/api/`}>API</FooterExternalLink>
              <FooterExternalLink href={`${docsUrl}guide/usage/react/`}>React</FooterExternalLink>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-fine-print font-medium uppercase tracking-[0.08em] text-ink-muted-48">
                Код
              </p>
              <FooterExternalLink href={githubUrl}>GitHub</FooterExternalLink>
              <FooterExternalLink href={npmUrl}>npm</FooterExternalLink>
              <FooterExternalLink href={`${githubUrl}/issues`}>Issues</FooterExternalLink>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-fine-print font-medium uppercase tracking-[0.08em] text-ink-muted-48">
                Категории
              </p>
              {categories.map((cat) => (
                <a
                  key={cat.id}
                  href={`#${cat.id}`}
                  className="flex items-center gap-2 text-ink transition-colors hover:text-primary"
                >
                  <span className={cn("size-1.5 rounded-full", categoryStyle[cat.id].accent)} />
                  {cat.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}

function FooterExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex w-fit items-center gap-1.5 text-ink transition-colors hover:text-primary"
    >
      {children}
      <ArrowUpRight className="size-3.5 text-ink-muted-48 transition-colors group-hover:text-primary" strokeWidth={2} />
    </a>
  );
}
