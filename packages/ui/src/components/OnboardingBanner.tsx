import type React from 'react'
import { useState } from 'react'

const DISMISS_KEY = 'vg-onboarding-banner-dismissed'

export interface OnboardingBannerProps {
  hasCuratedSubsystems: boolean
}

export function OnboardingBanner({
  hasCuratedSubsystems,
}: OnboardingBannerProps): React.JSX.Element | null {
  const initialDismissed =
    typeof sessionStorage !== 'undefined' && sessionStorage.getItem(DISMISS_KEY) === '1'
  const [dismissed, setDismissed] = useState(initialDismissed)

  if (hasCuratedSubsystems || dismissed) return null

  function dismiss() {
    setDismissed(true)
    sessionStorage.setItem(DISMISS_KEY, '1')
  }

  return (
    <output className="onboarding-banner">
      <span>
        📍 LLM-curated subsystems available — run <code>/vibe-graph-onboard</code> for richer
        details. Drift detection works only with curated YAML.
      </span>
      <button type="button" onClick={dismiss} aria-label="Close" className="banner-close">
        ×
      </button>
    </output>
  )
}
