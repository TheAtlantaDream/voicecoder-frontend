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
  return `${editorBase()}/?folder=${EDITOR_FOLDER}`
}

/** Open the latest agent diff in the editor iframe (cache-busted). */
export function editorDiffSrc(bust = Date.now()): string {
  // openvscode opens a file with &/absolute/path after ?folder=...
  return `${editorBase()}/?folder=${EDITOR_FOLDER}&${LATEST_DIFF_FILE}&t=${bust}`
}
