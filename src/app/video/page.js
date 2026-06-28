'use client'

import { useRouter } from 'next/navigation'
import { Masthead, StudyFooter, CenteredPage } from '@/components/StudyChrome'

export default function VideoPage() {
  const router = useRouter()

  return (
    <CenteredPage>
      <Masthead subtitle="Step 3 of 3 — Introduction" />

      <div className="card p-7 text-center">
        <h2 className="font-serif text-xl text-ink mb-2">Watch before you begin</h2>
        <p className="text-sm text-muted leading-relaxed mb-6">
          Please watch this short introduction video. It explains how to use the
          tutoring tool and what to expect during the study.
        </p>

        {/* Video placeholder — replace with the real embed when available */}
        <div className="w-full aspect-video bg-paper border border-line rounded-lg flex items-center justify-center mb-6 text-sm text-faint">
          Video coming soon
        </div>

        <button
          onClick={() => router.push('/signup')}
          className="btn btn-primary w-full h-12"
        >
          Continue to account setup
        </button>
      </div>

      <StudyFooter />
    </CenteredPage>
  )
}
