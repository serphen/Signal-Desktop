// Copyright 2020 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import {
  useCallback,
  useRef,
  useState,
  type JSX,
  type DragEvent,
  type ClipboardEvent,
} from 'react';
import classNames from 'classnames';
import { useEscapeHandling } from '../../hooks/useEscapeHandling.dom.ts';
import { getSuggestedFilename } from '../../util/Attachment.std.ts';
import { IMAGE_PNG, type MIMEType } from '../../types/MIME.std.ts';
import { isSignalConversation } from '../../util/isSignalConversation.dom.ts';
import { SignalConversationBackground } from './SignalConversationBackground.dom.tsx';

export type PropsType = {
  conversationId: string;
  conversationTitle: string;
  hasOpenModal: boolean;
  hasOpenPanel: boolean;
  isSelectMode: boolean;
  onExitSelectMode: () => void;
  processAttachments: (options: {
    conversationId: string;
    files: ReadonlyArray<File>;
    flags: number | null;
  }) => void;
  renderCompositionArea: (conversationId: string) => JSX.Element;
  renderConversationHeader: (conversationId: string) => JSX.Element;
  renderTimeline: (conversationId: string) => JSX.Element;
  renderPanel: (conversationId: string) => JSX.Element | undefined;
  shouldHideConversationView?: boolean;
};

// https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/clipboard/data_object_item.cc;l=184;drc=1d545578bf3756af94e89f274544c6017267f885
const DEFAULT_CHROMIUM_IMAGE_FILENAME = 'image.png';

function getAsFile(item: DataTransferItem): File | null {
  const file = item.getAsFile();
  if (!file) {
    return null;
  }

  if (
    file.type === IMAGE_PNG &&
    file.name === DEFAULT_CHROMIUM_IMAGE_FILENAME
  ) {
    return new File(
      [file.slice(0, file.size, file.type)],
      getSuggestedFilename({
        attachment: {
          contentType: file.type as MIMEType,
        },
        timestamp: Date.now(),
        scenario: 'sending',
      }),
      {
        type: file.type,
        lastModified: file.lastModified,
      }
    );
  }
  return file;
}

export function ConversationView({
  conversationId,
  conversationTitle,
  hasOpenModal,
  hasOpenPanel,
  isSelectMode,
  onExitSelectMode,
  processAttachments,
  renderCompositionArea,
  renderConversationHeader,
  renderTimeline,
  renderPanel,
  shouldHideConversationView,
}: PropsType): JSX.Element {
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const onDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer?.types?.includes('Files')) {
        dragCounterRef.current += 1;
        setIsDragOver(true);
      }
    },
    []
  );

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const onDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragOver(false);
    }
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.stopPropagation();
      event.preventDefault();

      dragCounterRef.current = 0;
      setIsDragOver(false);

      if (!event.dataTransfer) {
        return;
      }

      if (event.dataTransfer.types[0] !== 'Files') {
        return;
      }

      const { files } = event.dataTransfer;
      processAttachments({
        conversationId,
        files: Array.from(files),
        flags: null,
      });
    },
    [conversationId, processAttachments]
  );

  const onPaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      if (hasOpenModal || hasOpenPanel) {
        return;
      }

      if (!event.clipboardData) {
        return;
      }
      const { items } = event.clipboardData;

      const fileItems = [...items].filter(item => item.kind === 'file');
      if (fileItems.length === 0) {
        return;
      }

      const allVisual = fileItems.every(item => {
        const type = item.type.split('/')[0];
        return type === 'image' || type === 'video';
      });
      if (allVisual) {
        const files: Array<File> = [];
        for (const item of items) {
          const file = getAsFile(item);
          if (file) {
            files.push(file);
          }
        }

        processAttachments({
          conversationId,
          files,
          flags: null,
        });

        event.stopPropagation();
        event.preventDefault();

        return;
      }

      const firstAttachment = fileItems[0] ? getAsFile(fileItems[0]) : null;
      if (firstAttachment) {
        processAttachments({
          conversationId,
          files: [firstAttachment],
          flags: null,
        });

        event.stopPropagation();
        event.preventDefault();
      }
    },
    [conversationId, processAttachments, hasOpenModal, hasOpenPanel]
  );

  useEscapeHandling(
    isSelectMode && !hasOpenModal ? onExitSelectMode : undefined
  );

  const isSignalConvo = isSignalConversation({ id: conversationId });
  return (
    <div
      className="ConversationView ConversationPanel"
      onDrop={onDrop}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onPaste={onPaste}
    >
      {isDragOver && (
        <div className="ConversationView__drop-overlay">
          <div className="ConversationView__drop-overlay__modal">
            <div className="ConversationView__drop-overlay__icons">
              <div className="ConversationView__drop-overlay__icon ConversationView__drop-overlay__icon--image" />
              <div className="ConversationView__drop-overlay__icon ConversationView__drop-overlay__icon--document" />
            </div>
            <div className="ConversationView__drop-overlay__title">
              Upload to <strong>{conversationTitle}</strong>
            </div>
            <div className="ConversationView__drop-overlay__instructions">
              You can add comments before uploading.
            </div>
          </div>
        </div>
      )}
      <div
        className={classNames('ConversationPanel', {
          ConversationPanel__hidden: shouldHideConversationView,
        })}
      >
        {isSignalConvo ? <SignalConversationBackground /> : null}
        <div className="ConversationView__header">
          {renderConversationHeader(conversationId)}
        </div>
        <div className="ConversationView__pane">
          <div className="ConversationView__timeline--container">
            <div aria-live="polite" className="ConversationView__timeline">
              {renderTimeline(conversationId)}
            </div>
          </div>
          <div className="ConversationView__composition-area">
            {renderCompositionArea(conversationId)}
          </div>
        </div>
      </div>
      {renderPanel(conversationId)}
    </div>
  );
}
