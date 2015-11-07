import React from "react"
import ReactDOM from "react-dom"

import rangy from "rangy"
import rangyClassApplier from "rangy/lib/rangy-classapplier"
import {HotKeys} from "react-hotkeys";

import execute from "../backend.js"
import ContentEditable from "./ContentEditable.js"

require("./Editor.scss")


const Editor = React.createClass({

  getInitialState() {
    return {
      file: null,
      html: ""
    }
  },

  componentWillMount() {
    rangy.init()

    this.handlers = {
      "save": this.save,
      "open": this.open,
      "exit": this.exit,
      "fullscreen": this.fullscreen,
      "devtools": this.devtools,

      "format-h1": this.formatting("h1"),
      "format-h2": this.formatting("h2"),
      "format-h3": this.formatting("h3"),
      "format-h4": this.formatting("h4"),
      "format-h5": this.formatting("h5"),
      "format-bold": this.formatting("strong"),
      "format-underline": this.formatting("u"),
      "format-italic": this.formatting("em")
    }
  },

  componentDidMount() {
    ReactDOM.findDOMNode(this.refs.editor).focus()
  },

  save(e) {
    e.preventDefault()
    execute("save", {
      file: this.state.file,
      html: this.state.html
    })
    // TODO loading spinner
    return false
  },

  open(e) {
    e.preventDefault()
    ReactDOM.findDOMNode(this.refs.fileDialog).click()
    return false
  },

  exit(e) {
    e.preventDefault()
    // TODO safe before exit?
    execute("exit", {})
    return false
  },

  fullscreen(e) {
    e.preventDefault()
    execute("fullscreen", {})
    return false
  },

  devtools(e) {
    e.preventDefault()
    execute("devtools", {})
    return false
  },

  formatting(tag) {
    // TODO undo block formatting first
    var applier = rangy.createClassApplier(tag, {elementTagName: tag})

    return function(e) {
      e.preventDefault()
      applier.toggleSelection()
      return false
    }
  },

  handleFileDialog(e) {
    execute("open", {
      file: e.target.value
    })
    // TODO loading spinner
  },

  handleChange(e) {
    this.setState({html: e.target.value})
  },

  render() {
    return (
      <HotKeys className="hotkeys" keyMap={this.props.keymap} handlers={this.handlers}>
        <input ref="fileDialog" type="file" className="file-dialog" value={this.state.file} onChange={this.handleFileDialog} />
        <ContentEditable ref="editor" className="editor" html={this.state.html} onChange={this.handleChange} />
      </HotKeys>
    )
  }
})


export default Editor
