import { useMemo, useRef } from 'react';
import ImagePreview from './ImagePreview';
import { formatMessageTimestamp } from '../utils/timeUtils';
import MarkdownContent from './MarkdownContent';
import ThinkingContent from './ThinkingContent';
import ToolCallWithResponse from './ToolCallWithResponse';
import {
  getTextAndImageContent,
  getThinkingContent,
  getToolRequests,
  getToolConfirmationContent,
  getElicitationContent,
  getAnyToolConfirmationData,
  ToolConfirmationData,
  ToolResponseMessageContent,
  NotificationEvent,
} from '../types/message';
import { Message } from '../api';
import ToolCallConfirmation from './ToolCallConfirmation';
import ElicitationRequest from './ElicitationRequest';
import MessageCopyLink from './MessageCopyLink';
import { cn } from '../utils';

interface GooseMessageProps {
  sessionId: string;
  message: Message;
  metadata?: string[];
  toolCallNotifications: Map<string, NotificationEvent[]>;
  append: (value: string) => void;
  isStreaming: boolean;
  // List-level facts derived once by ProgressiveMessageList so this leaf no
  // longer scans the whole conversation on every render. Maps/sets are keyed by
  // tool-request id (unique per tool call).
  hideTimestamp: boolean;
  toolResponsesByRequestId: Map<string, ToolResponseMessageContent>;
  toolConfirmationByRequestId: Map<string, ToolConfirmationData>;
  pendingConfirmationIds: Set<string>;
  toolRequestIds: Set<string>;
  submitElicitationResponse?: (
    elicitationId: string,
    userData: Record<string, unknown>
  ) => Promise<boolean>;
}

export default function GooseMessage({
  sessionId,
  message,
  toolCallNotifications,
  append,
  isStreaming,
  hideTimestamp,
  toolResponsesByRequestId,
  toolConfirmationByRequestId,
  pendingConfirmationIds,
  toolRequestIds,
  submitElicitationResponse,
}: GooseMessageProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);

  const { textContent: displayText, imagePaths } = getTextAndImageContent(message);
  const thinkingContent = getThinkingContent(message);

  const timestamp = useMemo(() => formatMessageTimestamp(message.created), [message.created]);
  const toolRequests = getToolRequests(message);
  const toolConfirmationContent = getToolConfirmationContent(message);
  const elicitationContent = getElicitationContent(message);

  const hasToolConfirmation = toolConfirmationContent !== undefined;
  const hasElicitation = elicitationContent !== undefined;
  const elicitationData =
    elicitationContent?.data.actionType === 'elicitation'
      ? (elicitationContent.data as typeof elicitationContent.data & {
          isSubmitted?: boolean;
          isCancelled?: boolean;
        })
      : undefined;

  // This message's own confirmation is shown inline by the tool-call card iff
  // its request id appears among the conversation's tool requests.
  const ownConfirmationData = getAnyToolConfirmationData(message);
  const toolConfirmationShownInline =
    hasToolConfirmation &&
    ownConfirmationData !== undefined &&
    toolRequestIds.has(ownConfirmationData.id);

  return (
    <div className="goose-message flex w-[90%] justify-start min-w-0">
      <div className="flex flex-col w-full min-w-0">
        {thinkingContent && (
          <ThinkingContent
            content={thinkingContent}
            isExpanded={
              isStreaming &&
              !displayText.trim() &&
              imagePaths.length === 0 &&
              toolRequests.length === 0
            }
          />
        )}

        {(displayText.trim() || imagePaths.length > 0) && (
          <div className="flex flex-col group">
            {displayText.trim() && (
              <div ref={contentRef} className="w-full">
                <MarkdownContent content={displayText} />
              </div>
            )}

            {imagePaths.length > 0 && (
              <div className="mt-4">
                {imagePaths.map((imagePath, index) => (
                  <ImagePreview key={index} src={imagePath} />
                ))}
              </div>
            )}

            {toolRequests.length === 0 && (
              <div className="relative flex justify-start">
                {!isStreaming && (
                  <div className="text-xs font-mono text-text-secondary pt-1 transition-all duration-200 group-hover:-translate-y-4 group-hover:opacity-0">
                    {timestamp}
                  </div>
                )}
                {message.content.every((content) => content.type === 'text') && !isStreaming && (
                  <div className="absolute left-0 pt-1">
                    <MessageCopyLink text={displayText} contentRef={contentRef} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {toolRequests.length > 0 && (
          <div className={cn(displayText && 'mt-2')}>
            <div className="relative flex flex-col w-full">
              <div className="flex flex-col gap-3">
                {toolRequests.map((toolRequest) => {
                  const hasResponse = toolResponsesByRequestId.has(toolRequest.id);
                  const isPending = pendingConfirmationIds.has(toolRequest.id);
                  const confirmationContent = toolConfirmationByRequestId.get(toolRequest.id);
                  const isApprovalClicked = confirmationContent && !isPending && hasResponse;
                  return (
                    <div className="goose-message-tool" key={toolRequest.id}>
                      <ToolCallWithResponse
                        sessionId={sessionId}
                        isCancelledMessage={false}
                        toolRequest={toolRequest}
                        toolResponse={toolResponsesByRequestId.get(toolRequest.id)}
                        notifications={toolCallNotifications.get(toolRequest.id)}
                        isStreamingMessage={isStreaming}
                        isPendingApproval={isPending}
                        append={append}
                        confirmationContent={confirmationContent}
                        isApprovalClicked={isApprovalClicked}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="text-xs text-text-secondary transition-all duration-200 group-hover:-translate-y-4 group-hover:opacity-0 pt-1">
                {!isStreaming && !hideTimestamp && timestamp}
              </div>
            </div>
          </div>
        )}

        {hasToolConfirmation && !toolConfirmationShownInline && (
          <ToolCallConfirmation
            sessionId={sessionId}
            isClicked={false}
            actionRequiredContent={toolConfirmationContent}
          />
        )}

        {hasElicitation && submitElicitationResponse && (
          <ElicitationRequest
            isCancelledMessage={elicitationData?.isCancelled === true}
            isClicked={elicitationData?.isSubmitted === true}
            actionRequiredContent={elicitationContent}
            onSubmit={submitElicitationResponse}
          />
        )}
      </div>
    </div>
  );
}
