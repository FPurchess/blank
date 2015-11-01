// kindly borrowed from https://github.com/lovasoa/react-contenteditable
import React from 'react';
import ReactDOM from 'react-dom'

export default class ContentEditable extends React.Component {
  constructor() {
    super();
    this.emitChange = this.emitChange.bind(this);
  }

  render() {
    return <div
      {...this.props}
      onInput={this.emitChange}
      onBlur={this.emitChange}
      contentEditable="true"
      dangerouslySetInnerHTML={{__html: this.props.html}}></div>;
  }

  shouldComponentUpdate(nextProps) {
    return nextProps.html !== ReactDOM.findDOMNode(this).innerHTML;
  }

  componentDidUpdate() {
    if ( this.props.html !== ReactDOM.findDOMNode(this).innerHTML ) {
      ReactDOM.findDOMNode(this).innerHTML = this.props.html;
    }
  }

  emitChange(evt) {
    var html = ReactDOM.findDOMNode(this).innerHTML;
    if (this.props.onChange && html !== this.lastHtml) {
      evt.target = { value: html };
      this.props.onChange(evt);
    }
    this.lastHtml = html;
  }
}
