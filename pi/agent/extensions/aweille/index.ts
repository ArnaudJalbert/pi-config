import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import arrangeCa from "./aweille-arrange-ca.ts";
import checkCa from "./aweille-check-ca.ts";
import pousse from "./aweille-pousse.ts";
import racont from "./aweille-racont.ts";

export default function (pi: ExtensionAPI) {
  arrangeCa(pi);
  checkCa(pi);
  pousse(pi);
  racont(pi);
}
