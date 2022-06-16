import * as path from 'path'
import * as fs from 'fs'
import * as ts from 'typescript'

export function normalizeTsconfigPath(tsconfigPath: string) {
  return path.resolve(tsconfigPath);
}

function replacer(match, p1, p2, p3, p4, p5, offset, string) {

  const path = p2 != null ? `packages/${p2}/src/${p3}` : `packages/${p5}/src`
  return path
}

/**
 * Given a file, return the list of files it imports as absolute paths.
 */
export function getImportsForFile(file: string, srcRoot: string) {
  // Follow symlink so directory check works.
  file = fs.realpathSync(file)

  if (fs.lstatSync(file).isDirectory() && !file.includes('node_modules')) {
    const index = path.join(file, "index.ts")
    if (fs.existsSync(index)) {
      // https://basarat.gitbooks.io/typescript/docs/tips/barrel.html
      console.warn(`Warning: Barrel import: ${path.relative(srcRoot, file)}`)
      file = index
    } else {
      const index = path.join(file, "index.d.ts")

      if (fs.existsSync(index)) {
        // https://basarat.gitbooks.io/typescript/docs/tips/barrel.html
        console.warn(`Warning: Barrel import: ${path.relative(srcRoot, file)}`)
        file = index
      } else {
        throw new Error(`Warning: Importing a directory without an index.ts file: ${path.relative(srcRoot, file)}`)
      }
    }
  }

  const fileInfo = ts.preProcessFile(fs.readFileSync(file).toString());
  return fileInfo.importedFiles
    .map(importedFile => importedFile.fileName)
    // remove svg, css imports
    .filter(fileName => !fileName.endsWith(".css") && !fileName.endsWith(".svg") && !fileName.endsWith(".json"))
    .filter(fileName => !fileName.endsWith(".js") && !fileName.endsWith(".jsx")) // Assume .js/.jsx imports have a .d.ts available
    .filter(x => /\//.test(x)) // remove node modules (the import must contain '/')
    .map(fileName => {
      if (/(^\.\/)|(^\.\.\/)/.test(fileName)) {
        return path.join(path.dirname(file), fileName)
      }
      if (/(^@dvpub)/.test(fileName)) {

        const l = fileName.replace(/(@dvpub)\/([^\/])\/(.*)|(@dvpub)\/([^\/]*)/,replacer)
        const newPath = path.join(srcRoot, l)
        return newPath
      }
      return path.join(srcRoot, fileName);
    }).map(fileName => {
      if (fs.existsSync(`${fileName}.ts`)) {
        return `${fileName}.ts`
      }
      if (fs.existsSync(`${fileName}.tsx`)) {
        return `${fileName}.tsx`
      }
      if (fs.existsSync(`${fileName}.d.ts`)) {
        return `${fileName}.d.ts`
      }
      if (fs.existsSync(`${fileName}`)) {
        return fileName
      }
      console.warn(`Warning: Unresolved import ${path.relative(srcRoot, fileName)} ` +
                   `in ${path.relative(srcRoot, file)}`)
      return null
    }).filter(fileName => !!fileName)
}

/**
 * This class memoizes the list of imports for each file.
 */
export class ImportTracker {
  private imports = new Map<string, string[]>()

  constructor(private srcRoot: string) {}

  public getImports(file: string): string[] {
    if (this.imports.has(file)) {
      return this.imports.get(file)
    }
    let imports = [];
    if(!file.includes('node_modules')) {
      imports = getImportsForFile(file, this.srcRoot)
      this.imports.set(file, imports)
    }
    return imports
  }
}
