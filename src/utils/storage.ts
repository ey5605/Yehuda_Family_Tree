import { FamilyTreeData } from '../types/family';
import { parseUniversalFamilyJson } from './universalTreeImporter';
import { INITIAL_FAMILY_TREE } from '../data/initialFamilyTree';

const STORAGE_KEY = 'family_tree_yehuda_v1';

export type SaveStatus = 'saved' | 'saving' | 'error' | 'offline';

export const EMPTY_TREE: FamilyTreeData = {
  persons: {},
  relationships: [],
  metadata: {
    title: 'אילן היוחסין של משפחת יהודה',
    lastUpdated: new Date().toISOString(),
  },
};

export const INITIAL_TREE: FamilyTreeData = INITIAL_FAMILY_TREE;

// Load initial tree with intelligent two-way synchronization between server and localStorage
export async function loadFamilyTree(): Promise<FamilyTreeData> {
  let serverData: FamilyTreeData | null = null;
  let localData: FamilyTreeData | null = null;

  // 1. Try reading from server
  try {
    const res = await fetch('/api/tree');
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object' && data.persons) {
        serverData = data;
      }
    }
  } catch (err) {
    console.warn('Could not fetch tree from server:', err);
  }

  // 2. Try reading from localStorage
  try {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) {
      localData = JSON.parse(local);
    }
  } catch (err) {
    console.error('Error loading from localStorage:', err);
  }

  const serverCount = serverData?.persons ? Object.keys(serverData.persons).length : 0;
  const localCount = localData?.persons ? Object.keys(localData.persons).length : 0;

  // Case 1: Server has data, but local is empty or server has more up-to-date data
  if (serverData && serverCount > 0) {
    if (!localData || localCount === 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serverData));
      } catch (e) {
        console.warn('Could not update localStorage with server data:', e);
      }
      return serverData;
    }

    // Both have data: Compare timestamps and count
    const serverTime = serverData.metadata?.lastUpdated ? new Date(serverData.metadata.lastUpdated).getTime() : 0;
    const localTime = localData.metadata?.lastUpdated ? new Date(localData.metadata.lastUpdated).getTime() : 0;

    if (localCount > serverCount || (localTime > serverTime && localCount >= serverCount)) {
      // Local is newer/has more data (e.g. edited on mobile while offline) -> Push local to server!
      saveFamilyTree(localData);
      return localData;
    } else {
      // Server is newer or equal -> sync to local storage
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serverData));
      } catch (e) {
        console.warn('Could not update localStorage with server data:', e);
      }
      return serverData;
    }
  }

  // Case 2: Server is empty (0 persons), but Local has data (> 0 persons)
  // This happens when data was entered on a phone and now needs to be saved to the database!
  if (localData && localCount > 0) {
    // Automatically push phone data to the server database!
    saveFamilyTree(localData);
    return localData;
  }

  // Case 3: Neither server nor localStorage has data (e.g. running statically on GitHub Pages for the first time)
  if (INITIAL_TREE && Object.keys(INITIAL_TREE.persons).length > 0) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_TREE));
    } catch (e) {
      console.warn('Could not cache initial tree:', e);
    }
    return INITIAL_TREE;
  }

  return EMPTY_TREE;
}

// Save tree both to server and to localStorage
export async function saveFamilyTree(data: FamilyTreeData): Promise<boolean> {
  const updatedData = {
    ...data,
    metadata: {
      ...data.metadata,
      lastUpdated: new Date().toISOString(),
    },
  };

  // Always save to localStorage immediately for resilience
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedData));
  } catch (err) {
    console.warn('LocalStorage save issue (possibly quota exceeded with images):', err);
  }

  // Try saving to server
  try {
    const res = await fetch('/api/tree', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedData),
    });
    return res.ok;
  } catch (err) {
    console.warn('Server save failed, saved locally:', err);
    return false;
  }
}

// Download JSON backup file
export function exportTreeBackup(data: FamilyTreeData, filename = 'family-tree-backup.json') {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Restore from JSON backup string (supports native and flexible formats)
export function parseTreeBackup(jsonString: string): FamilyTreeData {
  try {
    const result = parseUniversalFamilyJson(jsonString);
    return result.tree;
  } catch (err: any) {
    throw new Error(err.message || 'קובץ הגיבוי אינו תקין. נדרש מבנה של persons ו-relationships.');
  }
}

// Explicit fetch from server (e.g. to pull latest data from other devices)
export async function fetchServerTree(): Promise<FamilyTreeData | null> {
  try {
    const res = await fetch('/api/tree?t=' + Date.now());
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object' && data.persons && Object.keys(data.persons).length > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        return data;
      }
    }
  } catch (err) {
    console.error('Error fetching tree directly from server:', err);
  }
  return null;
}

// Force push local tree to server
export async function pushLocalTreeToServer(data: FamilyTreeData): Promise<boolean> {
  return await saveFamilyTree(data);
}
