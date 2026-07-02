// Shared presentational chrome that gives every screen the same formal,
// institutional identity: a study masthead and an attribution footer.

export function Masthead({ subtitle }) {
  return (
    <div className="text-center mb-7">
      <p className="eyebrow">Research Study</p>
      <h1 className="font-serif text-[26px] leading-tight text-ink mt-1.5">
        AI Tutoring Study
      </h1>
      <div className="mx-auto mt-3 h-px w-12 bg-line-strong" />
      {subtitle && (
        <p className="text-sm text-muted mt-3 max-w-xs mx-auto leading-relaxed">
          {subtitle}
        </p>
      )}
    </div>
  )
}

export function StudyFooter() {
  return (
    <p className="text-center text-xs text-faint mt-8 leading-relaxed">
      Conducted under the Non-Trivial Research Fellowship
      <br />
      Principal Investigator: Shivsai Sharda
    </p>
  )
}

// Centered single-card layout shared by the auth / informational screens.
export function CenteredPage({ children }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">{children}</div>
    </main>
  )
}

// Navy study side panel. When `showVideo` is set it leads with a "how to
// participate" video placeholder; below it sits a full description of what the
// study involves. The description avoids em dashes on purpose.
export function StudySidePanel({ showVideo = false }) {
  return (
    <aside className="lg:w-[42.857%] bg-primary text-white flex flex-col">
      <div className="flex flex-1 flex-col justify-center px-8 py-9 lg:px-10 lg:py-12">
        <p className="eyebrow text-white/60">You are entering the study</p>
        <h2 className="font-serif text-2xl text-white mt-2">AI Tutoring Study</h2>

        {showVideo && (
          <div className="mt-5 aspect-video w-full rounded-lg border border-white/15 bg-white/5 flex flex-col items-center justify-center text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-white/80" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
            <p className="mt-3 text-sm font-medium text-white/85">How to participate</p>
            <p className="text-xs text-white/50 mt-0.5">Video coming soon</p>
          </div>
        )}

        <p className="text-sm leading-relaxed text-white/75 mt-5">
          This study looks at how an AI tutor affects the way students reason
          through mathematics on their own. What you should know before you begin:
        </p>

        <ul className="mt-4 space-y-2.5">
          <Point>
            Plan to use the tutor for about 10 hours in total across 3 weeks. You
            can spread that time across as many sessions as you like.
          </Point>
          <Point>
            Use it for mathematics only. The tutor will not help with other
            subjects or with topics outside your maths work.
          </Point>
          <Point>
            Work on one problem at a time. Type a problem to begin, then talk
            through your thinking as you would with a tutor.
          </Point>
          <Point>
            The tutor gives hints and questions instead of direct answers, so the
            reasoning stays with you. Ask for a hint whenever you are stuck.
          </Point>
          <Point>
            From time to time you will take a short assessment of 10 problems in
            30 minutes. You need to finish it before you can keep chatting.
          </Point>
          <Point>
            Your activity stays private to the principal investigator, and you may
            withdraw at any time.
          </Point>
        </ul>
      </div>
    </aside>
  )
}

function Point({ children }) {
  return (
    <li className="flex gap-2.5 text-sm leading-relaxed text-white/75">
      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white/40" />
      <span>{children}</span>
    </li>
  )
}

// Two-column auth layout: form content on the left, study side panel on the
// right (3/7 of the page). Stacks vertically on mobile. `showVideo` controls
// whether the side panel leads with the participation video.
export function AuthSplitLayout({ children, showVideo = false }) {
  return (
    <main className="flex flex-1 flex-col lg:flex-row min-h-[100dvh]">
      <div className="flex flex-1 items-center justify-center px-4 py-10 lg:py-12">
        <div className="w-full max-w-md">{children}</div>
      </div>
      <StudySidePanel showVideo={showVideo} />
    </main>
  )
}
