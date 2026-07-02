// Shared presentational chrome that gives every screen the same formal,
// institutional identity — a study masthead and an attribution footer.

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

// Navy study side panel: a media placeholder (for a future "how to
// participate" video) on top, and a study reminder below.
export function StudySidePanel() {
  return (
    <aside className="lg:w-[42.857%] bg-primary text-white flex flex-col">
      <div className="flex flex-1 items-center px-8 py-9 lg:px-10 lg:py-12">
        <div>
          <p className="eyebrow text-white/60">You are entering the study</p>
          <h2 className="font-serif text-2xl text-white mt-2">AI Tutoring Study</h2>
          <p className="text-sm leading-relaxed text-white/75 mt-3">
            By taking part you are contributing to research on how AI tutoring
            tools affect students&apos; independent reasoning in mathematics. Each
            session you complete supports this study.
          </p>
          <p className="text-sm leading-relaxed text-white/75 mt-3">
            Your activity stays private to the principal investigator, and you
            may withdraw at any time.
          </p>
        </div>
      </div>
    </aside>
  )
}

// Two-column auth layout: form content on the left, study side panel on the
// right (3/7 of the page). Stacks vertically on mobile.
export function AuthSplitLayout({ children }) {
  return (
    <main className="flex flex-1 flex-col lg:flex-row min-h-[100dvh]">
      <div className="flex flex-1 items-center justify-center px-4 py-10 lg:py-12">
        <div className="w-full max-w-md">{children}</div>
      </div>
      <StudySidePanel />
    </main>
  )
}
