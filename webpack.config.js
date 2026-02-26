const path = require('path')

module.exports = {
    mode: 'production',
    devtool: 'source-map',
    entry: './src/index.ts',
    target: 'node',
    externals: [
        /^tabby-/,
        /^@angular\//,
        /^rxjs/,
        'electron',
        'tabby-settings',
    ],
    output: {
        filename: 'index.js',
        path: path.resolve(__dirname, 'dist'),
        libraryTarget: 'umd',
        library: {
            type: 'umd',
        },
    },
    resolve: {
        extensions: ['.ts', '.js'],
        alias: {
            // allow importing from 'tabby-core' without it being bundled
        },
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
}
