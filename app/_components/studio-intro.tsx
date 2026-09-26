import { ArrowUpRightIcon } from "lucide-react";

// Facts only (no article prose), so starters work as demos without reproducing anyone's writing.
const STARTERS = [
  {
    kicker: "Paste data",
    title: "Top fertilizer exporters",
    detail: "Ranked bar · article format",
    prompt:
      "Make an article infographic. World's top fertilizer exporters in 2024, million tonnes by nutrient content (FAO; nitrogen, phosphate P2O5 and potash K2O): Russia 23.2, Canada 14.4, Morocco 12.2, China 10.1, U.S. 6.4, Saudi Arabia 5.6, Germany 3.1, Israel 2.8, Qatar 2.5, Belarus 2.4, Netherlands 2.2, Egypt 1.9. Global exports were 113.3 million tonnes; the top four supplied 53%.",
  },
  {
    kicker: "Paste data",
    title: "Countries best at math",
    detail: "PISA 2025 · newsletter format",
    prompt:
      "Make a newsletter infographic. Average PISA 2025 mathematics scores of 15-year-olds (OECD): China* 612, Singapore 563, Macao 549, Taiwan 546, Japan 525, South Korea 522, Hong Kong 522, Estonia 508, Switzerland 499, UK 488, Canada 485, Poland 484, Netherlands 483, Australia 478, Germany 464, U.S. 463. OECD average: 463. *China = Beijing, Shanghai, Jiangsu and Zhejiang.",
  },
  {
    kicker: "Just an idea",
    title: "Who builds the most solar?",
    detail: "Agent researches the data",
    prompt:
      "Research which countries added the most solar power capacity in the latest year with published data, cite a primary source, and make a blog header infographic.",
  },
] as const;

export function StudioIntro() {
  return (
    <header className="space-y-5">
      <p className="font-medium text-signal text-xs uppercase tracking-[0.25em]">Plate · Infographic studio</p>
      <h1 className="font-display font-semibold text-5xl uppercase leading-[0.95] tracking-tight sm:text-6xl">
        Any story into a chart <span className="text-signal">worth sharing</span>
      </h1>
      <p className="max-w-xl text-muted-foreground text-pretty">
        Chat an idea, paste an article or URL, or upload a document. Plate finds the story, designs
        the graphic, renders it with Hy Image 3.5 on GMI Cloud, and fact-checks every label before
        you publish.
      </p>
    </header>
  );
}

function Starters({ onPick }: { readonly onPick: (prompt: string) => void }) {
  return (
    <section aria-label="Examples" className="grid gap-2 sm:grid-cols-3">
      {STARTERS.map((starter) => (
        <button
          className="group flex flex-col items-start gap-1 rounded-xl border bg-card/60 p-4 text-left transition-[background-color,transform] duration-[var(--duration-fast)] ease-[var(--ease-standard)] focus-visible:shadow-[0_0_0_2px_var(--ring)] focus-visible:outline-none active:scale-[0.98] [@media(hover:hover)]:hover:bg-card"
          key={starter.title}
          onClick={() => onPick(starter.prompt)}
          type="button"
        >
          <span className="flex w-full items-center justify-between text-muted-foreground text-xs uppercase tracking-wider">
            {starter.kicker}
            <ArrowUpRightIcon className="size-3.5 transition-transform duration-[var(--duration-fast)] [@media(hover:hover)]:group-hover:-translate-y-0.5 [@media(hover:hover)]:group-hover:translate-x-0.5" />
          </span>
          <span className="font-display text-lg uppercase leading-tight">{starter.title}</span>
          <span className="text-muted-foreground text-xs">{starter.detail}</span>
        </button>
      ))}
    </section>
  );
}

StudioIntro.Starters = Starters;
