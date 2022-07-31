const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const { DefinePlugin } = require('webpack');
const env = process.env.NODE_ENV === "production" ? "production" : "development"
const dist = env === "production" ? path.resolve(__dirname, "docs") : path.resolve(__dirname, "dist");
/** @type {import('webpack').Configuration} */
module.exports = {
  mode: env,
  performance: {
    maxAssetSize: 290000,
  },
  entry: {
    index: "./js/index.js"
  },
  output: {
    path: dist,
  },
  devServer: {
    static: "/"
  },
  plugins: [
    new DefinePlugin({
      VERSION: JSON.stringify(require("./package.json").version)
    }),
    new CopyPlugin({
      patterns: [path.resolve(__dirname, "static")]
    }),
  ]
};
