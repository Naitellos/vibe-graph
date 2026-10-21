# high-fan-in

This fixture has one shared module (`src/shared.ts`) that is imported by 10 consumers (`src/importer-01.ts` through `src/importer-10.ts`). It asserts that all 10 imports edges from each consumer to `file:src/shared.ts` are present in the scan output.

**Note on the `core/fan-in` detector:** The fan-in detector (threshold: 8) operates exclusively on `subsystem` nodes — it counts how many other subsystems depend on a given subsystem. Because all nodes here are `file` nodes (no directory-level subsystem groupings), the detector does not fire and no `high-fan-in` finding is asserted. The fixture still validates that the scanner correctly handles a high-degree hub at the file level.
