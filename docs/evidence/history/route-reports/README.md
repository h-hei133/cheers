# Route Evidence Report History

Machine-checkable historical route reports remain at
`docs/implementation-context/route*-report.json` for compatibility.
Phase 2.5 Phase C moved only Route222-226 route documents, not their JSON
reports, because the historical runners and Route221 report gate still consume
those report paths directly.

They are evidence history, not current product readiness. In particular:

- Route221 schema, frozen tasks, fixtures, and the anti-false-success gate are
  active evidence infrastructure and were not quarantined.
- Route227 staged reports preserve PARTIAL/COMPLETE distinctions.
- Route228 remains an opt-in live-provider evidence snapshot and does not make
  provider success a default product claim.

Reset Route H created this namespace as the provenance index for a later report
path migration. The reports were not moved in this checkpoint because current
producers and report gates still reference `docs/implementation-context/`
paths.
