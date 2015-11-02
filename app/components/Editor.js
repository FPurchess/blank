import React from "react"
import ReactDOM from "react-dom"
import execute from "../backend.js"

import {HotKeys} from "react-hotkeys";
import ContentEditable from "./ContentEditable.js"

require("./Editor.scss")


const Editor = React.createClass({

  getHandlers() {
    return {
      "save": this.save,
      "open": this.open,
      "exit": this.exit,

      "format-h1": this.formatting("h1"),
      "format-h2": this.formatting("h2"),
      "format-h3": this.formatting("h3"),
      "format-h4": this.formatting("h4"),
      "format-h5": this.formatting("h5"),
      "format-bold": this.formatting("strong"),
      "format-underline": this.formatting("underline"),
      "format-italic": this.formatting("i")
    }
  },

  getInitialState() {
    return {
      file: null,
      html: ""
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
    // TODO exit
    return false
  },

  formatting(tag) {
    return function(e) {
      e.preventDefault()
      // TODO formatting
      return false
    }
  },

  handleFileDialog(e) {
    console.log(e)
    execute("open", {
      file: e.target.value
    })
    // TODO loading spinner
  },

  handleChange(e) {
    this.setState({html: e.target.value})
  },

  render() {
    const handlers = this.getHandlers()

    return (
      <HotKeys className="hotkeys" keyMap={this.props.keymap} handlers={handlers}>
        <input ref="fileDialog" type="file" className="file-dialog" value={this.state.file} onChange={this.handleFileDialog} />
        <ContentEditable ref="editor" className="editor" html={this.state.html} onChange={this.handleChange} />
      </HotKeys>
    )
  }
})


export default Editor
