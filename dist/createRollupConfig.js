"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const utils_1 = require("./utils");
const constants_1 = require("./constants");
const rollup_plugin_terser_1 = require("rollup-plugin-terser");
const core_1 = require("@babel/core");
// import babel from 'rollup-plugin-babel';
const rollup_plugin_commonjs_1 = tslib_1.__importDefault(require("rollup-plugin-commonjs"));
const rollup_plugin_json_1 = tslib_1.__importDefault(require("rollup-plugin-json"));
const rollup_plugin_replace_1 = tslib_1.__importDefault(require("rollup-plugin-replace"));
const rollup_plugin_node_resolve_1 = tslib_1.__importDefault(require("rollup-plugin-node-resolve"));
const rollup_plugin_sourcemaps_1 = tslib_1.__importDefault(require("rollup-plugin-sourcemaps"));
const rollup_plugin_typescript2_1 = tslib_1.__importDefault(require("rollup-plugin-typescript2"));
const extractErrors_1 = require("./errors/extractErrors");
const babelPluginTsdx_1 = require("./babelPluginTsdx");
const fs = tslib_1.__importStar(require("fs-extra"));
const errorCodeOpts = {
    errorMapFilePath: constants_1.paths.appErrorsJson,
};
// shebang cache map thing because the transform only gets run once
let shebang = {};
function createRollupConfig(opts) {
    const findAndRecordErrorCodes = extractErrors_1.extractErrors(Object.assign(Object.assign({}, errorCodeOpts), opts));
    const shouldMinify = opts.minify !== undefined ? opts.minify : opts.env === 'production';
    const outputName = [
        `${constants_1.paths.appDist}/${utils_1.safePackageName(opts.name)}`,
        opts.format,
        opts.env,
        shouldMinify ? 'min' : '',
        'js',
    ]
        .filter(Boolean)
        .join('.');
    let tsconfigJSON;
    try {
        tsconfigJSON = fs.readJSONSync(utils_1.resolveApp('tsconfig.json'));
    }
    catch (e) { }
    return {
        // Tell Rollup the entry point to the package
        input: opts.input,
        // Tell Rollup which packages to ignore
        external: (id) => {
            if (id === 'babel-plugin-transform-async-to-promises/helpers') {
                return false;
            }
            return utils_1.external(id);
        },
        // Establish Rollup output
        output: {
            // Set filenames of the consumer's package
            file: outputName,
            // Pass through the file format
            format: opts.format,
            // Do not let Rollup call Object.freeze() on namespace import objects
            // (i.e. import * as namespaceImportObject from...) that are accessed dynamically.
            freeze: false,
            // Respect tsconfig esModuleInterop when setting __esModule.
            esModule: tsconfigJSON ? tsconfigJSON.esModuleInterop : false,
            // Rollup has treeshaking by default, but we can optimize it further...
            treeshake: {
                // We assume reading a property of an object never has side-effects.
                // This means tsdx WILL remove getters and setters defined directly on objects.
                // Any getters or setters defined on classes will not be effected.
                //
                // @example
                //
                // const foo = {
                //  get bar() {
                //    console.log('effect');
                //    return 'bar';
                //  }
                // }
                //
                // const result = foo.bar;
                // const illegalAccess = foo.quux.tooDeep;
                //
                // Punchline....Don't use getters and setters
                propertyReadSideEffects: false,
            },
            name: opts.name || utils_1.safeVariableName(opts.name),
            sourcemap: true,
            globals: { react: 'React', 'react-native': 'ReactNative' },
            exports: 'named',
        },
        plugins: [
            !!opts.extractErrors && {
                transform(source) {
                    findAndRecordErrorCodes(source);
                    return source;
                },
            },
            rollup_plugin_node_resolve_1.default({
                mainFields: [
                    'module',
                    'main',
                    opts.target !== 'node' ? 'browser' : undefined,
                ].filter(Boolean),
            }),
            opts.format === 'umd' &&
                rollup_plugin_commonjs_1.default({
                    // use a regex to make sure to include eventual hoisted packages
                    include: /\/node_modules\//,
                }),
            rollup_plugin_json_1.default(),
            {
                // Custom plugin that removes shebang from code because newer
                // versions of bublé bundle their own private version of `acorn`
                // and I don't know a way to patch in the option `allowHashBang`
                // to acorn. Taken from microbundle.
                // See: https://github.com/Rich-Harris/buble/pull/165
                transform(code) {
                    let reg = /^#!(.*)/;
                    let match = code.match(reg);
                    shebang[opts.name] = match ? '#!' + match[1] : '';
                    code = code.replace(reg, '');
                    return {
                        code,
                        map: null,
                    };
                },
            },
            rollup_plugin_typescript2_1.default({
                typescript: require('typescript'),
                cacheRoot: `./node_modules/.cache/tsdx/${opts.format}/`,
                tsconfig: opts.tsconfig,
                tsconfigDefaults: {
                    compilerOptions: {
                        sourceMap: true,
                        declaration: true,
                        jsx: 'react',
                    },
                },
                tsconfigOverride: {
                    compilerOptions: {
                        target: 'esnext',
                    },
                },
            }),
            babelPluginTsdx_1.babelPluginTsdx({
                exclude: 'node_modules/**',
                extensions: [...core_1.DEFAULT_EXTENSIONS, 'ts', 'tsx'],
                passPerPreset: true,
                custom: {
                    targets: opts.target === 'node' ? { node: '8' } : undefined,
                    extractErrors: opts.extractErrors,
                    format: opts.format,
                },
            }),
            opts.env !== undefined &&
                rollup_plugin_replace_1.default({
                    'process.env.NODE_ENV': JSON.stringify(opts.env),
                }),
            rollup_plugin_sourcemaps_1.default(),
            // sizeSnapshot({
            //   printInfo: false,
            // }),
            shouldMinify &&
                rollup_plugin_terser_1.terser({
                    sourcemap: true,
                    output: { comments: false },
                    compress: {
                        keep_infinity: true,
                        pure_getters: true,
                        passes: 10,
                    },
                    ecma: 5,
                    toplevel: opts.format === 'cjs',
                    warnings: true,
                }),
        ],
    };
}
exports.createRollupConfig = createRollupConfig;
