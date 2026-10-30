# Navigation and fork against work in flight

Two interaction points were checked after the fork fix.

## Navigating back past an unsettled call

Back to a point **before** the call clears it: `pendingTools` becomes empty and the session no longer reports unfinished work. Back to a point **after** the call keeps it, because that call belongs to the branch still in view. The recovery scope already filters query events by their source entry, so the index is rebuilt from the branch the user is on.

A first probe navigated to a point after the call and read the retained pending entry as a defect. It was not: the call was on that branch. A change to the transcript projection was written on that misreading and then reverted.

## A fork does not see the source's operations

`undoHistory` for the fork returns no operations while the source still lists its own, so a new direction cannot revert work it never did.

Build `dbe6dc1eb2a1`. No product code changed in this batch.
