import { Facet } from "@codemirror/state";

/** Vault path of the open markdown note — used to resolve relative assets. */
export const markdownVaultPathFacet = Facet.define<string | null, string | null>({
  combine: (values) => values[0] ?? null,
});
