import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import { VoiceCoderContext, type VoiceCoderContextValue } from '../bridge/useVoiceCoder.ts'
import type { LogEntry, ServerMessage } from '../bridge/types.ts'
import { Workspace } from './Workspace.tsx'

const CONNECTED: LogEntry[] = [{ id: 1, text: 'connected', kind: 'status' }]

function makeValue(overrides: Partial<VoiceCoderContextValue> = {}): VoiceCoderContextValue {
  return {
    url: 'ws://test/ws',
    status: 'connected',
    listening: true,
    muted: false,
    events: CONNECTED,
    messages: [],
    partial: null,
    transcript: null,
    cleaned: null,
    agentSummary: null,
    agentDiff: null,
    editorSrc: '/vscode/?folder=/home/workspace/project',
    previewSrc: null,
    closePreview: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    setMuted: vi.fn(),
    sendText: vi.fn(),
    stopTask: vi.fn(),
    readAloud: true,
    setReadAloud: vi.fn(),
    speaking: false,
    stopSpeaking: vi.fn(),
    clearEvents: vi.fn(),
    ...overrides,
  }
}

const at = (...messages: ServerMessage[]) => messages.map((message, i) => ({ message, at: i * 1000 }))

function renderWith(overrides: Partial<VoiceCoderContextValue> = {}) {
  const value = makeValue(overrides)
  const utils = render(
    <VoiceCoderContext value={value}>
      <Workspace />
    </VoiceCoderContext>,
  )
  return { value, ...utils }
}

const UTTERANCE: ServerMessage[] = [
  { type: 'partial', seq: 0, text: 'hey VoiceCoder add a test' },
  { type: 'transcript', text: 'hey VoiceCoder add a test' },
  { type: 'cleaned', text: 'add a test' },
]
const WORKING: ServerMessage = { type: 'status', text: 'Working on it.' }

beforeEach(() => localStorage.clear())

describe('Workspace layout', () => {
  it('puts the activity panel before the editor, with one status and one log', () => {
    renderWith()
    const log = screen.getByRole('log', { name: /activity/i })
    const editor = screen.getByTitle('Code editor')
    expect(log.compareDocumentPosition(editor) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getAllByRole('log')).toHaveLength(1)
    expect(editor).toHaveAttribute('src', '/vscode/?folder=/home/workspace/project')
  })

  it('shows the agent\'s site over the editor, and goes back on request', async () => {
    const { value } = renderWith({ previewSrc: '/preview/?t=1' })
    const preview = screen.getByTitle('Preview of your site')
    expect(preview).toHaveAttribute('src', '/preview/?t=1')
    expect(preview.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(screen.getByTitle('Code editor')).not.toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Back to code editor' }))
    expect(value.closePreview).toHaveBeenCalled()
  })

  it('shows no preview until the agent opens one', () => {
    renderWith()
    expect(screen.queryByTitle('Preview of your site')).not.toBeInTheDocument()
    expect(screen.getByTitle('Code editor')).toBeVisible()
  })

  it('no longer renders the old Connect/Start/End buttons', () => {
    renderWith()
    expect(screen.queryByRole('button', { name: /connect|start talking|^end$|send as text/i })).not.toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = renderWith({ messages: at(...UTTERANCE, WORKING) })
    // jsdom can't host the cross-frame axe run, so the iframe itself is skipped.
    expect(await axe(container, { iframes: false })).toHaveNoViolations()
  })
})

describe('mic toggle', () => {
  function Stateful() {
    const [muted, setMuted] = useState(false)
    return (
      <VoiceCoderContext value={makeValue({ muted, setMuted })}>
        <Workspace />
      </VoiceCoderContext>
    )
  }

  it('is a pressed toggle that switches on click, Enter and Space', async () => {
    render(<Stateful />)
    const user = userEvent.setup()
    expect(screen.getByRole('button', { name: /mic on/i })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: /mic/i }))
    expect(screen.getByRole('button', { name: /mic off/i })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('status')).toHaveTextContent('Paused')
    expect(screen.getByRole('heading', { name: /mic\s*paused/i })).toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: /mic on/i })).toBeInTheDocument()
    await user.keyboard(' ')
    expect(screen.getByRole('button', { name: /mic off/i })).toBeInTheDocument()
  })
})

describe('typed requests', () => {
  it('sends the trimmed text, clears the box and keeps focus there', async () => {
    const { value } = renderWith()
    const user = userEvent.setup()
    const input = screen.getByRole('textbox', { name: /or type a request/i })
    await user.type(input, '  add a test for login  {Enter}')
    expect(value.sendText).toHaveBeenCalledWith('add a test for login')
    expect(input).toHaveValue('')
    expect(input).toHaveFocus()
  })

  it('also sends with the Send button, and ignores an empty box', async () => {
    const { value } = renderWith()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(value.sendText).not.toHaveBeenCalled()
    await user.type(screen.getByRole('textbox'), 'rename foo')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(value.sendText).toHaveBeenCalledWith('rename foo')
  })

  it('is disabled with an explanation while disconnected', () => {
    renderWith({ status: 'disconnected' })
    const input = screen.getByRole('textbox', { name: /or type a request/i })
    expect(input).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(input).toHaveAccessibleDescription(/once voicecoder reconnects/i)
  })

  it('sits outside the log so typing is never announced as activity', () => {
    renderWith()
    expect(within(screen.getByRole('log')).queryByRole('textbox')).not.toBeInTheDocument()
  })
})

describe('splitter', () => {
  it('is a focusable vertical separator resized with arrows, Home and End', async () => {
    renderWith()
    const splitter = screen.getByRole('separator', { name: /resize activity panel/i })
    expect(splitter).toHaveAttribute('aria-orientation', 'vertical')
    expect(splitter).toHaveAttribute('aria-valuenow', '36')
    const user = userEvent.setup()
    splitter.focus()
    await user.keyboard('{ArrowRight}')
    expect(splitter).toHaveAttribute('aria-valuenow', '41')
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(splitter).toHaveAttribute('aria-valuenow', '31')
    await user.keyboard('{End}')
    expect(splitter).toHaveAttribute('aria-valuenow', '60')
    await user.keyboard('{Home}')
    expect(splitter).toHaveAttribute('aria-valuenow', '25')
    expect(localStorage.getItem('voicecoder.panelPercent')).toBe('25')
  })

  it('sets the width through a CSS custom property, not an inline style in JSX', async () => {
    renderWith()
    const main = screen.getByRole('main')
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('separator'), { key: 'End' })
    })
    expect(main.style.getPropertyValue('--panel-width')).toBe('60%')
  })
})

describe('header status and connection', () => {
  it.each([
    [[], 'Listening'],
    [[{ type: 'partial', seq: 0, text: 'hey' }], 'Hearing you…'],
    [UTTERANCE.slice(0, 2), 'Processing · hold on'],
    [[...UTTERANCE, WORKING], 'Agent working…'],
  ] as [ServerMessage[], string][])('shows the right status', (messages, text) => {
    renderWith({ messages: at(...messages) })
    expect(screen.getByRole('status')).toHaveTextContent(text)
  })

  it('shows Connected with a filled dot', () => {
    renderWith()
    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows "Connecting" without the alert before the first connection', () => {
    renderWith({ status: 'connecting', events: [] })
    expect(screen.getByRole('status')).toHaveTextContent('Connecting…')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the lost-connection alert after a drop', () => {
    renderWith({ status: 'disconnected' })
    expect(screen.getByRole('alert')).toHaveTextContent('Lost connection to VoiceCoder.')
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting…')
  })

  it('announces "Agent finished" once through the status region', () => {
    renderWith({ messages: at(...UTTERANCE, WORKING, { type: 'agent_result', text: 'Done.', diff: '' }) })
    expect(screen.getByRole('status')).toHaveTextContent('Agent finished')
  })
})

describe('activity entries', () => {
  const log = () => screen.getByRole('log')

  it('intro', () => {
    renderWith()
    expect(within(log()).getByRole('heading', { name: /listening\s*just talk/i })).toBeInTheDocument()
    expect(within(log()).getByText(/say “hey voicecoder” or “coder,”/i)).toBeInTheDocument()
  })

  it('live partials are hidden from screen readers', () => {
    renderWith({ messages: at({ type: 'partial', seq: 0, text: 'hey VoiceCoder' }) })
    const live = within(log()).getByText(/you · live/i).closest('[aria-hidden]')
    expect(live).toHaveAttribute('aria-hidden', 'true')
    expect(live).toHaveTextContent('hey VoiceCoder')
  })

  it('you said + processing', () => {
    renderWith({ messages: at(...UTTERANCE.slice(0, 2)) })
    expect(within(log()).getByText(/^you said$/i)).toBeInTheDocument()
    expect(within(log()).getByText(/processing what you said/i)).toBeInTheDocument()
  })

  it('sent to agent', () => {
    renderWith({ messages: at(...UTTERANCE) })
    expect(within(log()).getByRole('region', { name: 'Sent to agent' })).toHaveTextContent('add a test')
  })

  it('agent working: busy card, progress and a Stop task button', async () => {
    const { value } = renderWith({
      messages: at(...UTTERANCE, WORKING, { type: 'status', text: 'Still working, 10 seconds so far.' }),
    })
    const card = within(log()).getByRole('region', { name: 'Agent' })
    expect(card).toHaveAttribute('aria-busy', 'true')
    expect(card).toHaveTextContent('Working on it.')
    expect(card).toHaveTextContent('Still working, 10 seconds so far.')
    await userEvent.click(within(card).getByRole('button', { name: /stop task/i }))
    expect(value.stopTask).toHaveBeenCalledOnce()
  })

  it('agent working: streamed reply text', () => {
    renderWith({ messages: at(...UTTERANCE, WORKING, { type: 'agent_partial', text: 'I am adding a test' }) })
    expect(within(log()).getByRole('region', { name: 'Agent' })).toHaveTextContent('I am adding a test')
  })

  it('agent result: plain-text summary, file count, approve hint, then ready', () => {
    const diff = 'diff --git a/a.py b/a.py\n+x\ndiff --git a/b.py b/b.py\n+y\n'
    renderWith({
      messages: at(...UTTERANCE, WORKING, { type: 'agent_result', text: 'I added <b>tests</b>.', diff }),
    })
    const card = within(log()).getByRole('region', { name: 'Agent' })
    expect(card).toHaveTextContent('Finished in 1 s')
    expect(card).toHaveTextContent('I added <b>tests</b>.')
    expect(card.querySelector('b')).toBeNull()
    expect(card).toHaveTextContent('2 files changed by this request')
    expect(card).toHaveTextContent('Say approve to keep these changes, or ask me to undo them.')
    expect(within(card).getByText('approve').tagName).toBe('STRONG')
    expect(card).not.toHaveTextContent(/reject/i)
    expect(within(log()).getByText(/listening for your next request/i)).toBeInTheDocument()
  })

  it('stopped', () => {
    renderWith({
      messages: at(...UTTERANCE, WORKING, { type: 'status', text: 'Stopped. Some files may have changed.' }),
    })
    expect(within(log()).getByRole('region', { name: 'Agent' })).toHaveTextContent('Stopped. Some files may have changed.')
    expect(screen.getByRole('status')).toHaveTextContent('Agent stopped')
  })

  it('no speech', () => {
    renderWith({ messages: at({ type: 'error', text: 'I did not hear anything. Try again, a little closer to the mic.' }) })
    expect(within(log()).getByText('I did not hear anything.')).toBeInTheDocument()
    expect(within(log()).getByText(/still listening/i)).toBeInTheDocument()
  })

  it('wake phrase reminder', () => {
    renderWith({
      messages: at(
        { type: 'transcript', text: 'add a test' },
        { type: 'status', text: 'Say hey VoiceCoder, hey Coder, or Coder, then your request.' },
      ),
    })
    expect(within(log()).getByText(/didn’t hear the wake phrase/i)).toBeInTheDocument()
  })

  it('other errors show the bridge text', () => {
    renderWith({ messages: at({ type: 'error', text: 'Something else broke' }) })
    expect(within(log()).getByText('Something else broke')).toBeInTheDocument()
  })
})

describe('read aloud', () => {
  const RESULT = at(...UTTERANCE, WORKING, { type: 'agent_result', text: 'I added a test.', diff: '' })

  it('is a pressed toggle that calls setReadAloud', async () => {
    const { value } = renderWith()
    const toggle = screen.getByRole('button', { name: /read aloud/i })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(toggle)
    expect(value.setReadAloud).toHaveBeenCalledWith(false)
  })

  it('shows Off when the preference is off', () => {
    renderWith({ readAloud: false })
    expect(screen.getByRole('button', { name: /read aloud/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('while speaking: status says so and the latest result offers Stop reading', async () => {
    const { value } = renderWith({ messages: RESULT, speaking: true })
    expect(screen.getByRole('status')).toHaveTextContent('Reading aloud · mic paused')
    const card = within(screen.getByRole('log')).getByRole('region', { name: 'Agent' })
    expect(card).toHaveTextContent('Reading this aloud. Mic paused.')
    await userEvent.click(within(card).getByRole('button', { name: /stop reading/i }))
    expect(value.stopSpeaking).toHaveBeenCalledOnce()
  })

  it('Escape stops reading from anywhere on the page', async () => {
    const { value } = renderWith({ messages: RESULT, speaking: true })
    await userEvent.keyboard('{Escape}')
    expect(value.stopSpeaking).toHaveBeenCalledOnce()
  })

  it('no reading row or Escape handling when nothing is being read', async () => {
    const { value } = renderWith({ messages: RESULT, speaking: false })
    expect(screen.queryByRole('button', { name: /stop reading/i })).not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(value.stopSpeaking).not.toHaveBeenCalled()
  })
})
