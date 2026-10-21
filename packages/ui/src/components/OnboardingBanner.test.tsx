import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { OnboardingBanner } from './OnboardingBanner.js'

describe('OnboardingBanner', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('renders when no curated subsystems are present', () => {
    render(<OnboardingBanner hasCuratedSubsystems={false} />)
    expect(screen.getByText(/vibe-graph-onboard/i)).toBeTruthy()
  })

  it('hides when curated subsystems exist', () => {
    render(<OnboardingBanner hasCuratedSubsystems={true} />)
    expect(screen.queryByText(/vibe-graph-onboard/i)).toBeNull()
  })

  it('close button hides the banner and persists to sessionStorage', () => {
    const { rerender } = render(<OnboardingBanner hasCuratedSubsystems={false} />)
    expect(screen.getByText(/vibe-graph-onboard/i)).toBeTruthy()
    const closeBtn = screen.getByRole('button', { name: /close|dismiss|×/i })
    fireEvent.click(closeBtn)
    expect(screen.queryByText(/vibe-graph-onboard/i)).toBeNull()
    // Re-render with same prop — banner stays dismissed due to sessionStorage
    rerender(<OnboardingBanner hasCuratedSubsystems={false} />)
    expect(screen.queryByText(/vibe-graph-onboard/i)).toBeNull()
  })
})
