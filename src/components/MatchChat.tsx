import { useEffect, useRef, useState } from 'react';
import { api } from '@appdeploy/client';
import { MessageSquare, Send } from 'lucide-react';
import { ChatMessage } from '../hooks/useRoom';
import { Avatar, Card, useToast } from './ui';

const QUICK = ['Good luck', 'Nice one', 'Close match', 'Rematch?', 'Well played'];

export function MatchChat({
  roomId,
  messages,
  myPlayerId,
  canChat,
}: {
  roomId: string;
  messages: ChatMessage[];
  myPlayerId: string;
  canChat: boolean;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages.length]);

  const send = async (text: string) => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft('');
    try {
      await api.post(`/api/rooms/${roomId}/chat`, { playerId: myPlayerId, text: body });
    } catch {
      toast('Message could not be sent.', 'err');
      setDraft(body);
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="mt-3 overflow-hidden">
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-ink-700">
        <MessageSquare size={14} className="text-brand" />
        <span className="label">Match chat</span>
        <span className="ml-auto text-[11px] text-chalk-faint">{messages.length} messages</span>
      </div>

      <div className="max-h-52 overflow-y-auto px-3.5 py-2.5 space-y-2">
        {messages.length === 0 ? (
          <p className="text-[12px] text-chalk-faint py-2">
            No messages yet. Say hello — your opponent sees it instantly.
          </p>
        ) : (
          messages.map(message => {
            const mine = message.playerId === myPlayerId;
            return (
              <div key={message.id} className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                <Avatar name={message.name} colour={message.colour || '#EE1B24'} size={24} />
                <div className={`max-w-[75%] ${mine ? 'text-right' : ''}`}>
                  <div className="text-[10px] text-chalk-faint mb-0.5">{mine ? 'You' : message.name}</div>
                  <div
                    className={`inline-block px-2.5 py-1.5 rounded-lg text-[12.5px] leading-snug break-words ${
                      mine ? 'bg-brand text-white' : 'bg-ink-750 text-chalk'
                    }`}
                  >
                    {message.text}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {canChat ? (
        <div className="border-t border-ink-700 p-2.5">
          <div className="flex gap-1.5 mb-2 overflow-x-auto no-scrollbar">
            {QUICK.map(phrase => (
              <button
                key={phrase}
                onClick={() => send(phrase)}
                disabled={sending}
                className="shrink-0 chip bg-ink-750 text-chalk-dim border border-ink-700 hover:text-chalk"
              >
                {phrase}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className="field"
              placeholder="Message your opponent…"
              value={draft}
              maxLength={240}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send(draft)}
              aria-label="Chat message"
            />
            <button className="btn-primary !px-3 shrink-0" onClick={() => send(draft)} disabled={sending || !draft.trim()} aria-label="Send message">
              <Send size={15} />
            </button>
          </div>
        </div>
      ) : (
        <div className="border-t border-ink-700 px-3.5 py-2.5">
          <p className="text-[11.5px] text-chalk-faint">Only players in this match can chat.</p>
        </div>
      )}
    </Card>
  );
}
