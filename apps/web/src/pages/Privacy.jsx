import { Link } from "react-router-dom";

// Written to describe what this site ACTUALLY does today: no accounts, no
// cookies, no analytics, no browser storage of any kind (verified -- there is
// no localStorage, sessionStorage or document.cookie anywhere in the app).
// If tracking, accounts or a cookie banner are ever added, this page has to
// change with them, and the "no cookies" claim below stops being true.
const UPDATED = "17 September 2026";

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-ink/80">{children}</div>
    </section>
  );
}

export default function Privacy() {
  return (
    <div className="animate-fade-in max-w-2xl space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-ink">Privacy Policy</h1>
        <p className="mt-1 text-sm text-ink/60">Last updated {UPDATED}</p>
      </header>

      <div className="hoop-card-outline space-y-5 p-6">
        <Section title="The short version">
          <p>
            HoopIQ has no accounts and no passwords. It does not set cookies, does not use
            analytics or advertising trackers, and stores nothing in your browser. There is
            no profile of you to sell, because none is ever created.
          </p>
        </Section>

        <Section title="What is collected">
          <p>
            <strong className="text-ink">Nothing, on the main site.</strong> Browsing scores,
            stats, shot charts and the simulators involves no personal data at all.
          </p>
          <p>
            <strong className="text-ink">A display name, in the Arena.</strong> Multiplayer
            games ask for a name so other players can see whose turn it is. Use anything you
            like — it is not verified and need not be your real name. It lives in the game
            server's memory only, and is gone when the room expires (two hours) or the server
            restarts. It is never written to a database.
          </p>
        </Section>

        <Section title="What the servers log">
          <p>
            The hosting providers keep standard web server logs, which include IP addresses,
            for reliability and abuse prevention. Requests to the AI features are rate limited
            per IP address for the same reason. These logs are not used to build any profile
            and are not combined with anything else.
          </p>
        </Section>

        <Section title="Other services involved">
          <p>Loading the site necessarily involves a few third parties:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong className="text-ink">Vercel</strong> and <strong className="text-ink">Render</strong> host the site and its servers.</li>
            <li><strong className="text-ink">NBA.com</strong> is where the statistics come from. Your browser does not talk to it — the server does.</li>
            <li><strong className="text-ink">Anthropic</strong> processes the text of AI features (scouting reports, the GM assistant) to generate a reply.</li>
            <li><strong className="text-ink">Google Fonts</strong> serves the typefaces, so your browser does request files from Google.</li>
          </ul>
        </Section>

        <Section title="Children">
          <p>
            The site is a basketball statistics tool and is not directed at children under 13,
            and no personal information is knowingly collected from them.
          </p>
        </Section>

        <Section title="Changes and contact">
          <p>
            If this policy changes, the date at the top changes with it. Questions about it can
            go to the repository this project is developed in.
          </p>
        </Section>

        <p className="border-t border-ink/15 pt-4 text-xs text-ink/60">
          This is a plain-language description of how a hobby analytics site behaves, not legal
          advice, and it has not been reviewed by a lawyer. If HoopIQ ever takes payments, adds
          accounts or serves users in a regulated context, have a professional review it.
        </p>
      </div>

      <p className="text-sm text-ink/70">
        See also the <Link to="/terms" className="font-semibold text-terracotta hover:underline">Terms &amp; Conditions</Link>.
      </p>
    </div>
  );
}
