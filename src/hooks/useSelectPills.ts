
import { useStore } from '@livestore/react';
import { 
  availableTagsData$, 
  selectedTagsForNote$, 
  globalSelectedTags$ 
} from '../livestore/queries/selectPills';

export function useSelectPills() {
  const { store } = useStore();
  
  const availableTags = store.useQuery(availableTagsData$);
  const selectedTagsForNote = store.useQuery(selectedTagsForNote$);
  const globalSelectedTags = store.useQuery(globalSelectedTags$);

  const setSelectedTagsForNote = (tags: string[]) => {
    store.setSignal(selectedTagsForNote$, tags);
  };

  const setGlobalSelectedTags = (tags: string[]) => {
    store.setSignal(globalSelectedTags$, tags);
  };

  const addTagToNote = (tagId: string) => {
    const current = store.query(selectedTagsForNote$);
    if (!current.includes(tagId)) {
      store.setSignal(selectedTagsForNote$, [...current, tagId]);
    }
  };

  const removeTagFromNote = (tagId: string) => {
    const current = store.query(selectedTagsForNote$);
    store.setSignal(selectedTagsForNote$, current.filter(id => id !== tagId));
  };

  return {
    availableTags,
    selectedTagsForNote,
    globalSelectedTags,
    setSelectedTagsForNote,
    setGlobalSelectedTags,
    addTagToNote,
    removeTagFromNote
  };
}
