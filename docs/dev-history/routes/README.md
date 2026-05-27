# Route Document History

Most route documents remain at `docs/agent-routes/route*.md` for direct-link
compatibility during Reset Route H. Phase 2.5 Phase C moved the Route222-226
route-document family into this dev-history namespace and left compatibility
pointers at the old paths.

This index is the quarantine namespace for future route-document moves. The
move is intentionally deferred because the route docs have many cross-links and
some still point directly at active Route221/227/228 evidence paths.

Current status:

- `docs/dev-history/routes/route222*.md` through `route226*.md`: historical
  route documents physically quarantined in Phase 2.5 Phase C.
- `docs/agent-routes/route222*.md` through `route226*.md`: compatibility
  pointers to the quarantined documents.
- Other `docs/agent-routes/route*.md`: historical route documents,
  discoverable at their old paths until migrated.
- `scripts/dev-history/routes/route*.ts`: route runner scripts quarantined
  behind the dev-history script namespace.
- `docs/implementation-context/route*-report.json`: historical evidence reports
  indexed from `docs/evidence/history/route-reports/README.md` but not moved
  because report producers and Route221 gate commands still use the old paths.
