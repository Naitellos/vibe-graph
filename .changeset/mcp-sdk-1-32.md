---
'@codearch/mcp': patch
'@codearch/cli': patch
---

Bundle `@modelcontextprotocol/sdk` 1.32.1 instead of 1.29.0, which clears
GHSA-6qxp-vccf-f47h, GHSA-22jm-h49p-29qw, GHSA-46jr-4wx8-v453,
GHSA-6prh-2h8m-c8cw and GHSA-rvq5-wwqv-78pq. All five are in the SDK's HTTP
transports, OAuth and experimental tasks, which the stdio-only server never
loads. The stdio transport now closes the connection when a single incoming
message exceeds 10 MB instead of buffering it without limit; tools, schemas
and protocol negotiation are unchanged.
