'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import { useMemo, useState } from 'react';

/**
 * The subset of a tool-invocation message part that the inspector below
 * renders. Every field is optional because the AI SDK emits several part
 * shapes (`dynamic-tool`, `tool-<name>`) and adds fields between versions;
 * treating them as optional is what makes narrowing to this type sound.
 */
type ToolLikePart = {
  type?: string;
  toolCallId?: string;
  toolName?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

export default function Chat() {
  const [input, setInput] = useState('');
  const [expandedToolCalls, setExpandedToolCalls] = useState<Record<string, boolean>>({});

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

  const lastAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i];
    }
    return undefined;
  }, [messages]);

  const isReasoning = useMemo(() => {
    if (!lastAssistant) return false;
    return (
      lastAssistant.parts?.some(part => part.type === 'reasoning') &&
      (status === 'submitted' || status === 'streaming')
    );
  }, [lastAssistant, status]);

  function toggleToolCall(id: string) {
    setExpandedToolCalls(prev => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className={`flex flex-col w-full ${messages.length === 0 ? 'max-w-5xl' : 'max-w-md'} py-24 mx-auto stretch`}>
      {/* Zero state */}
      {messages.length === 0 && (
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-center mb-6">OpenSea Assistant</h1>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
              <div className="text-sm font-semibold mb-3">Examples</div>
              <div className="space-y-2">
                {[
                  'Which NFT collections are trending in the last 24h?',
                  'Show top NFT collections by volume this week.',
                  "What's the floor price and 24h volume for Pudgy Penguins?",
                  'Find BAYC NFTs with gold traits.',
                ].map(q => (
                  <button
                    key={q}
                    type="button"
                    className="w-full text-left text-sm px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    onClick={() => sendMessage({ text: q })}
                    disabled={status !== 'ready'}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
              <div className="text-sm font-semibold mb-3">Quick actions</div>
              <div className="space-y-2">
                {[
                  'Show top tokens by 24h volume on Ethereum.',
                  'Which tokens are trending on Base today?',
                  'Search collections named "Bored Ape".',
                  'Get a swap quote to trade 1 ETH to USDC on Ethereum.',
                ].map(q => (
                  <button
                    key={q}
                    type="button"
                    className="w-full text-left text-sm px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    onClick={() => sendMessage({ text: q })}
                    disabled={status !== 'ready'}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
              <div className="text-sm font-semibold mb-3">Wallet & items</div>
              <div className="space-y-2">
                {[
                  'Show NFT holdings for a wallet (you can ask me for the address).',
                  'List token balances for a wallet.',
                  'Get details for the BONK token.',
                  'How active is the Doodles collection today?',
                ].map(q => (
                  <button
                    key={q}
                    type="button"
                    className="w-full text-left text-sm px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    onClick={() => sendMessage({ text: q })}
                    disabled={status !== 'ready'}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Messages */}
      {messages.map(message => (
        <div key={message.id} className="whitespace-pre-wrap text-sm leading-6 mb-4">
          <div className="font-semibold mb-1">{message.role === 'user' ? 'User' : 'AI'}</div>
          {message.parts.map((part, i) => {
            const key = `${message.id}-${i}`;
            switch (part.type) {
              case 'text':
                return (
                  <div key={key} className="text-zinc-900 dark:text-zinc-100">
                    {part.text}
                  </div>
                );
              case 'reasoning':
                // Do not show raw reasoning content; just an indicator elsewhere
                return <div key={key} />;
              default: {
                // Tool parts arrive under two shapes: `dynamic-tool` and
                // `tool-<name>`. Rather than widening to `any`, describe the
                // few fields this inspector reads and narrow into it. The cast
                // stays honest because every field is optional: nothing here
                // assumes a property the SDK might not send.
                const p = part as ToolLikePart;
                if (p && (p.toolCallId != null || String(p.type || '').startsWith('tool-') || p.type === 'dynamic-tool')) {
                  const callId: string = p.toolCallId ?? `${message.id}-${i}`;
                  const expanded = expandedToolCalls[callId] ?? false;
                  const toolName: string = p.toolName ?? String(p.type || '').replace(/^tool-/, '') ?? 'tool';
                  const state = p.state;
                  const stateLabel = state === 'input-streaming'
                    ? 'Running'
                    : state === 'input-available'
                      ? 'Pending'
                      : state === 'output-available'
                        ? 'Done'
                        : state === 'output-error'
                          ? 'Error'
                          : (state ?? '');

                  return (
                    <div key={key} className="border border-zinc-200 dark:border-zinc-800 rounded-md mt-2">
                      <button
                        type="button"
                        onClick={() => toggleToolCall(callId)}
                        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900"
                      >
                        <span className="font-medium">Tool: {toolName}</span>
                        <span className="text-xs text-zinc-500">{stateLabel}</span>
                      </button>
                      {expanded && (
                        <div className="px-3 pb-3 space-y-2">
                          {state && (
                            <div className="text-xs text-zinc-500">State: {state}</div>
                          )}
                          {p.input != null && (
                            <div>
                              <div className="text-xs font-semibold mb-1">Input</div>
                              <pre className="text-xs bg-zinc-50 dark:bg-zinc-900 p-2 rounded overflow-auto">
{JSON.stringify(p.input, null, 2)}
                              </pre>
                            </div>
                          )}
                          {p.output != null && (
                            <div>
                              <div className="text-xs font-semibold mb-1">Output</div>
                              <pre className="text-xs bg-zinc-50 dark:bg-zinc-900 p-2 rounded overflow-auto">
{JSON.stringify(p.output, null, 2)}
                              </pre>
                            </div>
                          )}
                          {p.errorText && (
                            <div>
                              <div className="text-xs font-semibold mb-1">Error</div>
                              <div className="text-xs text-red-600">{p.errorText}</div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                }
                return <div key={key} />;
              }
            }
          })}
        </div>
      ))}

      {/* Reasoning indicator */}
      {isReasoning && (
        <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 mb-3">
          <div className="h-2 w-2 rounded-full bg-zinc-400 animate-pulse" />
          <div className="rounded-md px-2 py-1 bg-zinc-100 dark:bg-zinc-900 shimmer">
            Reasoning…
          </div>
        </div>
      )}

      {error && (
        <div className="text-xs text-red-600 mb-2">Something went wrong.</div>
      )}

      {/* Spacer to prevent messages from being hidden behind the fixed input */}
      <div className="h-28" />

      <form
        onSubmit={e => {
          e.preventDefault();
          if (input.trim()) {
            sendMessage({ text: input });
            setInput('');
          }
        }}
      >
        <input
          className="fixed z-50 bg-white dark:bg-zinc-900 bottom-8 left-1/2 -translate-x-1/2 w-full max-w-md px-4 py-3 border border-zinc-300 dark:border-zinc-800 rounded-xl shadow-2xl"
          value={input}
          placeholder={status === 'ready' ? 'Say something…' : 'Thinking…'}
          onChange={e => setInput(e.currentTarget.value)}
          disabled={status !== 'ready'}
        />
      </form>
    </div>
  );
}