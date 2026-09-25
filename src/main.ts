import pdfmake from "pdfmake";
import vfs from "./exporters/pdf/pdfmake-vfs";

import { bootConfig } from "./config";
import { bootStorage } from "./storage";
import { bootEditor } from "./editor";
import { bootUI } from "./ui";

import "./scss/main.scss";

pdfmake.addVirtualFileSystem(vfs);

pdfmake.addFonts({
  "DejaVu Sans": {
    normal: "dejavu-sans.ttf",
    bold: "dejavu-sans.ttf",
    italics: "dejavu-sans.ttf",
    bolditalics: "dejavu-sans.ttf",
  },
});

(async () => {
  await bootConfig();
  await bootStorage();
  await bootEditor();
  bootUI();
})();
