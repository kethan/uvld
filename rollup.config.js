import terser from '@rollup/plugin-terser';
import bundleSize from 'rollup-plugin-bundle-size';
import copy from 'rollup-plugin-copy'

const resolve = (pkg, input = "src/index", output = "dist/index", ext = '.js') => ({
	input: `${input}${ext}`,
	plugins: [
		bundleSize(),
		copy({
			targets: [
				{ src: 'src/index.d.ts', dest: 'dist/' }
			]
		})
	],
	output: [
		{
			file: `${output}.es.js`,
			format: 'es',
		},
		{
			file: `${output}.js`,
			format: 'cjs',
		},
		{
			file: `${output}.min.js`,
			format: 'iife',
			name: pkg,
			strict: false,
			compact: true,
			plugins: [terser()]
		},
		{
			file: `${output}.umd.js`,
			format: 'umd',
			name: pkg,
			strict: false,
			compact: true,
			plugins: [terser()]
		}
	]
});

export default [
	resolve("uvld"),
]