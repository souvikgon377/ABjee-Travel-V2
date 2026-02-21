/**
 * 📜 VIRTUALIZED MESSAGE LIST COMPONENT
 * 
 * WHY: Improve performance with large message lists
 * DECISION: Only render visible messages in viewport
 */

import { memo, useRef, useEffect, useState, useMemo } from 'react';
import type { ChatMessage } from '../../lib/chatService';

interface VirtualizedMessageListProps {
  messages: ChatMessage[];
  renderMessage: (message: ChatMessage, index: number) => React.ReactNode;
  itemHeight?: number;
  overscan?: number;
}

export const VirtualizedMessageList = memo<VirtualizedMessageListProps>(({
  messages,
  renderMessage,
  itemHeight = 100,
  overscan = 5
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setScrollTop(container.scrollTop);
    };

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });

    container.addEventListener('scroll', handleScroll);
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      resizeObserver.disconnect();
    };
  }, []);

  const { visibleRange, totalHeight } = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      messages.length - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    );

    return {
      visibleRange: { start: startIndex, end: endIndex },
      totalHeight: messages.length * itemHeight
    };
  }, [messages.length, scrollTop, containerHeight, itemHeight, overscan]);

  const visibleMessages = useMemo(() => {
    return messages.slice(visibleRange.start, visibleRange.end + 1);
  }, [messages, visibleRange]);

  const offsetY = visibleRange.start * itemHeight;

  return (
    <div
      ref={containerRef}
      className="h-full overflow-auto relative"
    >
      <div className="relative" style={{ height: totalHeight }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleMessages.map((message, index) =>
            renderMessage(message, visibleRange.start + index)
          )}
        </div>
      </div>
    </div>
  );
});

VirtualizedMessageList.displayName = 'VirtualizedMessageList';
