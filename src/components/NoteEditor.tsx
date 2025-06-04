import { useActiveNote, useActiveNoteId, useNotes, useNoteActions } from '@/hooks/useLiveStore';
import { Input } from "@/components/ui/input";
import { useEffect, useState, useCallback, useRef } from 'react';
import { useBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { Block } from '@blocknote/core';
import { Button } from './ui/button';
import { Trash } from 'lucide-react';
import { toast } from 'sonner';
import { ConnectionsPanel } from './connections/ConnectionsPanel';
import { EmptyNoteState } from './EmptyNoteState';
import { createEmptyBlock } from '@/lib/utils/blockUtils';
import { entityEditorSchema } from '@/lib/editor/EntityEditorSchema';
import { EntityHighlighter } from '@/services/EntityHighlighter';
import { useIdleCallback } from '@/hooks/useIdleCallback';
import { useHardenedState } from '@/cursor-stability/useHardenedState';

export function NoteEditor() {
  const activeNote = useActiveNote();
  const [activeNoteId, setActiveNoteId] = useActiveNoteId();
  const notes = useNotes();
  const { updateNote, deleteNote, updateNoteTitle } = useNoteActions(); // NEW: Use enhanced updateNoteTitle
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    }
    return 'dark';
  });
  
  const entityHighlighterRef = useRef<EntityHighlighter | null>(null);
  const currentNoteIdRef = useRef<string | null>(null);
  const isLoadingContentRef = useRef(false);
  
  // Initialize hardened state management
  const {
    setEditor,
    loadNote,
    saveNote,
    switchNote,
    updateNote: updateNoteState,
    validateState,
    getHealthMetrics,
    emergencyRecovery,
    getCurrentNoteId
  } = useHardenedState();
  
  // Initialize editor with empty content only - no reactive dependencies
  const editor = useBlockNote({
    schema: entityEditorSchema,
    initialContent: [createEmptyBlock()],
  });

  // Register editor with hardened state system
  useEffect(() => {
    if (editor) {
      setEditor(editor);
      entityHighlighterRef.current = new EntityHighlighter(editor as any);
      console.log('NoteEditor: Editor registered with hardened state system');
    }
  }, [editor, setEditor]);

  // Theme change handler
  useEffect(() => {
    const handleThemeChange = () => {
      const isDark = document.documentElement.classList.contains('dark');
      setTheme(isDark ? 'dark' : 'light');
    };

    handleThemeChange();
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'class'
        ) {
          handleThemeChange();
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  // Hardened idle save to LiveStore
  const idleSave = useIdleCallback(async () => {
    if (!activeNote || isLoadingContentRef.current) return;
    
    const currentNoteId = getCurrentNoteId();
    if (currentNoteId !== activeNote.id) {
      console.warn('NoteEditor: Note ID mismatch during idle save, skipping');
      return;
    }
    
    // Validate state before saving
    if (!validateState(activeNote.id)) {
      console.error('NoteEditor: State validation failed during idle save');
      return;
    }
    
    console.log("NoteEditor: Hardened idle save triggered for", activeNote.id);
    
    // Get current content from editor
    const currentBlocks = editor?.document as Block[];
    if (!currentBlocks) {
      console.warn('NoteEditor: No editor content available for save');
      return;
    }
    
    // Save through hardened state system
    const success = await saveNote(activeNote.id, currentBlocks);
    
    if (success) {
      // Persist to LiveStore with enhanced link parsing
      updateNote(activeNote.id, { content: currentBlocks });
      
      // Process entity highlighting after save
      if (entityHighlighterRef.current) {
        setTimeout(() => {
          entityHighlighterRef.current?.processAllInactiveBlocks();
        }, 100);
      }
    } else {
      console.error('NoteEditor: Hardened save failed for note', activeNote.id);
      toast("Save failed", {
        description: "Your changes may not be saved. Please try again.",
      });
    }
  }, 500);

  // Hardened content loading for a specific note
  const loadNoteContent = useCallback(async (noteId: string, note: any) => {
    if (!editor || isLoadingContentRef.current) return;
    
    console.log("NoteEditor: Loading content with hardened protection for note", noteId);
    isLoadingContentRef.current = true;
    
    try {
      // Prepare fallback content
      let fallbackContent: Block[];
      if (note.content && Array.isArray(note.content) && note.content.length > 0) {
        fallbackContent = note.content as Block[];
      } else {
        fallbackContent = [createEmptyBlock()];
      }
      
      // Load through hardened state system
      const contentToLoad = await loadNote(noteId, fallbackContent);
      
      console.log("NoteEditor: Replacing blocks with", contentToLoad.length, "blocks for note", noteId);
      
      // Replace editor content
      editor.replaceBlocks(editor.document, contentToLoad);
      
      // Process entity highlighting after content is loaded
      if (entityHighlighterRef.current) {
        setTimeout(() => {
          entityHighlighterRef.current?.processAllInactiveBlocks();
        }, 200);
      }
    } catch (error) {
      console.error("NoteEditor: Hardened content loading failed:", error);
      toast("Content loading failed", {
        description: "There was an issue loading the note content.",
      });
    } finally {
      isLoadingContentRef.current = false;
    }
  }, [editor, loadNote]);

  // Hardened editor content change handler
  useEffect(() => {
    if (!editor || !activeNote) return;
    
    const handleContentChange = async () => {
      // Skip if we're currently loading content
      if (isLoadingContentRef.current) return;
      
      const currentBlocks = editor.document as Block[];
      const currentNoteId = getCurrentNoteId();
      
      // Validate that we're updating the correct note
      if (activeNote.id !== currentNoteId) {
        console.warn("NoteEditor: Content change for wrong note, skipping update");
        return;
      }
      
      // Update through hardened state system
      const success = await updateNoteState(activeNote.id, currentBlocks);
      
      if (success) {
        // Touch idle save timer
        idleSave.touch();
      } else {
        console.error("NoteEditor: Hardened state update failed");
      }
    };
    
    editor.onEditorContentChange(handleContentChange);
    
    return () => {
      // Cleanup but don't cancel - let pending saves complete
    };
  }, [editor, activeNote, updateNoteState, getCurrentNoteId, idleSave]);

  // Hardened note switching - this is the critical part
  useEffect(() => {
    if (!editor) return;
    
    const newNoteId = activeNoteId;
    const previousNoteId = currentNoteIdRef.current;
    
    // Skip if same note
    if (newNoteId === previousNoteId) return;
    
    console.log("NoteEditor: Hardened note switch from", previousNoteId, "to", newNoteId);
    
    // Perform hardened note switch
    const performSwitch = async () => {
      try {
        // Flush any pending saves from previous note
        if (previousNoteId) {
          idleSave.flush();
        }
        
        // Perform atomic switch through hardened state system
        const success = await switchNote(previousNoteId, newNoteId);
        
        if (!success) {
          console.error('NoteEditor: Hardened note switch failed');
          toast("Note switch failed", {
            description: "There was an issue switching notes. Please try again.",
          });
          return;
        }
        
        // Update current note reference
        currentNoteIdRef.current = newNoteId;
        
        // Load content for the new note
        if (activeNote) {
          await loadNoteContent(newNoteId, activeNote);
        }
      } catch (error) {
        console.error('NoteEditor: Hardened note switch error:', error);
        
        // Emergency recovery if switch fails
        console.warn('NoteEditor: Attempting emergency recovery');
        emergencyRecovery();
        
        toast("Critical error", {
          description: "Emergency recovery initiated. Please reload the page if issues persist.",
        });
      }
    };
    
    performSwitch();
  }, [activeNoteId, activeNote, editor, loadNoteContent, idleSave, switchNote, emergencyRecovery]);

  // Handle window blur/beforeunload to save immediately
  useEffect(() => {
    const handleBlur = () => {
      idleSave.flush();
    };
    
    const handleBeforeUnload = () => {
      idleSave.flush();
    };
    
    window.addEventListener('blur', handleBlur);
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [idleSave]);

  // Periodic health monitoring (development helper)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const healthCheck = setInterval(() => {
        const health = getHealthMetrics();
        if (!health.stateHealth.isHealthy || health.alerts.length > 0) {
          console.warn('NoteEditor: Health issues detected', health);
        }
      }, 30000); // Check every 30 seconds
      
      return () => clearInterval(healthCheck);
    }
  }, [getHealthMetrics]);

  // NEW: Enhanced title change handler that maintains link relationships
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (activeNote) {
      const newTitle = e.target.value;
      
      // Use the enhanced updateNoteTitle function instead of updateNote
      updateNoteTitle(activeNote.id, newTitle);
      
      console.log(`Title updated from "${activeNote.title}" to "${newTitle}"`);
    }
  };

  const handleDeleteNote = useCallback(() => {
    if (!activeNote || notes.length <= 1) {
      toast("Cannot delete", {
        description: "You must keep at least one note",
      });
      return;
    }
    
    const noteIndex = notes.findIndex(note => note.id === activeNoteId);
    
    deleteNote(activeNote.id);
    
    const nextNoteIndex = noteIndex < notes.length - 1 ? noteIndex : noteIndex - 1;
    const nextNoteId = notes[nextNoteIndex === noteIndex ? nextNoteIndex - 1 : nextNoteIndex]?.id;
    
    if (nextNoteId) {
      setActiveNoteId(nextNoteId);
    }
    
    toast("Note deleted", {
      description: "Your note has been removed",
    });
  }, [notes, activeNoteId, activeNote, deleteNote, setActiveNoteId]);

  if (!activeNote) {
    return <EmptyNoteState />;
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="flex-1 flex flex-col p-6 bg-[#0a0a0d] overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1">
            <Input
              value={activeNote.title || ''}
              onChange={handleTitleChange}
              className="text-xl font-semibold bg-transparent border-none focus-visible:ring-0 px-0 text-primary"
              placeholder="Note Title"
            />
          </div>
          <Button 
            onClick={handleDeleteNote} 
            variant="outline" 
            size="icon" 
            className="ml-2 text-destructive hover:bg-destructive/10 border-[#1a1b23] bg-[#12141f]"
          >
            <Trash className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="flex-1 bg-[#12141f] rounded-md shadow-xl border-[#1a1b23] transition-all duration-200 mb-12 overflow-auto">
          <BlockNoteView 
            editor={editor} 
            theme={theme}
            className="min-h-full"
          />
        </div>
      </div>
      <ConnectionsPanel />
    </div>
  );
}
