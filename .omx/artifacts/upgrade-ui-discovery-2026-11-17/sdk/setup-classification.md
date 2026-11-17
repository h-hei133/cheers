# Matcher setup correction

The root-owned red receipt `red.json` ran four SDK UI tests: two existing tests passed and both new renewal cases failed at the intended second-host call count (`1` observed versus `2` required). These are behavior failures before the later notification assertions.

The initially staged notification assertions used `toHaveBeenCalledExactlyOnceWith`, which is absent from installed Vitest 3.2.7. The source and staged proposal now preserve each assertion as `toHaveBeenCalledTimes(1)` plus `toHaveBeenCalledWith`. This is a separate harness correction and does not weaken or explain the demonstrated renewal failures.

No subagent tests, builds or verification gates were executed.
