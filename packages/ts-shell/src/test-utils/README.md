# Test Support

This directory owns fixtures, subprocess runners, assertions, and scenario
reports used by tests. Browser support is grouped by capability; CLI and agent
scenarios keep their own runners. Tests import the existing product owners.

Product code must not import this directory. The opt-in browser smoke command
uses `browser/smoke/`, which owns its runtime configuration, runner, and report.
Its provider, network, persistence, and write opt-ins remain explicit.

These internal test paths have no public import compatibility contract. When
moving support code, update all consumers and validate the affected scenarios.
