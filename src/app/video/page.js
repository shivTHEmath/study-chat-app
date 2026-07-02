'use client'

import { useRouter } from 'next/navigation'
import { Masthead, StudyFooter, CenteredPage } from '@/components/StudyChrome'

export default function VideoPage() {
  const router = useRouter()

  return (
    <CenteredPage maxWidthClass="max-w-3xl">
      <Masthead subtitle="Step 3 of 3 — Introduction" />

      <div className="card p-6 sm:p-8 text-center">
        <h2 className="font-serif text-2xl text-ink mb-2">Watch before you begin</h2>
        <p className="text-sm text-muted leading-relaxed mb-6 max-w-md mx-auto">
          Please watch this short introduction video. It explains how to use the
          tutoring tool and what to expect during the study.
        </p>

        <video
          className="w-full h-auto rounded-lg border border-line bg-black mb-7"
          src="/how-to-participate.mp4"
          controls
          playsInline
          preload="metadata"
        >
          Your browser does not support embedded video.
        </video>

        <button
          onClick={() => router.push('/signup')}
          className="btn btn-primary h-12 px-8 mx-auto"
        >
          Continue to account setup
        </button>
      </div>

      <StudyFooter />
    </CenteredPage>
  )
}
