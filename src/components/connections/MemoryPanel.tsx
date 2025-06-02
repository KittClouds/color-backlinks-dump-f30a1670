
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Search, Brain, MessageSquare, FileText, Star, Clock } from 'lucide-react';
import { kuzuMemoryService, MemoryItem } from '@/services/KuzuMemoryService';
import { useActiveNote, useActiveThreadId } from '@/hooks/useLiveStore';
import { motion, AnimatePresence } from 'framer-motion';

export function MemoryPanel() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MemoryItem[]>([]);
  const [threadContext, setThreadContext] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);

  const activeNote = useActiveNote();
  const [activeThreadId] = useActiveThreadId();

  // Load memory stats on mount
  useEffect(() => {
    const loadStats = async () => {
      try {
        const memoryStats = await kuzuMemoryService.getMemoryStats();
        setStats(memoryStats);
      } catch (error) {
        console.warn('Failed to load memory stats:', error);
      }
    };

    loadStats();
  }, []);

  // Load thread context when active thread changes
  useEffect(() => {
    const loadThreadContext = async () => {
      if (!activeThreadId) {
        setThreadContext(null);
        return;
      }

      try {
        const context = await kuzuMemoryService.getThreadMemoryContext(activeThreadId);
        setThreadContext(context);
      } catch (error) {
        console.warn('Failed to load thread context:', error);
      }
    };

    loadThreadContext();
  }, [activeThreadId]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setIsLoading(true);
    try {
      const results = await kuzuMemoryService.searchMemories({
        query: searchQuery,
        limit: 10,
        threadId: activeThreadId || undefined
      });
      setSearchResults(results);
    } catch (error) {
      console.error('Memory search failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'note':
        return <FileText className="h-4 w-4" />;
      case 'chat_message':
        return <MessageSquare className="h-4 w-4" />;
      default:
        return <Brain className="h-4 w-4" />;
    }
  };

  const formatImportance = (importance: number) => {
    if (importance >= 0.8) return { label: 'High', color: 'bg-red-500' };
    if (importance >= 0.6) return { label: 'Medium', color: 'bg-yellow-500' };
    return { label: 'Low', color: 'bg-green-500' };
  };

  return (
    <div className="space-y-4">
      {/* Memory Stats */}
      {stats && (
        <Card className="bg-[#12141f] border-[#1a1b23]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center text-sm text-primary">
              <Brain className="h-4 w-4 mr-2" />
              Memory Statistics
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Notes</div>
                <div className="font-medium">{stats.totalNotes}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Messages</div>
                <div className="font-medium">{stats.totalMessages}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search Interface */}
      <Card className="bg-[#12141f] border-[#1a1b23]">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center text-sm text-primary">
            <Search className="h-4 w-4 mr-2" />
            Semantic Search
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex space-x-2">
            <Input
              placeholder="Search memories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              className="bg-[#1a1b23] border-[#22242f]"
            />
            <Button onClick={handleSearch} disabled={isLoading} size="sm">
              {isLoading ? 'Searching...' : 'Search'}
            </Button>
          </div>
          
          {activeThreadId && (
            <div className="mt-2 text-xs text-muted-foreground">
              Searching in current thread context
            </div>
          )}
        </CardContent>
      </Card>

      {/* Thread Context */}
      {threadContext && (
        <Card className="bg-[#12141f] border-[#1a1b23]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center text-sm text-primary">
              <MessageSquare className="h-4 w-4 mr-2" />
              Thread Context
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-xs text-muted-foreground mb-2">
              {threadContext.relevantMemories.length} relevant memories found
            </div>
            <div className="space-y-2">
              {threadContext.relevantMemories.slice(0, 3).map((memory: MemoryItem) => (
                <div key={memory.id} className="p-2 bg-[#1a1b23] rounded text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center space-x-1">
                      {getTypeIcon(memory.type)}
                      <span className="text-muted-foreground">
                        {memory.type === 'chat_message' ? 'Message' : 'Note'}
                      </span>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {formatImportance(memory.importance).label}
                    </Badge>
                  </div>
                  <div className="text-primary">
                    {memory.content.substring(0, 100)}
                    {memory.content.length > 100 && '...'}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search Results */}
      <AnimatePresence>
        {searchResults.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Card className="bg-[#12141f] border-[#1a1b23]">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center text-sm text-primary">
                  <Search className="h-4 w-4 mr-2" />
                  Search Results ({searchResults.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {searchResults.map((result) => (
                    <div key={result.id} className="p-3 bg-[#1a1b23] rounded">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          {getTypeIcon(result.type)}
                          <span className="text-xs text-muted-foreground capitalize">
                            {result.type.replace('_', ' ')}
                          </span>
                          {result.metadata?.similarity && (
                            <Badge variant="outline" className="text-xs">
                              {(1 - result.metadata.similarity).toFixed(2)} similarity
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                            <Star className="h-3 w-3" />
                            <span>{result.importance.toFixed(1)}</span>
                          </div>
                          <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>{result.accessCount}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-sm text-primary">
                        {result.content.substring(0, 200)}
                        {result.content.length > 200 && '...'}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {new Date(result.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {searchQuery && searchResults.length === 0 && !isLoading && (
        <Card className="bg-[#12141f] border-[#1a1b23]">
          <CardContent className="pt-4">
            <div className="text-center text-muted-foreground text-sm">
              No memories found for "{searchQuery}"
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
