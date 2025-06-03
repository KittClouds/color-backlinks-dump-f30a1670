
import React from "react";
import { Tags, Filter } from "lucide-react";
import { SelectPills } from "@/components/ui/select-pills";
import { useSelectPills } from "@/hooks/useSelectPills";
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export function TagsSection() {
  const {
    availableTags,
    selectedTagsForNote,
    globalSelectedTags,
    setSelectedTagsForNote,
    setGlobalSelectedTags
  } = useSelectPills();

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-xs text-muted-foreground uppercase tracking-wider">
        Tags & Filters
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <Tabs defaultValue="note" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="note" className="text-xs">
              <Tags className="h-3 w-3 mr-1" />
              Note
            </TabsTrigger>
            <TabsTrigger value="global" className="text-xs">
              <Filter className="h-3 w-3 mr-1" />
              Global
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="note" className="mt-3">
            <SelectPills
              data={availableTags}
              value={selectedTagsForNote}
              onValueChange={setSelectedTagsForNote}
              placeholder="Add tags to note..."
              className="space-y-2"
            />
          </TabsContent>
          
          <TabsContent value="global" className="mt-3">
            <SelectPills
              data={availableTags}
              value={globalSelectedTags}
              onValueChange={setGlobalSelectedTags}
              placeholder="Filter by tags..."
              className="space-y-2"
            />
          </TabsContent>
        </Tabs>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
