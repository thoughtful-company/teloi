**Active work**:
- [ ] Block-level undo (structural changes, not just text)
- [ ] Implement toggles for nodes that have children >
  This is a complicated feature that requires revamping how Enter, Delete, Backspace and arrow navigation work.
  Problem appears: how to combine toggles with list elements.
- [ ] Breadcrumbs (needs design)
- [ ] Dev script: ccusage for ~/.claude and ~/.clancy
- [ ] Fix failing tests
- [ ] Implement move block below and move block above
- [ ] Implement different document types (see `docs/ontology.md`)
- [ ] Remove new node creation upon buffer initialization
- [ ] Bug: if the whole node is selected, upon reload, selection is lost
- [ ] Bug: if you select part of a node and press enter, the selected part does not get deleted
- [ ] Remove all `Effect.sleep` with arbitrary durations from tests (see Testing Anti-Patterns below)
- [ ] Implement delete button for sidebar items that shows up on hover and deletes an element
  button is located on the right side of a list item
- [ ] When selection is set to wrap place with assoc 0, it causes problems
- [ ] When you have selected a checkbox node and press enter, it should get marked as done
- [ ] Implement home node for a workspace
  Home node should have an icon leftmost in page header and when you click on it, it opens up a page, that has workspace name and content of it is top-level workspace nodes.
  We can also create workspace node explicitly and move top level nodes there, this appears to be less hacky. Then sidebar should also show just the children of workspace node.
- [ ] Make system nodes non-editable
- [ ] Refactor code
  Goal of the refactor is to reduce amount of code and complexity in this code.

**Known Tech Debt**:
- `goalX` and `goalLine` in buffer selection can be independently null, but logically they should always come together (goalX without goalLine is meaningless). Current workaround uses `|| "last"` fallback. Fixing this requires schema migration.

**Bugs**:
- [ ] When you delete a node from sidebar that you currently focus, it stays on the screen
  Probably, we can redirect to home
- [ ] Update export feature to account for tuples and types
- [ ] Tab/Shift+Tab indent animation is janky (block disappears and reappears)
  Current TransitionGroup only handles same-parent reordering smoothly. Cross-parent moves (indent/outdent) need FLIP animations to track elements across DOM parents. Consider `solid-motionone` or manual FLIP implementation.
- [ ] When you copy list elements and todo's they should be copied the right way
- [ ] When you reload the page, selection is not restored in title
- [ ] Too much logging when you run tests. Logs should be optional, so you can enable them for a particular test.
