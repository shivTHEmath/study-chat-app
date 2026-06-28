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
