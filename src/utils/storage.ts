import { FamilyTreeData } from '../types/family';

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

// Load initial tree from server, fallback to localStorage
export async function loadFamilyTree(): Promise<FamilyTreeData> {
  try {
    const res = await fetch('/api/tree');
    if (res.ok) {
      const data = await res.json();
      if (data && data.persons && Object.keys(data.persons).length > 0) {
        // Also sync to local storage
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        return data;
      }
    }
  } catch (err) {
    console.warn('Could not fetch tree from server, checking local storage:', err);
  }

  // Fallback to localStorage
  try {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) {
      return JSON.parse(local);
    }
  } catch (err) {
    console.error('Error loading from localStorage:', err);
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

// Restore from JSON backup string
export function parseTreeBackup(jsonString: string): FamilyTreeData {
  const parsed = JSON.parse(jsonString);
  if (!parsed || typeof parsed !== 'object' || !parsed.persons || !Array.isArray(parsed.relationships)) {
    throw new Error('קובץ הגיבוי אינו תקין. נדרש מבנה של persons ו-relationships.');
  }
  return parsed as FamilyTreeData;
}
