
import { useEffect } from 'react';
import { useStore } from '@livestore/react';
import { kuzuMemoryService } from '@/services/KuzuMemoryService';
import { notes$, threadMessages$ } from '@/livestore/queries';

/**
 * Hook that automatically syncs LiveStore data to the memory service
 */
export function useMemorySync() {
  const notes = useStore(notes$);
  const threadMessages = useStore(threadMessages$);

  // Sync notes to memory service
  useEffect(() => {
    const syncNotes = async () => {
      if (!Array.isArray(notes)) return;

      for (const note of notes) {
        if (note.content && Array.isArray(note.content)) {
          // Convert BlockNote content to text for embedding
          const textContent = note.content
            .map((block: any) => {
              if (block.type === 'paragraph' && block.content) {
                return block.content.map((c: any) => c.text || '').join('');
              }
              return '';
            })
            .filter(Boolean)
            .join('\n');

          if (textContent.trim()) {
            try {
              await kuzuMemoryService.storeMemoryFromLiveStore({
                sourceId: note.id,
                content: textContent,
                type: 'note',
                userId: 'default-user', // TODO: Get from auth context
                categoryId: note.clusterId || undefined,
                importance: 0.5,
                metadata: {
                  title: note.title,
                  path: note.path,
                  tags: note.tags,
                  mentions: note.mentions
                }
              });
            } catch (error) {
              console.warn('Failed to store note memory:', error);
            }
          }
        }
      }
    };

    syncNotes();
  }, [notes]);

  // Sync thread messages to memory service
  useEffect(() => {
    const syncMessages = async () => {
      if (!Array.isArray(threadMessages)) return;

      for (const message of threadMessages) {
        if (message.content && message.content.trim()) {
          try {
            await kuzuMemoryService.storeMemoryFromLiveStore({
              sourceId: message.id,
              content: message.content,
              type: 'chat_message',
              threadId: message.threadId,
              role: message.role,
              userId: 'default-user', // TODO: Get from auth context
              importance: message.role === 'assistant' ? 0.7 : 0.5, // Higher importance for AI responses
              metadata: {
                threadId: message.threadId,
                role: message.role,
                parentId: message.parentId
              }
            });
          } catch (error) {
            console.warn('Failed to store message memory:', error);
          }
        }
      }
    };

    syncMessages();
  }, [threadMessages]);

  return {
    isInitialized: true // Could track initialization state here
  };
}
