import React from 'react'
import ReactDOM from 'react-dom'

import {HotKeys} from 'react-hotkeys';
import ContentEditable from './ContentEditable.js'

require('./Editor.scss')


const Editor = React.createClass({
  getHandlers() {
    return {
      'save': this.save,
      'open': this.open,
      'exit': this.exit,
      'format-h1': this.format('h1'),
      'format-h2': this.format('h2'),
      'format-h3': this.format('h3'),
      'format-h4': this.format('h4'),
      'format-h5': this.format('h5'),
      'format-bold': this.format('strong'),
      'format-underline': this.format('underline'),
      'format-italic': this.format('i')
    }
  },

  save(e) {
    e.preventDefault()
    // TODO save
    return false
  },

  open(e) {
    e.preventDefault()
    // TODO open
    return false
  },

  format(formatting) {
    return function(e) {
      e.preventDefault()
      // TODO format
      return false
    }
  },

  componentDidMount() {
    ReactDOM.findDOMNode(this).getElementsByClassName('editor')[0].focus()
  },

  getInitialState() {
    return {html: 'Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industrys standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.'}
  },

  handleChange(e) {
    this.setState({html: e.target.value})
  },

  render() {
    const handlers = this.getHandlers()

    return (
      <HotKeys keyMap={this.props.keymap} handlers={handlers}>
        <ContentEditable className="editor" html={this.state.html} onChange={this.handleChange} />
      </HotKeys>
    )
  }
})


export default Editor
