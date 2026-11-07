import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { useParams } from 'react-router-dom';
import {
  Copy,
  CornerUpLeft,
  Hash,
  Menu,
  Radio as RadioIcon,
  Smile,
  SquarePen,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../../stores/auth.js';
import { useChat } from '../../stores/chat.js';
import { useVoice } from '../../stores/voice.js';
import { useUi } from '../../stores/ui.js';
import { useI18n } from '../../i18n/index.js';
import { getCurrentDict } from '../../i18n/index.js';
import { toast } from '../../stores/toast.js';
import { Avatar, cn } from '../../components/ui.js';
import { renderMessageContent } from '../../lib/format.js';
import type { Message } from '../../../shared/types.js';

const NO_TYPING: Record<string, { userId: string; displayName: string; expiresAt: number }> = {};

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '🙏'];
const COMPOSER_EMOJIS = ['😀', '😂', '🥲', '😍', '🤔', '😎', '😴', '🙃', '👍', '🙏', '🔥', '❤️', '🎉', '🎵', '☕', '🌙', '⚽', '🎮'];

export function ChannelChat() {
  const { channelId = '' } = useParams();
  const { t, locale, formatTime, formatDayLabel } = useI18n();
  const me = useAuth((s) => s.me);
  const users = useAuth((s) => s.users);
  const channels = useChat((s) => s.channels);
  const messages = useChat((s) => s.messages[channelId]);
  const hasMore = useChat((s) => s.hasMore[channelId] ?? false);
  const loading = useChat((s) => s.loadingChannel === channelId);
  const typing = useChat((s) => s.typing[channelId] ?? NO_TYPING);
  const openChannel = useChat((s) => s.openChannel);
  const loadOlder = useChat((s) => s.loadOlder);
  const markRead = useChat((s) => s.markRead);

  const channel = channels.find((c) => c.id === channelId);

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);

  useEffect(() => {
    if (channelId) void openChannel(channelId);
  }, [channelId, openChannel]);

  // Reset stickiness when switching channels.
  useEffect(() => {
    stickToBottom.current = true;
  }, [channelId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
      setShowJump(false);
    }
  }, [messages, channelId]);

  useEffect(() => {
    markRead(channelId);
  }, [channelId, messages, markRead]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = distanceToBottom < 90;
    setShowJump(distanceToBottom > 300);
    if (el.scrollTop < 220 && hasMore && !loading) void loadOlder(channelId);
  }, [channelId, hasMore, loading, loadOlder]);

  const typingUsers = useMemo(() => Object.values(typing), [typing]);

  if (!channel) {
    return <div className="flex flex-1 items-center justify-center text-mist-500">{t.common.loading}</div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/5 bg-ink-850/50 px-4 backdrop-blur">
        <button
          className="rounded-lg p-1.5 text-mist-400 hover:bg-white/5 lg:hidden"
          onClick={() => useUi.getState().setMobileNav(true)}
          aria-label="menu"
        >
          <Menu size={18} />
        </button>
        <Hash size={18} className="text-brand-400" />
        <h1 className="text-sm font-extrabold text-mist-100">{channel.name}</h1>
      </header>

      {/* Messages */}
      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto px-4 py-4">
          {loading && messages === undefined && (
            <div className="space-y-4 pt-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex animate-pulse gap-3">
                  <div className="h-9 w-9 rounded-full bg-white/5" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-28 rounded bg-white/5" />
                    <div className="h-3 w-2/3 rounded bg-white/5" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {hasMore && messages && messages.length > 0 && (
            <div className="flex justify-center pb-4">
              <button
                onClick={() => void loadOlder(channelId)}
                className="rounded-full border border-white/8 bg-white/[0.03] px-4 py-1.5 text-xs text-mist-400 hover:text-mist-200"
              >
                {t.chat.loadOlder}
              </button>
            </div>
          )}

          {messages?.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <span className="text-4xl">💬</span>
              <p className="text-sm font-bold text-mist-300">{t.chat.noMessages}</p>
            </div>
          )}

          <div className="space-y-0.5">
            {messages?.map((message, index) => {
              const prev = messages[index - 1];
              const showDay =
                !prev || formatDayLabel(prev.createdAt) !== formatDayLabel(message.createdAt);
              const grouped =
                !showDay &&
                prev &&
                prev.author.id === message.author.id &&
                !message.replyTo &&
                new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
              return (
                <div key={message.id}>
                  {showDay && (
                    <div className="my-4 flex items-center gap-3">
                      <div className="h-px flex-1 bg-white/6" />
                      <span className="rounded-full border border-white/8 bg-ink-800 px-3 py-1 text-[11px] font-bold text-mist-400">
                        {formatDayLabel(message.createdAt)}
                      </span>
                      <div className="h-px flex-1 bg-white/6" />
                    </div>
                  )}
                  <MessageItem message={message} grouped={!!grouped} />
                </div>
              );
            })}
          </div>
        </div>

        {showJump && (
          <button
            onClick={() => {
              stickToBottom.current = true;
              const el = scrollRef.current;
              if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
            }}
            className="absolute bottom-4 start-1/2 -translate-x-1/2 rounded-full border border-brand-500/30 bg-ink-800 px-4 py-1.5 text-xs font-bold text-brand-200 shadow-card rtl:translate-x-1/2"
          >
            ↓ {t.chat.jumpToBottom}
          </button>
        )}
      </div>

      {/* Typing indicator */}
      <div className="h-5 px-5 text-[11px] text-mist-500">
        {typingUsers.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1 w-1 animate-bounce rounded-full bg-brand-400"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </span>
            {typingUsers.length === 1
              ? `${typingUsers[0]!.displayName} ${t.chat.typing}`
              : `${t.common.members} · ${t.chat.typing}`}
          </span>
        )}
      </div>

      <Composer channelId={channelId} channelName={channel.name} />

      {/* Voice quick access stays in the sidebar; nothing extra needed here. */}
    </div>
  );
}

/* ── Single message ─────────────────────────────────────────── */

function MessageItem({ message, grouped }: { message: Message; grouped: boolean }) {
  const { t, formatTime } = useI18n();
  const me = useAuth((s) => s.me);
  const toggleReaction = useChat((s) => s.toggleReaction);
  const deleteMessage = useChat((s) => s.deleteMessage);
  const setReplyTo = useComposerStore((s) => s.setReplyTo);
  const setEditing = useComposerStore((s) => s.setEditing);

  const isMine = me?.id === message.author.id;
  const isModerator = me?.role === 'owner' || me?.role === 'admin';
  const deleted = message.deletedAt !== null;

  return (
    <div
      className={cn(
        'group relative flex gap-3 rounded-xl px-2 py-1 transition-colors hover:bg-white/[0.025]',
        grouped ? 'mt-0' : 'mt-3',
      )}
    >
      {grouped ? (
        <span className="w-9 shrink-0 pt-1 text-end text-[10px] text-transparent group-hover:text-mist-600">
          {formatTime(message.createdAt)}
        </span>
      ) : (
        <Avatar name={message.author.displayName} src={message.author.avatar} size={36} className="mt-0.5" />
      )}

      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-extrabold text-mist-100">{message.author.displayName}</span>
            <span className="text-[10px] text-mist-600">{formatTime(message.createdAt)}</span>
          </div>
        )}

        {message.replyTo && (
          <div className="mb-1 flex items-center gap-1.5 rounded-lg border-s-2 border-brand-500/50 bg-white/[0.03] px-2.5 py-1 text-[11px] text-mist-400">
            <CornerUpLeft size={11} className="shrink-0 text-brand-400" />
            <span className="font-bold text-brand-300">{message.replyTo.authorName}</span>
            <span className="truncate opacity-80">{message.replyTo.content || '…'}</span>
          </div>
        )}

        {deleted ? (
          <p className="text-[13px] italic text-mist-600">{t.chat.deleted}</p>
        ) : (
          <p className="text-[13.5px] leading-relaxed break-words whitespace-pre-wrap text-mist-200">
            {renderMessageContent(message.content)}
            {message.editedAt && (
              <span className="ms-1.5 align-middle text-[10px] text-mist-600">({t.chat.edited})</span>
            )}
          </p>
        )}

        {/* Reactions */}
        {message.reactions.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {message.reactions.map((reaction) => {
              const mine = reaction.userIds.includes(me?.id ?? '');
              return (
                <button
                  key={reaction.emoji}
                  onClick={() => void toggleReaction(message, reaction.emoji)}
                  className={cn(
                    'flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors',
                    mine
                      ? 'border-brand-500/60 bg-brand-500/15 text-brand-200'
                      : 'border-white/8 bg-white/[0.04] text-mist-300 hover:border-white/20',
                  )}
                >
                  <span>{reaction.emoji}</span>
                  <span className="font-bold">{reaction.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Hover toolbar */}
      {!deleted && (
        <div className="absolute -top-3 end-3 hidden items-center gap-0.5 rounded-xl border border-white/10 bg-ink-750 px-1 py-0.5 shadow-card group-hover:flex">
          <ToolbarButton onClick={() => setReplyTo(message)} title={t.common.reply}>
            <CornerUpLeft size={14} />
          </ToolbarButton>
          <ReactionPicker onPick={(emoji) => void toggleReaction(message, emoji)} />
          <ToolbarButton onClick={() => void navigator.clipboard.writeText(message.content).catch(() => {})} title={t.common.copy}>
            <Copy size={14} />
          </ToolbarButton>
          {isMine && (
            <ToolbarButton onClick={() => setEditing(message)} title={t.common.edit}>
              <SquarePen size={14} />
            </ToolbarButton>
          )}
          {(isMine || isModerator) && (
            <ToolbarButton
              onClick={() => void deleteMessage(message)}
              title={t.common.delete}
              danger
            >
              <Trash2 size={14} />
            </ToolbarButton>
          )}
        </div>
      )}

    </div>
  );
}

function ToolbarButton({
  onClick,
  title,
  danger,
  children,
}: {
  onClick: () => void;
  title: string;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'rounded-lg p-1.5 text-mist-400 transition-colors hover:bg-white/8 hover:text-mist-100',
        danger && 'hover:text-rose-300',
      )}
    >
      {children}
    </button>
  );
}

function ReactionPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="reaction"
        className="rounded-lg p-1.5 text-mist-400 transition-colors hover:bg-white/8 hover:text-mist-100"
      >
        <Smile size={14} />
      </button>
      {open && (
        <div className="absolute end-0 top-full z-20 mt-1 flex gap-1 rounded-xl border border-white/10 bg-ink-750 p-1.5 shadow-card">
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                onPick(emoji);
                setOpen(false);
              }}
              className="rounded-lg p-1 text-base transition-transform hover:scale-125"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Composer-local store (reply / edit state) ──────────────── */


interface ComposerState {
  replyTo: Message | null;
  editing: Message | null;
  setReplyTo: (m: Message | null) => void;
  setEditing: (m: Message | null) => void;
}

export const useComposerStore = create<ComposerState>((set) => ({
  replyTo: null,
  editing: null,
  setReplyTo: (m) => set({ replyTo: m, editing: null }),
  setEditing: (m) => set({ editing: m, replyTo: null }),
}));

/* ── Composer ───────────────────────────────────────────────── */

interface SlashCommand {
  name: string;
  args?: string;
  description: string;
  run: (ctx: { channelId: string }) => void;
}

function Composer({ channelId, channelName }: { channelId: string; channelName: string }) {
  const { t } = useI18n();
  const sendMessage = useChat((s) => s.sendMessage);
  const editMessage = useChat((s) => s.editMessage);
  const notifyTyping = useChat((s) => s.notifyTyping);
  const setRadioModal = useChat((s) => s.setRadioModal);
  const replyTo = useComposerStore((s) => s.replyTo);
  const editing = useComposerStore((s) => s.editing);
  const setReplyTo = useComposerStore((s) => s.setReplyTo);
  const setEditing = useComposerStore((s) => s.setEditing);

  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);

  const voiceChannelId = useVoice((s) => s.channelId);

  const commands: SlashCommand[] = useMemo(
    () => [
      {
        name: '/mp',
        description: t.chat.commandMp,
        run: () => {
          if (!voiceChannelId) {
            toast.error(getCurrentDict().chat.radioNeedsVoice);
            return;
          }
          setRadioModal(voiceChannelId);
        },
      },
      {
        name: '/mp stop',
        description: t.chat.commandMpStop,
        run: () => {
          if (!voiceChannelId) {
            toast.error(getCurrentDict().chat.radioNeedsVoice);
            return;
          }
          void useVoice.getState().stopRadio(voiceChannelId);
        },
      },
      { name: '/help', description: t.chat.commandHelp, run: () => toast.info(buildHelpText(t)) },
      {
        name: '/shrug',
        description: t.chat.commandShrug,
        run: (ctx: { channelId: string }) => {
          void sendMessage(ctx.channelId, '¯\\_(ツ)_/¯');
        },
      },
    ],
    [t, voiceChannelId, setRadioModal, sendMessage],
  );

  // Editing mode prefill
  useEffect(() => {
    if (editing) {
      setValue(editing.content);
      textareaRef.current?.focus();
    }
  }, [editing]);

  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  const showCommandMenu = value.startsWith('/');
  const matchingCommands = showCommandMenu
    ? commands.filter((c) => c.name.startsWith(value.trim()) || c.name.startsWith(value.trimEnd()))
    : [];

  const submit = async () => {
    const text = value.trim();
    if (!text || busy) return;

    // Slash-command handling (validated here; radio actions re-validated server-side).
    if (text.startsWith('/') && !editing) {
      const exact = commands.find((c) => c.name === text);
      if (exact) {
        setValue('');
        exact.run({ channelId });
        return;
      }
      if (matchingCommands.length === 0) {
        toast.info(`${t.chat.unknownCommand} /mp · /mp stop · /help · /shrug`);
        return;
      }
    }

    setBusy(true);
    try {
      if (editing) {
        await editMessage(editing, text);
        setEditing(null);
      } else {
        await sendMessage(channelId, text, replyTo?.id);
        setReplyTo(null);
      }
      setValue('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } catch {
      toast.error(getCurrentDict().common.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shrink-0 px-4 pb-4">
      {replyTo && !editing && (
        <div className="mb-1.5 flex items-center gap-2 rounded-t-xl border border-b-0 border-white/8 bg-white/[0.04] px-3 py-1.5 text-xs text-mist-400">
          <CornerUpLeft size={12} className="text-brand-400" />
          <span>
            {t.chat.replyTo} <b className="text-brand-300">{replyTo.author.displayName}</b>
          </span>
          <button onClick={() => setReplyTo(null)} className="ms-auto text-mist-500 hover:text-mist-200">
            ✕
          </button>
        </div>
      )}

      {editing && (
        <div className="mb-1.5 flex items-center gap-2 rounded-t-xl border border-b-0 border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">
          <SquarePen size={12} />
          <span>{t.chat.editing}</span>
          <button onClick={() => setEditing(null)} className="ms-auto hover:text-amber-100">
            ✕
          </button>
        </div>
      )}

      <div className="relative rounded-2xl border border-white/8 bg-ink-800/90 transition-colors focus-within:border-brand-500/50">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          placeholder={t.chat.placeholder}
          onChange={(e) => {
            setValue(e.target.value);
            notifyTyping(channelId);
            // auto-grow
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !composing.current) {
              e.preventDefault();
              void submit();
            } else if (e.key === 'Escape') {
              setEditing(null);
              setReplyTo(null);
            }
          }}
          onCompositionStart={() => (composing.current = true)}
          onCompositionEnd={() => (composing.current = false)}
          className="max-h-40 w-full resize-none bg-transparent px-4 py-3 pe-24 text-[13.5px] leading-relaxed text-mist-100 outline-none placeholder:text-mist-500"
          dir="auto"
        />

        {/* Emoji quick picker */}
        <div className="absolute end-2 bottom-2 flex items-center gap-1">
          <div className="group relative">
            <button className="rounded-lg p-1.5 text-mist-500 hover:bg-white/6 hover:text-mist-200" title="emoji">
              <Smile size={17} />
            </button>
            <div className="invisible absolute bottom-full end-0 z-20 mb-1 grid w-56 grid-cols-6 gap-0.5 rounded-xl border border-white/10 bg-ink-750 p-2 opacity-0 shadow-card transition-opacity group-hover:visible group-hover:opacity-100">
              {COMPOSER_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => setValue((v) => v + emoji)}
                  className="rounded-lg p-1 text-lg transition-transform hover:scale-125"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => void submit()}
            disabled={!value.trim() || busy}
            className="brand-gradient rounded-xl px-3 py-1.5 text-xs font-extrabold text-white shadow-glow transition-opacity disabled:opacity-40"
            title={t.common.send}
          >
            ➤
          </button>
        </div>

        {/* Slash-command menu */}
        {showCommandMenu && matchingCommands.length > 0 && (
          <div className="absolute bottom-full start-0 z-20 mb-2 w-80 overflow-hidden rounded-xl border border-white/10 bg-ink-750 shadow-card">
            {matchingCommands.map((cmd) => (
              <button
                key={cmd.name}
                onClick={() => {
                  if (cmd.name.includes(' ')) {
                    setValue(cmd.name);
                    void submit();
                  } else {
                    setValue(`${cmd.name} `);
                    textareaRef.current?.focus();
                  }
                }}
                className="flex w-full items-center gap-3 px-3.5 py-2.5 text-start hover:bg-white/6"
              >
                <RadioIcon size={14} className="text-brand-400" />
                <span>
                  <span dir="ltr" className="block text-xs font-extrabold text-mist-100">{cmd.name}</span>
                  <span className="block text-[11px] text-mist-500">{cmd.description}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="mt-1 hidden ps-2 text-[10px] text-mist-600 sm:block"># {channelName}</p>
    </div>
  );
}

function buildHelpText(t: ReturnType<typeof getCurrentDict>): string {
  return `⌘ /mp — ${t.chat.commandMp}\n⌘ /mp stop — ${t.chat.commandMpStop}\n⌘ /help — ${t.chat.commandHelp}\n⌘ /shrug — ${t.chat.commandShrug}`;
}
