import { Masthead, StudyFooter, CenteredPage } from '@/components/StudyChrome'

export default function ConsentDeclinedPage() {
  return (
    <CenteredPage>
      <Masthead />

      <div className="card p-7 text-center">
        <h2 className="font-serif text-xl text-ink mb-2">Thank you for letting us know</h2>
        <p className="text-sm text-muted leading-relaxed">
          You have chosen not to take part in this study. That is completely
          fine — there are no consequences, and you may now close this page.
        </p>
      </div>

      <StudyFooter />
    </CenteredPage>
  )
}
