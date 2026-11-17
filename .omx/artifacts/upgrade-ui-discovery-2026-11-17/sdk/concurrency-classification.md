# Restoration validation sequencing

The first final restoration command was launched while the isolated reversal session still reported a running process. Both completed, but their brief process overlap violated the repository's serial verification rule. The resulting report is retained as `reversal-restored-overlap.json` and is excluded from acceptance.

The root agent checked PID, parent PID, state and executable names only; no heavy Node, Vitest, npm or esbuild process remained. Final restoration is rerun in a separate serial command after that check. The reversal receipt independently records all three effective reversals and byte-exact restoration; acceptance uses the subsequent serial restoration receipt.
