import React from "react";
import ReactDOM from "react-dom"

import Editor from "./components/Editor";

ReactDOM.render(<Editor keymap={CONFIG.Keymap.editor} />, document.getElementById("root"))
