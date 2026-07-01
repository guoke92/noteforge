import Image from "@tiptap/extension-image";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ImageBlockView } from "../../node-views/ImageBlockView";

export const MarkdownImage = Image.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ImageBlockView);
  },
});
