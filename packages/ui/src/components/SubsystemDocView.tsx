import type React from 'react'
import type { SubsystemDocData } from '../state/subsystem-docs.js'
import { Markdown } from './Markdown.js'
import './SubsystemDocView.css'

function relativeDate(iso: string): string {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

function ChipList({
  items,
  heading,
}: { items: string[]; heading: string }): React.JSX.Element | null {
  if (items.length === 0) return null
  return (
    <section>
      <h3>{heading}</h3>
      <ul className="chips">
        {items.map((item) => (
          <li key={item} className="chip">
            {item}
          </li>
        ))}
      </ul>
    </section>
  )
}

function LinkoutList({
  paths,
  heading,
}: {
  paths: string[]
  heading: string
}): React.JSX.Element | null {
  if (paths.length === 0) return null
  return (
    <section>
      <h3>{heading}</h3>
      <ul className="linkouts">
        {paths.map((path) => (
          <li key={path}>
            <a href={path}>{path}</a>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function SubsystemDocView({ doc }: { doc: SubsystemDocData }): React.JSX.Element {
  return (
    <div className="subsystem-doc">
      <header>
        <h2>{doc.title}</h2>
        <div className="pills">
          <span className={`pill layer-${doc.layer}`}>{doc.layer}</span>
          <span className={`pill status-${doc.status}`}>{doc.status}</span>
          {doc.lastVerified !== undefined ? (
            <span className="pill verified">verified {relativeDate(doc.lastVerified)}</span>
          ) : null}
        </div>
      </header>

      {doc.description !== '' ? (
        <section>
          <h3>Description</h3>
          <Markdown source={doc.description} className="prose" />
        </section>
      ) : null}

      <ChipList items={doc.declaredDependsOn} heading="Depends on" />
      <ChipList items={doc.declaredConsumedBy} heading="Consumed by" />
      <ChipList items={doc.schemaTables} heading="Owns (schema tables)" />

      <LinkoutList paths={doc.relatedSpecs} heading="Related specs" />
      <LinkoutList paths={doc.relatedDecisions} heading="Related decisions" />

      <ChipList items={doc.memoryRefs} heading="Memory refs" />
    </div>
  )
}
