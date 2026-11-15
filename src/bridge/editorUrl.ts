import { VSCODE_WEB_URL } from './env.ts'

/** Folder openvscode shows by default (shared home volume mount). */
export const EDITOR_FOLDER = '/home/workspace/project'

/** Patch file the bridge writes after each agent run. */
export const LATEST_DIFF_FILE = `${EDITOR_FOLDER}/.voicecoder/latest.diff`

function editorBase(): string {
  const raw = VSCODE_WEB_URL.endsWith('/') ? VSCODE_WEB_URL.slice(0, -1) : VSCODE_WEB_URL
  return raw || '/vscode'
}

/** Open the project folder in the editor iframe. */
export function editorFolderSrc(): string {
  return `${editorBase()}/?folder=${encodeURIComponent(EDITOR_FOLDER)}`
}

/**
 * Open the latest agent diff in the editor iframe.
 * Uses VS Code web's `payload` openFile (same as code-server / vscode.dev).
 *
 * The URL is stable on purpose: changing the iframe src restarts all of VS Code,
 * so the diff is opened once, and later runs just rewrite latest.diff, which
 * VS Code refreshes in place. Pass `bust` only to force a reopen.
 */
export function editorDiffSrc(bust?: number): string {
  const host = typeof window !== 'undefined' ? window.location.host : 'localhost'
  const openFile = `vscode-remote://${host}${LATEST_DIFF_FILE}`
  const payload = JSON.stringify([['openFile', openFile]])
  return (
    `${editorBase()}/?folder=${encodeURIComponent(EDITOR_FOLDER)}` +
    `&payload=${encodeURIComponent(payload)}` +
    (bust === undefined ? '' : `&t=${bust}`)
  )
}
