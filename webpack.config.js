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
        loaders: ["babel-loader"],
      },

      // SASS
      {
        test: /\.scss$/,
        loader: 'style!css!sass'
      }

    ]
  }

}
