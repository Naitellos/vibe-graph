import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Markdown } from './Markdown.js'

describe('Markdown component', () => {
  it('renders simple markdown as DOM elements', () => {
    render(<Markdown source="# Hello\n\n**Bold text**" />)
    expect(screen.getByRole('heading')).toBeInTheDocument()
    expect(screen.getByText('Bold text')).toBeInTheDocument()
  })

  it('strips <script> tags (sanitised at AST level)', () => {
    render(<Markdown source={'before\n\n<script>alert(1)</script>\n\nafter'} />)
    // No <script> in rendered output
    expect(screen.getByText('before')).toBeInTheDocument()
    expect(screen.getByText('after')).toBeInTheDocument()
    expect(screen.getByText('before').ownerDocument.querySelector('script')).toBeNull()
  })

  it('renders links as <a> with href', () => {
    render(<Markdown source="[Anthropic](https://anthropic.com)" />)
    const link = screen.getByRole('link', { name: 'Anthropic' })
    expect(link.getAttribute('href')).toBe('https://anthropic.com')
  })
})
