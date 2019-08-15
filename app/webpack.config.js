const path = require("path");
const webpack = require("webpack");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = {
    mode: 'development',
    entry: "./src/index.js",
    output: {
        filename: "index.js",
        path: path.resolve(__dirname, "dist"),
    },
    plugins: [
        new CopyWebpackPlugin([{from: "./src/index.html", to: "index.html"}]),
        new webpack.ProvidePlugin({
            $: "jquery",
            jQuery: "jquery"
        })
    ],
    devServer: {contentBase: path.join(__dirname, "dist"), compress: true, host: '0.0.0.0'},
    module: {
        rules: [
            {
                test: /\.(scss)$/,
                use: [
                    {
                        // Adds CSS to the DOM by injecting a `<style>` tag
                        loader: 'style-loader'
                    },
                    {
                        // Interprets `@import` and `url()` like `import/require()` and will resolve them
                        loader: 'css-loader'
                    },
                    {
                        // Loader for webpack to process CSS with PostCSS
                        loader: 'postcss-loader',
                        options: {
                            plugins: function () {
                                return [
                                    require('autoprefixer')
                                ];
                            }
                        }
                    },
                    {
                        // Loads a SASS/SCSS file and compiles it to CSS
                        loader: 'sass-loader'
                    }
                ]
            }

        ]
    },
};
