import { bootConfig } from "./config";
import { bootStorage } from "./storage";
import { bootEditor } from "./editor";
import { bootUI } from "./ui";

import "./scss/main.scss";

(async () => {
  await bootConfig();
  await bootStorage();
  await bootEditor();
  bootUI();
})();
