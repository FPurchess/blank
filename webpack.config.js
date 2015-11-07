module.exports = {
  context: __dirname + "/app",
  entry: "./root.js",

  output: {
    filename: "app.js",
    path: __dirname + "/public",
  },

  module: {
    loaders: [

      // JS
      {
        test: /\.js$/,
        exclude: /node_modules/,
        loaders: ["babel-loader"]
      },

      {
        test: /\.js?$/,
        include: [/prosemirror/, /react-prosemirror/],
        loaders: ["babel-loader?optional=runtime"]
      },

      {
        test: /\.json$/,
        include: /entities/,
        loader: "json-loader"
      },

      // SASS
      {
        test: /\.scss$/,
        loader: 'style!css!sass'
      }

    ]
  }

}
