import { describe, expect, it } from 'vitest'
import { editorDiffSrc, editorFolderSrc, LATEST_DIFF_FILE } from './editorUrl.ts'

describe('editor URLs', () => {
  it('opens the project folder', () => {
    expect(editorFolderSrc()).toBe('/vscode/?folder=%2Fhome%2Fworkspace%2Fproject')
  })

  it('opens latest.diff through the openFile payload', () => {
    const url = decodeURIComponent(editorDiffSrc())
    expect(url).toContain(`["openFile","vscode-remote://${window.location.host}${LATEST_DIFF_FILE}"]`)
  })

  it('is identical across agent runs, so the iframe is not reloaded each time', () => {
    expect(editorDiffSrc()).toBe(editorDiffSrc())
    expect(editorDiffSrc()).not.toContain('&t=')
  })

  it('can still force a reopen with an explicit cache-buster', () => {
    expect(editorDiffSrc(42)).toMatch(/&t=42$/)
  })
})
