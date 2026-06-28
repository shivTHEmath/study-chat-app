import Link from "next/link";
import { Masthead, StudyFooter, CenteredPage } from "@/components/StudyChrome";

export default function Home() {
  return (
    <CenteredPage>
      <Masthead subtitle="A study on how AI tutoring tools affect independent reasoning in mathematics." />

      <div className="card p-7">
        <h2 className="font-serif text-xl text-ink">Welcome</h2>
        <p className="text-sm text-muted leading-relaxed mt-2">
          Thank you for your interest in taking part. Enrolling takes about
          fifteen minutes and involves three short steps: reviewing the consent
          form, completing a brief survey, and watching an introduction video.
        </p>

        <ol className="mt-5 space-y-3">
          {[
            "Parent consent and student assent",
            "Background survey",
            "Introduction video and account setup",
          ].map((step, i) => (
            <li key={step} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line-strong text-xs font-semibold text-muted">
                {i + 1}
              </span>
              <span className="text-sm text-ink leading-6">{step}</span>
            </li>
          ))}
        </ol>

        <Link href="/consent" className="btn btn-primary w-full h-12 mt-7">
          Begin enrollment
        </Link>

        <p className="text-sm text-muted text-center mt-4">
          Already enrolled?{" "}
          <Link href="/login" className="font-semibold text-primary underline underline-offset-2">
            Log in
          </Link>
        </p>
      </div>

      <StudyFooter />
    </CenteredPage>
  );
}
