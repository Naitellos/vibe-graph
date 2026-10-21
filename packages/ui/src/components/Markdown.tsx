import type React from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'

export interface MarkdownProps {
  source: string
  className?: string
}

export function Markdown({ source, className }: MarkdownProps): React.JSX.Element {
  return (
    <div className={className}>
      <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{source}</ReactMarkdown>
    </div>
  )
}
