import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App.js'

describe('@codearch/ui smoke', () => {
  it('renders the App root', () => {
    render(<App />)
    expect(screen.getByText(/vibe graph/i)).toBeInTheDocument()
  })
})
