
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNoteActions, useNotes } from "@/hooks/useLiveStore";
import { useState } from "react";

export function BacklinksDebugPanel() {
  const { repairAllOutgoingLinks } = useNoteActions();
  const notes = useNotes();
  const [isRepairing, setIsRepairing] = useState(false);

  const handleRepairLinks = async () => {
    setIsRepairing(true);
    try {
      repairAllOutgoingLinks();
      console.log('Backlinks repair completed');
    } catch (error) {
      console.error('Error repairing backlinks:', error);
    } finally {
      setIsRepairing(false);
    }
  };

  const notesWithoutOutgoingLinks = notes.filter(note => 
    note.type === 'note' && (!note.outgoingLinks || note.outgoingLinks.length === 0)
  );

  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <Card className="m-4">
      <CardHeader>
        <CardTitle>Backlinks Debug Panel</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground mb-2">
            Total notes: {notes.length}
          </p>
          <p className="text-sm text-muted-foreground mb-2">
            Notes without outgoingLinks: {notesWithoutOutgoingLinks.length}
          </p>
        </div>
        
        <Button 
          onClick={handleRepairLinks}
          disabled={isRepairing}
          variant="outline"
        >
          {isRepairing ? 'Repairing...' : 'Repair All Outgoing Links'}
        </Button>
        
        {notesWithoutOutgoingLinks.length > 0 && (
          <div className="text-xs text-muted-foreground">
            <p>Notes missing outgoingLinks:</p>
            <ul className="list-disc list-inside">
              {notesWithoutOutgoingLinks.slice(0, 5).map(note => (
                <li key={note.id}>{note.title}</li>
              ))}
              {notesWithoutOutgoingLinks.length > 5 && (
                <li>... and {notesWithoutOutgoingLinks.length - 5} more</li>
              )}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
