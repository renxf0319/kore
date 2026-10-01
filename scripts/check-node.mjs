// Guard against running Vite 5 on an unsupported Node version.
//
// Vite 5 requires Node ^18 || >=20. On Node 16 and older the dev server dies
// with a cryptic "TypeError: crypto$2.getRandomValues is not a function",
// which sends people hunting for bugs in their own code. Fail early instead.
const major = Number(process.versions.node.split('.')[0])

if (!Number.isFinite(major) || major < 18) {
  const line = '-'.repeat(68)
  console.error(`\n${line}`)
  console.error('  Kore requires Node.js 18 or newer (Vite 5 requirement).')
  console.error(`  Current runtime: Node v${process.versions.node}`)
  console.error('')
  console.error('  Recommended fix - use the bundled launcher instead of a bare')
  console.error('  "npm run dev", so the pinned Node version is used:')
  console.error('')
  console.error('      scripts\\dev.cmd            (browser mode)')
  console.error('      scripts\\dev-desktop.cmd    (Tauri desktop mode)')
  console.error('')
  console.error('  Or switch the version manually:  fnm use 22.23.3')
  console.error(`${line}\n`)
  process.exit(1)
}
