import { Button } from './ui/button';
import { Database, ChevronRight, MoreVertical, Plus, PenLine, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Input } from './ui/input';
import { useState, useEffect } from 'react';
import { useClusters, useActiveClusterId, useNoteActions } from '@/hooks/useLiveStore';
import { toast } from 'sonner';
import { useGraph } from '@/contexts/GraphContext';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { ClusterNoteTree } from './ClusterNoteTree';
import { generateClusterId } from '@/lib/utils/ids';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ClusterView() {
  const clusters = useClusters();
  const [activeClusterId, setActiveClusterId] = useActiveClusterId();
  const [isOpen, setIsOpen] = useState(false);
  const [newClusterTitle, setNewClusterTitle] = useState('');
  const [editingClusterId, setEditingClusterId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const { createCluster, updateCluster, deleteCluster } = useNoteActions();
  const { addCluster, deleteCluster: deleteGraphCluster, updateCluster: updateGraphCluster } = useGraph();
  
  const DEFAULT_CLUSTER_ID = 'cluster-default';
  
  useEffect(() => {
    if (!clusters.some(c => c.id === DEFAULT_CLUSTER_ID)) {
      const defaultCluster = {
        id: DEFAULT_CLUSTER_ID as `cluster-${string}`,
        title: 'Main Cluster',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      createCluster(defaultCluster);
      
      setTimeout(() => {
        addCluster(defaultCluster);
      }, 0);
    }
  }, [clusters, createCluster, addCluster]);

  const handleCreateCluster = () => {
    if (!newClusterTitle.trim()) {
      toast.error('Please enter a cluster name');
      return;
    }

    const cluster = {
      id: generateClusterId(),
      title: newClusterTitle,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    createCluster(cluster);
    addCluster(cluster);
    setNewClusterTitle('');
    setIsOpen(false);
    toast.success('Cluster created successfully');
  };

  const handleClusterClick = (clusterId: string) => {
    setActiveClusterId(clusterId);
  };

  const handleRenameCluster = (clusterId: string) => {
    if (editTitle.trim() === '') {
      toast.error("Cluster name cannot be empty");
      setEditingClusterId(null);
      return;
    }
    
    updateCluster(clusterId, { title: editTitle });
    updateGraphCluster(clusterId, { title: editTitle });
    setEditingClusterId(null);
    toast.success("Cluster renamed successfully");
  };

  const handleDeleteCluster = (clusterId: string) => {
    if (clusterId === DEFAULT_CLUSTER_ID) {
      toast.error("Cannot delete the main cluster");
      return;
    }
    
    if (clusterId === activeClusterId) {
      setActiveClusterId(DEFAULT_CLUSTER_ID);
    }
    
    deleteCluster(clusterId);
    deleteGraphCluster(clusterId);
    toast.success("Cluster deleted successfully");
  };

  return (
    <div className="h-full flex flex-col p-4 overflow-auto bg-black">
      {clusters.length <= 1 ? (
        <div className="text-center space-y-4">
          <div className="w-20 h-20 rounded-full bg-[#12141f] flex items-center justify-center mx-auto">
            <Database className="w-10 h-10 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">No clusters yet</h3>
          <p className="text-sm text-muted-foreground">
            Create your first cluster to organize related notes
          </p>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button 
                size="sm" 
                variant="ghost" 
                className="h-7 bg-gradient-to-r from-[#1A1F2C] to-[#2A1F3D] hover:from-[#2A1F3D] hover:to-[#1A1F2C] text-white border border-[#7E69AB]/20 shadow-lg transition-all duration-300"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                New Cluster
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Cluster</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <Input
                  placeholder="Enter cluster name"
                  value={newClusterTitle}
                  onChange={(e) => setNewClusterTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateCluster();
                  }}
                />
                <Button
                  className="w-full bg-primary hover:bg-primary/90"
                  onClick={handleCreateCluster}
                >
                  Create Cluster
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      ) : (
        <div className="w-full space-y-2">
          <div className="flex justify-between items-center mb-4">
            <h3 className="sidebar-section-title">CLUSTERS</h3>
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
              <DialogTrigger asChild>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="h-7 bg-gradient-to-r from-[#1A1F2C] to-[#2A1F3D] hover:from-[#2A1F3D] hover:to-[#1A1F2C] text-white border border-[#7E69AB]/20 shadow-lg transition-all duration-300"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  New Cluster
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Cluster</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <Input
                    placeholder="Enter cluster name"
                    value={newClusterTitle}
                    onChange={(e) => setNewClusterTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateCluster();
                    }}
                  />
                  <Button
                    className="w-full bg-primary hover:bg-primary/90"
                    onClick={handleCreateCluster}
                  >
                    Create Cluster
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          
          <div className="space-y-1">
            {clusters.map((cluster) => (
              <Collapsible key={cluster.id}>
                <div 
                  className={`flex items-center justify-between transition-colors duration-200 ${
                    activeClusterId === cluster.id ? 'sidebar-note-active' : 'sidebar-cluster'
                  }`}
                >
                  <CollapsibleTrigger className="flex items-center gap-2 flex-1" onClick={() => handleClusterClick(cluster.id)}>
                    <ChevronRight className="h-4 w-4 text-[#7C5BF1] transition-transform [&[data-state=open]>svg]:rotate-90" />
                    <Database className="h-4 w-4 text-[#7C5BF1]" />
                    {editingClusterId === cluster.id ? (
                      <Input
                        className="h-6 py-1 px-1"
                        autoFocus
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={() => handleRenameCluster(cluster.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameCluster(cluster.id);
                          if (e.key === 'Escape') setEditingClusterId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="text-sm truncate">{cluster.title}</span>
                    )}
                  </CollapsibleTrigger>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 ml-2"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem 
                        onClick={() => {
                          setEditingClusterId(cluster.id);
                          setEditTitle(cluster.title);
                        }}
                      >
                        <PenLine className="mr-2 h-4 w-4" />
                        Rename
                      </DropdownMenuItem>
                      
                      <DropdownMenuSeparator />
                      
                      <DropdownMenuItem 
                        onClick={() => handleDeleteCluster(cluster.id)}
                        className={cluster.id === DEFAULT_CLUSTER_ID ? 'text-muted-foreground' : 'text-red-600 focus:text-red-600 dark:focus:text-red-400'}
                        disabled={cluster.id === DEFAULT_CLUSTER_ID}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                
                <CollapsibleContent>
                  {activeClusterId === cluster.id && (
                    <div className="pl-4 mt-1">
                      <ClusterNoteTree clusterId={cluster.id} />
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
