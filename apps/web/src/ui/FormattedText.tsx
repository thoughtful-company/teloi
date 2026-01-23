/**
 * Renders text content for unfocused blocks.
 *
 * Note: With Automerge, text is stored as plain strings.
 * Rich text formatting (bold, italic, code) would need to be stored
 * separately and rendered here. For now, this renders plain text.
 */
export function FormattedText(props: { text: string }) {
  return <>{props.text}</>;
}
