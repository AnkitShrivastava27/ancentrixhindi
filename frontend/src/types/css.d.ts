// Ambient module declaration for CSS Modules.
// Without this, TypeScript doesn't know what `import styles from './x.module.css'`
// resolves to, and every CSS module import across the app (AnimatedBackground,
// login, ui kit, every page, etc.) fails with:
//   Cannot find module './X.module.css' or its corresponding type declarations. ts(2307)
//
// This file just needs to exist anywhere TypeScript's `include` picks it up
// (e.g. inside `src/`) — no import needed anywhere, it's ambient/global.
declare module '*.module.css' {
  const classes: { [key: string]: string }
  export default classes
}
