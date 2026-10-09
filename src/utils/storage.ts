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

// Merge two trees without losing valid edits, persons, or relationships
export function mergeFamilyTrees(base: FamilyTreeData, incoming: FamilyTreeData): FamilyTreeData {
  const mergedPersons: Record<string, Person> = { ...(base.persons || {}) };

  const baseTime = base.metadata?.lastUpdated ? new Date(base.metadata.lastUpdated).getTime() : 0;
  const incTime = incoming.metadata?.lastUpdated ? new Date(incoming.metadata.lastUpdated).getTime() : 0;
  const incomingIsNewer = incTime >= baseTime;

  for (const [id, incPerson] of Object.entries(incoming.persons || {})) {
    const basePerson = mergedPersons[id];
    if (!basePerson) {
      mergedPersons[id] = incPerson;
    } else {
      const primary = incomingIsNewer ? incPerson : basePerson;
      const secondary = incomingIsNewer ? basePerson : incPerson;

      const mergedPerson: Person = {
        ...secondary,
        ...primary,
        // The newer tree (primary) is authoritative: if photoUrl was removed in primary, do NOT restore from secondary!
        photoUrl: primary.photoUrl || undefined,
        gender: primary.gender !== undefined ? primary.gender : secondary.gender,
        birthDate: primary.birthDate !== undefined ? primary.birthDate : secondary.birthDate,
        deathDate: primary.deathDate !== undefined ? primary.deathDate : secondary.deathDate,
        notes: primary.notes !== undefined ? primary.notes : secondary.notes,
      };

      if (!mergedPerson.photoUrl) {
        delete mergedPerson.photoUrl;
      }

      mergedPersons[id] = mergedPerson;
    }
  }

  const relMap = new Map<string, Relationship>();
  for (const r of base.relationships || []) {
    relMap.set(r.id, r);
  }
  for (const r of incoming.relationships || []) {
    relMap.set(r.id, r);
  }

  return {
    persons: mergedPersons,
    relationships: Array.from(relMap.values()),
    metadata: {
      title: incomingIsNewer
        ? (incoming.metadata?.title || base.metadata?.title || 'אילן היוחסין של משפחת יהודה')
        : (base.metadata?.title || incoming.metadata?.title || 'אילן היוחסין של משפחת יהודה'),
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

    const serverTime = serverData.metadata?.lastUpdated ? new Date(serverData.metadata.lastUpdated).getTime() : 0;
    const localTime = localData.metadata?.lastUpdated ? new Date(localData.metadata.lastUpdated).getTime() : 0;

    // Only if local has explicit uncommitted changes AND local is strictly newer do we merge local onto server
    if (hasUnsyncedChanges() && localTime > serverTime) {
      const merged = mergeFamilyTrees(serverData, localData);
      saveFamilyTree(merged);
      try {
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch (e) {
        console.warn('Could not update localStorage with merged data:', e);
      }
      return merged;
    } else {
      try {
        localStorage.removeItem('has_unsynced_changes');
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serverData));
      } catch (e) {
        console.warn('Could not update localStorage with server data:', e);
      }
      return serverData;
    }
  }

  // Case 2: Server not reachable (offline device) but local has data
  if (localData && localCount > 0) {
    try {
      localStorage.setItem('has_unsynced_changes', 'true');
    } catch {}
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

// Check if device has modifications pending server sync
export function hasUnsyncedChanges(): boolean {
  try {
    return localStorage.getItem('has_unsynced_changes') === 'true';
  } catch {
    return false;
  }
}

export interface SaveResult {
  success: boolean;
  timestamp: string;
}

// Save tree both to server and to localStorage with optional keepalive resilience
export async function saveFamilyTree(data: FamilyTreeData, options?: { keepalive?: boolean }): Promise<SaveResult> {
  const timestamp = data.metadata?.lastUpdated || new Date().toISOString();
  const updatedData: FamilyTreeData = {
    ...data,
    metadata: {
      ...data.metadata,
      lastUpdated: timestamp,
    },
  };

  // Always save to localStorage immediately for resilience
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedData));
  } catch (err) {
    console.warn('LocalStorage save issue (possibly quota exceeded with images):', err);
  }

  // Try saving to server
  try {
    const bodyStr = JSON.stringify(updatedData);
    let res: Response;

    // Use keepalive if requested (e.g. on page unload / app switch)
    if (options?.keepalive) {
      try {
        res = await fetch('/api/tree', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          keepalive: true,
          body: bodyStr,
        });
      } catch {
        // Fallback if browser limits keepalive payload size
        res = await fetch('/api/tree', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: bodyStr,
        });
      }
    } else {
      res = await fetch('/api/tree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: bodyStr,
      });
    }

    if (!res.ok) {
      console.warn('Server save returned status:', res.status, res.statusText);
      try {
        localStorage.setItem('has_unsynced_changes', 'true');
      } catch {}
      return { success: false, timestamp };
    }

    const resJson = await res.json().catch(() => null);
    const finalTimestamp = resJson?.timestamp || timestamp;

    try {
      localStorage.removeItem('has_unsynced_changes');
    } catch {}
    return { success: true, timestamp: finalTimestamp };
  } catch (err) {
    console.warn('Server save failed, saved locally:', err);
    try {
      localStorage.setItem('has_unsynced_changes', 'true');
    } catch {}
    return { success: false, timestamp };
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
        try {
          const localStr = localStorage.getItem(STORAGE_KEY);
          if (localStr) {
            const local = JSON.parse(localStr);
            const localTime = local?.metadata?.lastUpdated ? new Date(local.metadata.lastUpdated).getTime() : 0;
            const dataTime = data.metadata?.lastUpdated ? new Date(data.metadata.lastUpdated).getTime() : 0;

            // Only if local has explicit uncommitted offline changes AND local is newer do we push local onto server
            if (hasUnsyncedChanges() && localTime > dataTime) {
              const merged = mergeFamilyTrees(data, local);
              try {
                localStorage.removeItem(LEGACY_STORAGE_KEY);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
              } catch (e) {
                console.warn('LocalStorage save issue in fetchServerTree:', e);
              }
              saveFamilyTree(merged);
              return merged;
            }
          }
          // Server is newer or equal: keep local cache synchronized with server
          try {
            localStorage.removeItem(LEGACY_STORAGE_KEY);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
          } catch (e) {
            console.warn('Error verifying local storage in fetchServerTree:', e);
          }
        } catch (e) {
          console.warn('Error verifying local storage in fetchServerTree:', e);
        }
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
  const res = await saveFamilyTree(data);
  return res.success;
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

