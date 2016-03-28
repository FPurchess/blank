require('es6-promise').polyfill()

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
