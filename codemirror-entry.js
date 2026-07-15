/** Entry point for the bundled CodeMirror editor used by WebSQL Studio. */
export { basicSetup, EditorView } from "codemirror";
export { EditorState, Compartment, Prec } from "@codemirror/state";
export { keymap } from "@codemirror/view";
export { sql, PostgreSQL } from "@codemirror/lang-sql";
export { oneDark } from "@codemirror/theme-one-dark";
