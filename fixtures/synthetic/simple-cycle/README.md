# simple-cycle

This fixture asserts that Vibe Graph correctly detects a bidirectional import cycle between two subsystems: `auth` imports from `billing` and `billing` imports from `auth`, producing two `depends_on` edges (one in each direction) and a `cycle` finding with `involvedNodeIds: [subsystem:auth, subsystem:billing]`.
