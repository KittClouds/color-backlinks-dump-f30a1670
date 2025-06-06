import { ThemeToggle } from "./ThemeToggle";
import { NoteEditor } from "./NoteEditor";
import { AppSidebar } from "./AppSidebar";
import { AppRightSidebar } from "./AppRightSidebar";
import { RightSidebarProvider } from "./RightSidebarProvider";
import { EntityManagerDrawer } from "./entity-manager/EntityManagerDrawer";
import { EntityColorSettings } from "./EntityColorSettings";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAtom } from 'jotai';
import { useActiveNote } from '@/hooks/useLiveStore';
import { rightSidebarContentAtom } from '@/lib/rightSidebarStore';
import { useRightSidebar } from './RightSidebarProvider';
import { PanelRight, Users, Palette } from 'lucide-react';
import { cn } from "@/lib/utils";

function RightSidebarTrigger() {
  const { toggleSidebar } = useRightSidebar();
  
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleSidebar}
      className="h-7 w-7"
    >
      <PanelRight className="h-4 w-4" />
      <span className="sr-only">Toggle right sidebar</span>
    </Button>
  );
}

function EntityAttributesTrigger() {
  const [, setContentType] = useAtom(rightSidebarContentAtom);
  const { open, toggleSidebar } = useRightSidebar();
  
  const handleClick = () => {
    setContentType('entity-attributes');
    if (!open) {
      toggleSidebar();
    }
  };
  
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleClick}
      className="h-7 w-7"
    >
      <Users className="h-4 w-4" />
      <span className="sr-only">Entity Attributes</span>
    </Button>
  );
}

function EntityColorTrigger() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
        >
          <Palette className="h-4 w-4" />
          <span className="sr-only">Entity Colors</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96" align="end">
        <EntityColorSettings />
      </PopoverContent>
    </Popover>
  );
}

function GalaxyNotesInner() {
  const activeNote = useActiveNote();
  const { open: rightSidebarOpen } = useRightSidebar();

  return (
    <div className="flex h-screen w-full bg-gradient-to-b dark:from-[#0f101a] dark:to-[#171926] light:from-white light:to-[#f8f6ff] text-foreground">
      <AppSidebar />
      <SidebarInset 
        className={cn(
          "flex-1 min-w-0 transition-all duration-300 ease-in-out",
          rightSidebarOpen ? "mr-64" : "mr-0"
        )}
      >
        <header className="border-b border-border p-4 flex items-center justify-between bg-opacity-95 backdrop-blur-sm dark:bg-black/30 light:bg-white/70">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="h-6 mx-2" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage>{activeNote?.title || "Select a note"}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="flex-1 text-center">
            <h1 className="text-2xl font-bold text-transparent bg-clip-text dark:bg-gradient-to-r dark:from-[#9b87f5] dark:to-[#7c5bf1] light:bg-gradient-to-r light:from-[#614ac2] light:to-[#7460db]">Galaxy Notes</h1>
            <p className="text-sm text-muted-foreground">Multi-note block editor with automatic saving</p>
          </div>
          <div className="flex items-center gap-2">
            <EntityManagerDrawer />
            <EntityAttributesTrigger />
            <EntityColorTrigger />
            <RightSidebarTrigger />
            <ThemeToggle />
          </div>
        </header>
        
        <main className="flex-1 overflow-hidden">
          <NoteEditor />
        </main>
      </SidebarInset>
      <AppRightSidebar />
    </div>
  );
}

export function GalaxyNotes() {
  return (
    <SidebarProvider>
      <RightSidebarProvider>
        <GalaxyNotesInner />
      </RightSidebarProvider>
    </SidebarProvider>
  );
}
