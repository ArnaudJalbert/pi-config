import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import pousse from "./aweille-pousse.ts";

export default function (pi: ExtensionAPI) {
  pousse(pi);
}
