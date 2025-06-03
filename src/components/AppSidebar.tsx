import React, { useState } from "react";
import { ChevronRight, File, Folder, Plus, MoreVertical, PenLine, Trash2 } from "lucide-react";
import { 
  useNotes, 
  useActiveNoteId, 
  useActiveClusterId, 
  useNoteActions 
} from "@/hooks/useLiveStore";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarGroupAction, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarFooter, SidebarRail } from "@/components/ui/sidebar";
import { Button } from "./ui/button";
import { ClusterView } from "./ClusterView";
import { generateNoteId } from "@/lib/utils/ids";
import { TagsSection } from "./sidebar/TagsSection";

export function AppSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const notes = useNotes();
  const [activeNoteId, setActiveNoteId] = useActiveNoteId();
  const [activeClusterId] = useActiveClusterId();
  const [activeTab, setActiveTab] = useState<string>("folders");
  const { createNote } = useNoteActions();
  
  // For the Folders tab, only show notes that belong to standard_root (clusterId === null)
  // This ensures complete separation between standard notes and cluster notes
  const rootStandardNotes = notes.filter(note => note.parentId === null && note.clusterId === null);

  const handleNewItem = React.useCallback((type: 'note' | 'folder', parentId: string | null = null) => {
    const clusterId = activeTab === "folders" ? null : activeClusterId;
    
    const newNote = {
      id: generateNoteId(),
      parentId,
      clusterId,
      title: type === 'note' ? 'Untitled Note' : 'New Folder',
      content: [],
      type,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      path: null,
      tags: null,
      mentions: null
    };
    
    createNote(newNote);
    if (type === 'note') {
      setActiveNoteId(newNote.id);
    }
    
    toast(`New ${type} created`, {
      description: type === 'note' ? "Start typing to edit your note" : "You can add notes inside this folder"
    });
  }, [activeClusterId, activeTab, createNote, setActiveNoteId]);

  return <Sidebar className="bg-black border-r border-[#1a1b23]" {...props}>
      <SidebarContent>
        <Tabs defaultValue="folders" className="w-full" onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-2 bg-transparent border-b border-[#1a1b23] rounded-none p-0 h-auto">
            <TabsTrigger value="folders" className="rounded-none border-0 data-[state=active]:bg-transparent data-[state=active]:shadow-none h-10 sidebar-tab-inactive data-[state=active]:sidebar-tab-active">
              Folders
            </TabsTrigger>
            <TabsTrigger value="clusters" className="rounded-none border-0 data-[state=active]:bg-transparent data-[state=active]:shadow-none h-10 sidebar-tab-inactive data-[state=active]:sidebar-tab-active">
              Clusters
            </TabsTrigger>
          </TabsList>
          <TabsContent value="folders" className="mt-0">
            <SidebarGroup>
              <SidebarGroupLabel className="text-xs text-muted-foreground uppercase tracking-wider">
                Notes (standard_root)
              </SidebarGroupLabel>
              <SidebarGroupAction>
                <DropdownMenu>
                  <DropdownMenuTrigger>
                    <Plus className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => handleNewItem('note')}>
                      <File className="mr-2 h-4 w-4" />
                      New Note
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleNewItem('folder')}>
                      <Folder className="mr-2 h-4 w-4" />
                      New Folder
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarGroupAction>
              <SidebarGroupContent>
                <SidebarMenu className="px-1">
                  {rootStandardNotes.map(note => (
                    <NoteTree 
                      key={note.id} 
                      note={note} 
                      notes={notes} 
                      activeNoteId={activeNoteId} 
                      onSelect={setActiveNoteId} 
                      onNewItem={handleNewItem} 
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            
            <TagsSection />
          </TabsContent>
          <TabsContent value="clusters" className="mt-0">
            <ClusterView />
          </TabsContent>
        </Tabs>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="w-full bg-gradient-to-r from-[#1A1F2C] to-[#2A1F3D] hover:from-[#2A1F3D] hover:to-[#1A1F2C] text-white border border-[#7E69AB]/20 shadow-lg transition-all duration-300">
              <Plus className="h-4 w-4 mr-2" /> New
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {activeTab === "folders" ? <>
                <DropdownMenuItem onClick={() => handleNewItem('note')}>
                  <File className="mr-2 h-4 w-4" />
                  New Note
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleNewItem('folder')}>
                  <Folder className="mr-2 h-4 w-4" />
                  New Folder
                </DropdownMenuItem>
              </> : <DropdownMenuItem onClick={() => {
            const clusterButton = document.querySelector('.ClusterView button:has(.h-3\\.5.w-3\\.5)') as HTMLButtonElement;
            if (clusterButton) clusterButton.click();
          }}>
                <Folder className="mr-2 h-4 w-4" />
                New Cluster
              </DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>;
}

interface NoteTreeProps {
  note: any;
  notes: any[];
  activeNoteId: string | null;
  onSelect: (id: string) => void;
  onNewItem: (type: 'note' | 'folder', parentId: string | null) => void;
}

function NoteTree({
  note,
  notes,
  activeNoteId,
  onSelect,
  onNewItem
}: NoteTreeProps) {
  const { updateNote, deleteNote } = useNoteActions();
  const isFolder = note.type === 'folder';
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(note.title);
  const childNotes = notes.filter(n => n.parentId === note.id);

  const handleRename = () => {
    if (editTitle.trim() === '') {
      toast.error("Folder name cannot be empty");
      setEditTitle(note.title);
      return;
    }
    updateNote(note.id, { title: editTitle });
    setIsEditing(false);
    toast.success("Renamed successfully");
  };

  const handleDelete = () => {
    if (notes.filter(n => n.type === 'folder').length <= 1) {
      toast.error("Cannot delete the last folder");
      return;
    }
    deleteNote(note.id);
    toast.success("Deleted successfully");
  };

  if (!isFolder) {
    return <SidebarMenuItem>
        <SidebarMenuButton isActive={activeNoteId === note.id} className="rounded-md transition-colors duration-200 hover:bg-[#12141f] data-[active=true]:sidebar-note-active-dark" onClick={() => onSelect(note.id)}>
          <File className="shrink-0" />
          <span className="truncate">{note.title || "Untitled Note"}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>;
  }

  return <SidebarMenuItem>
      <Collapsible defaultOpen>
        <div className="flex items-center justify-between pr-2 bg-inherit">
          <CollapsibleTrigger asChild>
            <SidebarMenuButton className="flex-1 rounded-md transition-colors duration-200 hover:bg-[#12141f] [&[data-state=open]>svg:first-child]:rotate-90">
              <ChevronRight className="shrink-0 transition-transform" />
              <Folder className="shrink-0" />
              {isEditing ? <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} onBlur={handleRename} onKeyDown={e => {
              if (e.key === 'Enter') handleRename();
              if (e.key === 'Escape') {
                setIsEditing(false);
                setEditTitle(note.title);
              }
            }} className="bg-transparent border-none focus:outline-none focus:ring-0 px-1 flex-1" autoFocus /> : <span className="truncate">{note.title}</span>}
            </SidebarMenuButton>
          </CollapsibleTrigger>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={e => e.stopPropagation()}>
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">Open folder menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => onNewItem('note', note.id)}>
                <File className="mr-2 h-4 w-4" />
                Add Note
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onNewItem('folder', note.id)}>
                <Folder className="mr-2 h-4 w-4" />
                Add Subfolder
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => {
              setIsEditing(true);
              setEditTitle(note.title);
            }}>
                <PenLine className="mr-2 h-4 w-4" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDelete} className="text-red-600 focus:text-red-600 dark:focus:text-red-400">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        <CollapsibleContent>
          <SidebarMenuSub>
            {childNotes.map(child => <NoteTree key={child.id} note={child} notes={notes} activeNoteId={activeNoteId} onSelect={onSelect} onNewItem={onNewItem} />)}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>;
}
