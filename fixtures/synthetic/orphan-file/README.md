# orphan-file

This fixture asserts that Vibe Graph's `core/orphans` detector correctly flags isolated subsystems: `src/main/` and `src/extra/` each contain a single export with no imports from the other, so both `subsystem:main` and `subsystem:extra` are detected as orphans (no `depends_on` edges between them in either direction). The fixture also asserts that no spurious `depends_on` edges are created between the two isolated subsystems.
