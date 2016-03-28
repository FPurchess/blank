import React from "react"
import ReactDOM from "react-dom"

import ProseMirror from 'react-prosemirror'
import 'prosemirror/dist/markdown/index'
import 'prosemirror/dist/inputrules/autoinput'

import {HotKeys} from "react-hotkeys";

import execute from "../backend.js"

require("./Editor.scss")


const proseMirrorOptions = {docFormat: "markdown"}

export default React.createClass({
  handlers: {},

  getInitialState() {
    return {
      file: null,
      value: ""
    }
  },

  componentWillMount() {
    this.handlers = {
      "save": this.save,
      "open": this.open,
      "exit": this.exit,
      "fullscreen": this.fullscreen,
      "devtools": this.devtools,

      "format-h1": this.formatting("heading:make1"),
      "format-h2": this.formatting("heading:make2"),
      "format-h3": this.formatting("heading:make3"),
      "format-h4": this.formatting("heading:make4"),
      "format-h5": this.formatting("heading:make5"),
      "format-h6": this.formatting("heading:make6"),
      "format-paragraph": this.formatting("paragraph:make"),
      "format-bold": this.formatting("strong:toggle"),
      "format-italic": this.formatting("em:toggle"),
      "format-bullet-list": this.formatting("bullet_list:wrap"),
      "format-ordered-list": this.formatting("ordered_list:wrap"),
    }
  },

  componentDidMount() {
    this.refs.editor.pm.focus()
  },

  save(e) {
    e.preventDefault()
    execute("save", {
      file: this.state.file,
      value: this.state.value
    })
    // TODO loading spinner
    return false
  },

  open(e) {
    e.preventDefault()
    this.refs.fileDialog.click()
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

  formatting(cmd) {
    return (e) => {
      e.preventDefault()
      this.refs.editor.pm.execCommand(cmd)
      return false
    }
  },

  handleFileDialog(e) {
    execute("open", {
      file: e.target.value
    })
    // TODO loading spinner
  },

  handleChange(value) {
    this.setState({value: value})
  },

  render() {
    return (
      <HotKeys className="hotkeys" keyMap={this.props.keymap} handlers={this.handlers} attach={window.document.body}>
        <input ref="fileDialog" type="file" className="file-dialog" value={this.state.file} onChange={this.handleFileDialog} />
        <div className="editor">
          <ProseMirror ref="editor" defaultValue="" options={proseMirrorOptions} value={this.state.value} onChange={this.handleChange} />
        </div>
      </HotKeys>
    )
  }
})
