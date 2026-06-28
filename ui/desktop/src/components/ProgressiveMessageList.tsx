/**
 * ProgressiveMessageList Component
 *
 * A performance-optimized message list that renders only the most recent
 * messages on mount (tail-first windowing) and loads older messages upward as
 * the user scrolls toward the top. This keeps opening a long (multi-compaction)
 * conversation fast: the entire history is never mounted top-down at once.
 *
 * Key Features:
 * - Tail-first windowing: render the recent tail, grow the window upward on scroll
 * - Window expands to the full history while in-page search is open, so search
 *   can reach every message
 * - Anchors scroll position when older messages are prepended (no view jump)
 * - Maintains search functionality compatibility
 */

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { defineMessages, useIntl } from '../i18n';
import { Message, SystemNotificationContent } from '../api';
import GooseMessage from './GooseMessage';
import UserMessage from './UserMessage';
import {
  SystemNotificationInline,
  getInlineSystemNotification,
} from './context_management/SystemNotificationInline';
import {
  CreditsExhaustedNotification,
  getCreditsExhaustedNotification,
} from './context_management/CreditsExhaustedNotification';
import {
  NotificationEvent,
  getToolRequests,
  getToolResponses,
  getAnyToolConfirmationData,
  getPendingToolConfirmationIds,
  ToolConfirmationData,
  ToolResponseMessageContent,
} from '../types/message';
import { ChatType } from '../types/chat';
import type { ScrollAreaHandle } from './ui/scroll-area';
import {
  identifyConsecutiveToolCalls,
  isInChain,
  shouldHideTimestamp,
} from '../utils/toolCallChaining';
import { getModelDisplayName } from './settings/models/predefinedModelsUtils';

const i18n = defineMessages({
  modelChanged: {
    id: 'progressiveMessageList.modelChanged',
    defaultMessage: 'Model changed: {previousModel} → {currentModel}',
  },
});

// Tail-first windowing: render only the most recent messages and load older ones
// upward when the user scrolls near the top. Opening a long (multi-compaction)
// conversation no longer mounts the entire history top-down and scrolls through it.
const TAIL_WINDOW = 40;
const LOAD_OLDER_BATCH = 40;
const SCROLL_TOP_THRESHOLD = 300;

interface ProgressiveMessageListProps {
  messages: Message[];
  chat: Pick<ChatType, 'sessionId'>;
  // Scroll viewport owner, used to detect scroll-near-top and to anchor the
  // viewport when older messages are prepended.
  scrollAreaRef?: React.RefObject<ScrollAreaHandle | null>;
  toolCallNotifications?: Map<string, NotificationEvent[]>; // Make optional
  append?: (value: string) => void; // Make optional
  isUserMessage: (message: Message) => boolean;
  // True while in-page search is open; expands the window to the full history so
  // search can reach every message.
  searchActive?: boolean;
  // Custom render function for messages
  renderMessage?: (message: Message, index: number) => React.ReactNode | null;
  isStreamingMessage?: boolean; // Whether messages are currently being streamed
  onMessageUpdate?: (messageId: string, newContent: string, editType?: 'fork' | 'edit') => void;
  onRenderingComplete?: () => void; // Callback when all messages are rendered
  submitElicitationResponse?: (
    elicitationId: string,
    userData: Record<string, unknown>
  ) => Promise<boolean>;
}

export default function ProgressiveMessageList({
  messages,
  chat,
  scrollAreaRef,
  toolCallNotifications = new Map(),
  append = () => {},
  isUserMessage,
  searchActive = false,
  renderMessage, // Custom render function
  isStreamingMessage = false, // Whether messages are currently being streamed
  onMessageUpdate,
  onRenderingComplete,
  submitElicitationResponse,
}: ProgressiveMessageListProps) {
  const intl = useIntl();
  // Window is [windowStart, messages.length). Anchoring on the START (not a tail
  // COUNT) means messages appended during streaming extend the bottom and never
  // drop the oldest rendered message — so the view never jumps when the user has
  // scrolled up while the model is still streaming. windowStart only decreases
  // (load older) or resets on a new session mount.
  const [windowStart, setWindowStart] = useState(() => Math.max(0, messages.length - TAIL_WINDOW));
  const prependAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const hasOnlyToolResponses = (message: Message) =>
    message.content.every((c) => c.type === 'toolResponse');

  const getResolvedModel = useCallback((message: Message): string | null => {
    if (message.role !== 'assistant' || !message.metadata.userVisible) return null;
    return message.metadata.inference?.resolvedModel ?? null;
  }, []);

  const getPreviousResolvedModel = useCallback(
    (index: number): string | null => {
      for (let i = index - 1; i >= 0; i--) {
        const model = getResolvedModel(messages[i]);
        if (model) return model;
      }
      return null;
    },
    [getResolvedModel, messages]
  );

  const renderModelChangeDisclosure = useCallback(
    (previousModel: string, currentModel: string) => (
      <SystemNotificationInline
        notification={{
          msg: intl.formatMessage(i18n.modelChanged, {
            previousModel: getModelDisplayName(previousModel),
            currentModel: getModelDisplayName(currentModel),
          }),
          notificationType: 'inlineMessage',
        }}
      />
    ),
    [intl]
  );

  const getSystemNotification = (message: Message): SystemNotificationContent | undefined => {
    return getCreditsExhaustedNotification(message) ?? getInlineSystemNotification(message);
  };

  const renderSystemNotification = (notification: SystemNotificationContent) => {
    switch (notification.notificationType) {
      case 'creditsExhausted':
        return <CreditsExhaustedNotification notification={notification} />;
      case 'inlineMessage':
        return <SystemNotificationInline notification={notification} />;
      default:
        return null;
    }
  };

  // Tail-first: the bottom of the conversation is already rendered on mount, so
  // signal completion once to let BaseChat anchor the viewport at the bottom.
  useEffect(() => {
    if (!onRenderingComplete) return;
    const t = setTimeout(() => onRenderingComplete(), 50);
    return () => clearTimeout(t);
    // Fire once on mount; messages are present when BaseChat mounts this list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep windowStart in range when the messages array shrinks (compaction /
  // HistoryReplaced). Without this the load-older / scroll effects would key off
  // a stale start past the new end. renderMessages also clamps defensively.
  useEffect(() => {
    const maxStart = Math.max(0, messages.length - TAIL_WINDOW);
    setWindowStart((current) => (current > maxStart ? maxStart : current));
  }, [messages.length]);

  // While in-page search is open, render the whole history so search can reach
  // any message. Driven by SearchView's open state (not a raw Cmd+F keydown) so
  // the window is fully expanded BEFORE the user types and the highlighter runs;
  // SearchHighlighter's MutationObserver then re-highlights as older messages
  // mount. This closes the first-search race where windowed-out matches were
  // missed.
  useEffect(() => {
    if (searchActive) setWindowStart(0);
  }, [searchActive]);

  // Grow the window upward when the user scrolls near the top (load older).
  useEffect(() => {
    const viewport = scrollAreaRef?.current?.viewportRef.current;
    if (!viewport || windowStart <= 0) return;
    const onScroll = () => {
      if (viewport.scrollTop < SCROLL_TOP_THRESHOLD && !prependAnchorRef.current) {
        prependAnchorRef.current = {
          scrollHeight: viewport.scrollHeight,
          scrollTop: viewport.scrollTop,
        };
        setWindowStart((current) => Math.max(0, current - LOAD_OLDER_BATCH));
      }
    };
    viewport.addEventListener('scroll', onScroll, { passive: true });
    return () => viewport.removeEventListener('scroll', onScroll);
  }, [scrollAreaRef, windowStart]);

  // After older messages prepend, restore scroll position so the view doesn't jump.
  useLayoutEffect(() => {
    const anchor = prependAnchorRef.current;
    const viewport = scrollAreaRef?.current?.viewportRef.current;
    if (anchor && viewport) {
      viewport.scrollTop = anchor.scrollTop + (viewport.scrollHeight - anchor.scrollHeight);
      prependAnchorRef.current = null;
    }
  });

  // Detect tool call chains
  const toolCallChains = useMemo(() => identifyConsecutiveToolCalls(messages), [messages]);

  // List-level facts derived ONCE and handed to each GooseMessage, so leaves no
  // longer each re-scan the whole conversation per render (was O(N^2)/render).
  // Keyed by tool-request id, which is unique per tool call.
  const messageDerived = useMemo(() => {
    const toolResponsesByRequestId = new Map<string, ToolResponseMessageContent>();
    const toolConfirmationByRequestId = new Map<string, ToolConfirmationData>();
    const toolRequestIds = new Set<string>();
    for (const message of messages) {
      for (const response of getToolResponses(message)) {
        toolResponsesByRequestId.set(response.id, response);
      }
      const confirmation = getAnyToolConfirmationData(message);
      if (confirmation) {
        toolConfirmationByRequestId.set(confirmation.id, confirmation);
      }
      for (const request of getToolRequests(message)) {
        toolRequestIds.add(request.id);
      }
    }
    return {
      toolResponsesByRequestId,
      toolConfirmationByRequestId,
      toolRequestIds,
      pendingConfirmationIds: getPendingToolConfirmationIds(messages),
    };
  }, [messages]);

  // Render the tail window; `index` is the absolute index in the full
  // conversation (the slice no longer starts at 0).
  const renderMessages = useCallback(() => {
    // Clamp the window start to the current length every render. A compaction /
    // HistoryReplaced can swap in a SHORTER messages array; without this clamp a
    // stale windowStart past the new end yields an empty slice and a blank
    // conversation. Math.max(0, length - TAIL_WINDOW) keeps at least the tail
    // visible and never exceeds windowStart, so the view never grows past what
    // the user already loaded.
    const start = Math.min(windowStart, Math.max(0, messages.length - TAIL_WINDOW));
    const messagesToRender = messages.slice(start);
    return messagesToRender
      .map((message, sliceIndex) => {
        const index = start + sliceIndex;
        if (!message.metadata.userVisible) {
          return null;
        }
        if (renderMessage) {
          return renderMessage(message, index);
        }

        // Default rendering logic (for BaseChat)
        if (!chat) {
          console.warn(
            'ProgressiveMessageList: chat prop is required when not using custom renderMessage'
          );
          return null;
        }

        const notification = getSystemNotification(message);
        if (notification) {
          return (
            <div
              key={`notification-${message.id ?? `msg-${index}-${message.created}`}`}
              className={`relative ${index === 0 ? 'mt-0' : 'mt-4'} assistant`}
              data-testid="message-container"
            >
              {renderSystemNotification(notification)}
            </div>
          );
        }

        const isUser = isUserMessage(message);
        const messageIsInChain = isInChain(index, toolCallChains);
        const currentResolvedModel = getResolvedModel(message);
        const previousResolvedModel = currentResolvedModel ? getPreviousResolvedModel(index) : null;
        const showModelChangeDisclosure = Boolean(
          currentResolvedModel &&
          previousResolvedModel &&
          currentResolvedModel !== previousResolvedModel
        );

        const messageKey = message.id ?? `msg-${index}-${message.created}`;

        return (
          <Fragment key={messageKey}>
            {showModelChangeDisclosure &&
              currentResolvedModel &&
              previousResolvedModel &&
              renderModelChangeDisclosure(previousResolvedModel, currentResolvedModel)}
            <div
              className={`relative ${index === 0 ? 'mt-0' : 'mt-4'} ${isUser ? 'user' : 'assistant'} ${messageIsInChain ? 'in-chain' : ''}`}
              data-testid="message-container"
            >
              {isUser ? (
                !hasOnlyToolResponses(message) && (
                  <UserMessage message={message} onMessageUpdate={onMessageUpdate} />
                )
              ) : (
                <GooseMessage
                  sessionId={chat.sessionId}
                  message={message}
                  append={append}
                  toolCallNotifications={toolCallNotifications}
                  isStreaming={
                    isStreamingMessage &&
                    !isUser &&
                    sliceIndex === messagesToRender.length - 1 &&
                    message.role === 'assistant'
                  }
                  hideTimestamp={shouldHideTimestamp(index, toolCallChains)}
                  toolResponsesByRequestId={messageDerived.toolResponsesByRequestId}
                  toolConfirmationByRequestId={messageDerived.toolConfirmationByRequestId}
                  pendingConfirmationIds={messageDerived.pendingConfirmationIds}
                  toolRequestIds={messageDerived.toolRequestIds}
                  submitElicitationResponse={submitElicitationResponse}
                />
              )}
            </div>
          </Fragment>
        );
      })
      .filter(Boolean);
  }, [
    messages,
    windowStart,
    renderMessage,
    isUserMessage,
    chat,
    append,
    toolCallNotifications,
    isStreamingMessage,
    onMessageUpdate,
    toolCallChains,
    messageDerived,
    submitElicitationResponse,
    getPreviousResolvedModel,
    getResolvedModel,
    renderModelChangeDisclosure,
  ]);

  return <>{renderMessages()}</>;
}
