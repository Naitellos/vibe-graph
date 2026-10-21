import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { Section } from './Section.js'

it('renders title and children', () => {
  render(
    <Section title="Target">
      <p>body</p>
    </Section>,
  )
  expect(screen.getByText('Target')).toBeInTheDocument()
  expect(screen.getByText('body')).toBeInTheDocument()
})
it('renders empty-state slot when empty prop is true', () => {
  render(<Section title="Rules" empty emptyMessage="No rules apply" />)
  expect(screen.getByText('No rules apply')).toBeInTheDocument()
})
