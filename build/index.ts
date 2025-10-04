
const cjsBuild = async () => {
  return Bun.build({
    entrypoints: [
      './src/index.ts',
      './src/algorithms/index.ts',
    ],
    outdir: './dist/cjs',
    target: 'node',
    format: 'cjs',
  });
}

const esmBuild = async () => {
  return Bun.build({
    entrypoints: [
      './src/index.ts',
      './src/algorithms/index.ts',
    ],
    outdir: './dist',
    target: 'node',
    format: 'esm',
    // add extension plugin
  });
}

Promise.all([
  esmBuild(),
  // cjsBuild(),
]);

const test = await Bun.$`tsc --emitDeclarationOnly --declaration --project tsconfig.build.json`.nothrow()

// emit declaration files