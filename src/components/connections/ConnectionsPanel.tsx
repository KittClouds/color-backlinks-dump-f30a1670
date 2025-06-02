import { useActiveNote, useActiveNoteConnections } from '@/hooks/useLiveStore';
import { useGraph } from '@/contexts/GraphContext'; // Keep for backlinks
import { Badge } from '@/components/ui/badge';
import { Link, ChevronDown, ChevronUp, Hash, AtSign, Database, Network } from 'lucide-react';
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { SchemaManager } from "../schema/SchemaManager";
import { EntityPanel } from "./EntityPanel";
import { RelatedPanel } from "./RelatedPanel";
import { ScopeSelector } from "./ScopeSelector";
import { useEntitiesForScope } from "@/hooks/useEntitiesForScope";

export function ConnectionsPanel() {
  const activeNote = useActiveNote();
  const connections = useActiveNoteConnections();
  const { getBacklinks } = useGraph(); // Only need backlinks from graph context now
  const [isOpen, setIsOpen] = useState(false);
  const [activeView, setActiveView] = useState<'links' | 'backlinks' | 'entities' | 'related'>('entities'); // Default to entities
  
  // Use the new scope-aware entity hook
  const entitiesScope = useEntitiesForScope();
  
  const backlinks = activeNote?.id ? getBacklinks(activeNote.id) : [];
  const { tags = [], mentions = [], links = [] } = connections;

  return (
    <div className="relative bg-[#0a0a0d] border-t border-[#1a1b23]">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="border-t border-[#1a1b23]"
          >
            {/* Scope Selector - only show for entities view */}
            {activeView === 'entities' && (
              <ScopeSelector
                scope={entitiesScope.scope}
                scopeInfo={entitiesScope.scopeInfo}
                onScopeChange={entitiesScope.setScope}
                stats={entitiesScope.stats}
              />
            )}
            
            <div className="p-4 space-y-4 max-h-[300px] overflow-auto">
              <div className="flex justify-center space-x-2">
                <Button
                  variant="ghost"
                  onClick={() => setActiveView('links')}
                  className={`px-4 ${activeView === 'links' ? 'bg-[#1a1b23] text-primary' : 'text-muted-foreground'}`}
                >
                  <Link className="mr-2 h-4 w-4" />
                  Links
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setActiveView('backlinks')}
                  className={`px-4 ${activeView === 'backlinks' ? 'bg-[#1a1b23] text-primary' : 'text-muted-foreground'}`}
                >
                  <Link className="mr-2 h-4 w-4 transform rotate-180" />
                  Backlinks
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setActiveView('entities')}
                  className={`px-4 ${activeView === 'entities' ? 'bg-[#1a1b23] text-primary' : 'text-muted-foreground'}`}
                >
                  <Database className="mr-2 h-4 w-4" />
                  Entities
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setActiveView('related')}
                  className={`px-4 ${activeView === 'related' ? 'bg-[#1a1b23] text-primary' : 'text-muted-foreground'}`}
                >
                  <Network className="mr-2 h-4 w-4" />
                  Related
                </Button>
              </div>

              {activeView === 'links' ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="bg-[#12141f] border-[#1a1b23]">
                    <CardContent className="p-4">
                      <h3 className="flex items-center text-sm font-medium mb-3 text-primary">
                        <Hash className="h-4 w-4 mr-2" /> 
                        Tags
                      </h3>
                      <div className="space-y-2">
                        {tags.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {tags.map((tag) => (
                              <Badge
                                key={tag} // Use tag string as key
                                variant="secondary"
                                className="bg-[#1a1b23] hover:bg-[#22242f] text-primary border-none"
                              >
                                #{tag}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">
                            No tags found
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-[#12141f] border-[#1a1b23]">
                    <CardContent className="p-4">
                      <h3 className="flex items-center text-sm font-medium mb-3 text-primary">
                        <AtSign className="h-4 w-4 mr-2" /> 
                        Mentions
                      </h3>
                      <div className="space-y-2">
                        {mentions.length > 0 ? (
                          <div className="space-y-1">
                            {mentions.map((mention) => (
                              <div
                                key={mention} // Use mention string as key
                                className="text-sm px-2 py-1 rounded-md bg-[#1a1b23] hover:bg-[#22242f] cursor-pointer transition-colors flex items-center"
                              >
                                @{mention}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">
                            No mentions found
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-[#12141f] border-[#1a1b23]">
                    <CardContent className="p-4">
                      <h3 className="flex items-center text-sm font-medium mb-3 text-primary">
                        <Link className="h-4 w-4 mr-2" /> 
                        Links
                      </h3>
                      <div className="space-y-2">
                        {links.length > 0 ? (
                          <div className="space-y-1">
                            {links.map((linkTitle) => (
                              <div
                                key={linkTitle} // Use link title as key
                                className="text-sm px-2 py-1 rounded-md bg-[#1a1b23] hover:bg-[#22242f] cursor-pointer transition-colors flex items-center"
                              >
                                [[{linkTitle}]]
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">
                            No links found
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : activeView === 'backlinks' ? (
                <Card className="bg-[#12141f] border-[#1a1b23]">
                  <CardContent className="p-4">
                    <h3 className="flex items-center text-sm font-medium mb-3 text-primary">
                      <Link className="h-4 w-4 mr-2 transform rotate-180" /> 
                      Backlinks
                    </h3>
                    <div className="space-y-2">
                      {backlinks.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {backlinks.map((link) => (
                            <div
                              key={link.id}
                              className="text-sm px-2 py-1 rounded-md bg-[#1a1b23] hover:bg-[#22242f] cursor-pointer transition-colors flex items-center"
                            >
                              [[{link.title}]]
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">
                          No backlinks to this note
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ) : activeView === 'entities' ? (
                <EntityPanel entitiesScope={entitiesScope} />
              ) : (
                <RelatedPanel />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <div className="flex items-center justify-between pr-2">
        <Button
          onClick={() => setIsOpen(!isOpen)}
          className="flex-grow bg-[#0a0a0d] rounded-none h-8 flex items-center justify-center hover:bg-[#12141f] border-none"
        >
          <Link className="h-4 w-4 mr-2" />
          <span>Connections</span>
          {isOpen ? (
            <ChevronDown className="h-4 w-4 ml-2" />
          ) : (
            <ChevronUp className="h-4 w-4 ml-2" />
          )}
        </Button>
        
        <SchemaManager />
      </div>
    </div>
  );
}
