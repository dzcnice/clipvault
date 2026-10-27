import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

/** Download only the pinned official runtime, verify before it can be executed or packaged. */
export async function harnessNode(root) {
  const lock=JSON.parse(readFileSync(join(root,'integrations/harness/node.lock.json'),'utf8'))
  const entry=lock.files[`${process.platform}-${process.arch}`]
  if(!entry)throw Error('No audited Harness Node binary for this platform; add an official checksum before packaging')
  const directory=join(root,'out/runtime-cache',lock.version,`${process.platform}-${process.arch}`), name=process.platform==='win32'?'node.exe':'node'
  mkdirSync(directory,{recursive:true})
  const path=join(directory,name)
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
  if(!existsSync(path) || hash(readFileSync(path))!==entry.sha256) {
    const url=new URL(entry.url)
    if(url.origin!=='https://nodejs.org' || !url.pathname.startsWith(`/dist/v${lock.version}/`))throw Error('Unexpected Node distribution origin')
    const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(120000)})
    if(!response.ok)throw Error('Official Node download failed')
    const bytes=Buffer.from(await response.arrayBuffer())
    if(hash(bytes)!==entry.sha256)throw Error('Official Node checksum mismatch')
    writeFileSync(path,bytes,{mode:0o700})
  }
  return {path,version:lock.version}
}
