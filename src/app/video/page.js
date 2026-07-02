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

        <div className="w-full aspect-video overflow-hidden bg-black/5 border border-line rounded-lg mb-6">
          <video
            className="h-full w-full object-cover"
            src="/how-to-participate.mp4"
            controls
            playsInline
            preload="metadata"
          >
            Your browser does not support embedded video.
          </video>
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
