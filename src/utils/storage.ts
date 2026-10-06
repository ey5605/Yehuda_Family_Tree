import { FamilyTreeData, Person, Relationship } from '../types/family';
import { parseUniversalFamilyJson } from './universalTreeImporter';
import { INITIAL_FAMILY_TREE } from '../data/initialFamilyTree';

const STORAGE_KEY = 'family_tree_yehuda_v2';
const LEGACY_STORAGE_KEY = 'family_tree_yehuda_v1';

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

// Merge two trees without losing photos, persons, or relationships
export function mergeFamilyTrees(base: FamilyTreeData, incoming: FamilyTreeData): FamilyTreeData {
  const mergedPersons: Record<string, Person> = { ...(base.persons || {}) };

  for (const [id, incPerson] of Object.entries(incoming.persons || {})) {
    const basePerson = mergedPersons[id];
    if (!basePerson) {
      mergedPersons[id] = incPerson;
    } else {
      mergedPersons[id] = {
        ...basePerson,
        ...incPerson,
        // Always preserve photoUrl if incoming has it
        photoUrl: incPerson.photoUrl || basePerson.photoUrl,
        gender: incPerson.gender !== undefined ? incPerson.gender : basePerson.gender,
        birthDate: incPerson.birthDate || basePerson.birthDate,
        deathDate: incPerson.deathDate || basePerson.deathDate,
        notes: incPerson.notes || basePerson.notes,
      };
    }
  }

  const relMap = new Map<string, Relationship>();
  for (const r of base.relationships || []) {
    relMap.set(r.id, r);
  }
  for (const r of incoming.relationships || []) {
    relMap.set(r.id, r);
  }

  const baseTime = base.metadata?.lastUpdated ? new Date(base.metadata.lastUpdated).getTime() : 0;
  const incTime = incoming.metadata?.lastUpdated ? new Date(incoming.metadata.lastUpdated).getTime() : 0;

  return {
    persons: mergedPersons,
    relationships: Array.from(relMap.values()),
    metadata: {
      title: base.metadata?.title || incoming.metadata?.title || 'אילן היוחסין של משפחת יהודה',
      lastUpdated: new Date(Math.max(baseTime, incTime, Date.now())).toISOString(),
    },
  };
}

// Load initial tree with intelligent multi-source synchronization
export async function loadFamilyTree(): Promise<FamilyTreeData> {
  let serverData: FamilyTreeData | null = null;
  let localData: FamilyTreeData | null = null;
  const initialCount = INITIAL_TREE?.persons ? Object.keys(INITIAL_TREE.persons).length : 0;

  // 1. Always attempt fetching the freshest tree from the server first with cache busting!
  try {
    const res = await fetch(`/api/tree?_t=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'include',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object' && data.persons && Object.keys(data.persons).length > 0) {
        serverData = data;
      }
    }
  } catch (err) {
    console.warn('Could not fetch tree from server:', err);
  }

  // 2. Try reading from localStorage (v2, then legacy v1)
  try {
    const local = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (local) {
      const parsed = JSON.parse(local);
      if (parsed && parsed.persons && typeof parsed.persons === 'object') {
        localData = parsed;
      }
    }
  } catch (err) {
    console.error('Error loading from localStorage:', err);
  }

  const serverCount = serverData?.persons ? Object.keys(serverData.persons).length : 0;
  const localCount = localData?.persons ? Object.keys(localData.persons).length : 0;

  // Case 1: Server has data (Server is the Master Database!)
  if (serverData && serverCount > 0) {
    if (!localData || localCount === 0) {
      // First time on this device: store server data into localStorage and return
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serverData));
      } catch (e) {
        console.warn('Could not update localStorage with server data:', e);
      }
      return serverData;
    }

    // Both server and local have data:
    // Check if local has photos or modifications not yet on the server!
    const localHasExtraPhotos = Object.values(localData.persons || {}).some(
      lp => lp.photoUrl && !serverData!.persons[lp.id]?.photoUrl
    );
    const serverTime = serverData.metadata?.lastUpdated ? new Date(serverData.metadata.lastUpdated).getTime() : 0;
    const localTime = localData.metadata?.lastUpdated ? new Date(localData.metadata.lastUpdated).getTime() : 0;

    if (localHasExtraPhotos || (localTime > serverTime && localCount >= serverCount)) {
      // Local has photos or newer edits! Merge and save to server immediately!
      const merged = mergeFamilyTrees(serverData, localData);
      saveFamilyTree(merged);
      return merged;
    } else {
      // Server is newer or equal -> sync down to local storage and display server data!
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serverData));
      } catch (e) {
        console.warn('Could not update localStorage with server data:', e);
      }
      return serverData;
    }
  }

  // Case 2: Server not reachable (offline device) but local has data
  if (localData && localCount > 0) {
    return localData;
  }

  // Case 3: Initial tree bundled in app (222 persons)
  if (INITIAL_TREE && initialCount > 0) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_TREE));
    } catch (e) {
      console.warn('Could not cache initial tree:', e);
    }
    // Try pushing to server if server is empty or accessible
    if (serverCount === 0) {
      saveFamilyTree(INITIAL_TREE);
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
      credentials: 'include',
      body: JSON.stringify(updatedData),
    });
    if (!res.ok) {
      console.warn('Server save returned status:', res.status, res.statusText);
      return false;
    }
    return true;
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
    const res = await fetch('/api/tree?_t=' + Date.now(), {
      cache: 'no-store',
      credentials: 'include',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
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

// Pull latest tree from remote Publish URL and save to local workspace database
export async function syncTreeFromPublishUrl(url: string): Promise<{ success: boolean; tree?: FamilyTreeData; error?: string }> {
  try {
    const res = await fetch('/api/sync-from-publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      return { success: false, error: result.error || 'שגיאה במשיכת הנתונים מהקישור' };
    }
    if (result.tree) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(result.tree));
      } catch (e) {
        console.warn('Could not cache to localStorage:', e);
      }
    }
    return { success: true, tree: result.tree };
  } catch (err: any) {
    return { success: false, error: err.message || 'שגיאת רשת בעת פנייה לשרת' };
  }
}

