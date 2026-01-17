All nodes can have text content stored in Y.Text. This is used for displaying the node in a buffer.

Nodes can also derive their displayed title from another node via a RENDERED_NAME tuple. The tuple has three positions: the node, the source node, and the mode. The mode determines editing behavior.

In synced mode, editing the node's title edits the source's Y.Text directly. In readonly mode, the title displays but cannot be edited. In detach mode, the first edit copies the source text to the node's own Y.Text and deletes the tuple, breaking the link.

Title links are materialized to a title_links table for fast O(1) lookups at render time. The TitleLinkT service provides get and subscribe methods for querying, plus a detach method for breaking links programmatically.

Proposed enhancments:
- Add visual indicators for different sync types
