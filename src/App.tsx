import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { CloudOff, RefreshCw, X } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { TreeCanvas } from './components/TreeCanvas';
import { PersonModal } from './components/PersonModal';
import { ImportModal } from './components/ImportModal';
import { ExportModal } from './components/ExportModal';
import { AcceptanceTestModal } from './components/AcceptanceTestModal';
import { UnlockModal } from './components/UnlockModal';
import { FamilyTreeData, ViewType, Person, Relationship, BgThemeId, BG_THEMES } from './types/family';
import { computeTreeLayout } from './utils/treeLayout';
import {
  loadFamilyTree,
  saveFamilyTree,
  fetchServerTree,
  mergeFamilyTrees,
  hasUnsyncedChanges,
  EMPTY_TREE,
  SaveStatus
} from './utils/storage';
import { SAMPLE_FAMILY_TREE } from './data/sampleTree';
import {
  removePersonFromTree,
  removeRelationship,
  getChildren,
  shareChildrenBetweenSpouses,
  addSpouseAndShareChildren
} from './utils/familyGraph';

export default function App() {
  const [treeData, setTreeData] = useState<FamilyTreeData>(EMPTY_TREE);
  const [viewType, setViewType] = useState<ViewType>('detailed-vertical');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [isPersonModalOpen, setIsPersonModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isTestsModalOpen, setIsTestsModalOpen] = useState(false);

  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set());
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [isSyncBannerDismissed, setIsSyncBannerDismissed] = useState<boolean>(false);
  const [isSyncingNow, setIsSyncingNow] = useState<boolean>(false);
  const [isReadOnly, setIsReadOnly] = useState<boolean>(true);
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState<boolean>(false);
  const [fitTrigger, setFitTrigger] = useState(1);

  // Background Theme Palette State (default + 3 graded dark colors, persisted across views & sessions)
  const [bgTheme, setBgTheme] = useState<BgThemeId>(() => {
    try {
      const saved = localStorage.getItem('family_tree_bg_theme');
      if (saved && (saved === 'default' || saved === 'dark-gray' || saved === 'darker-gray' || saved === 'black')) {
        return saved as BgThemeId;
      }
    } catch {
      // ignore
    }
    return 'default';
  });

  const handleBgThemeChange = useCallback((newTheme: BgThemeId) => {
    setBgTheme(newTheme);
    try {
      localStorage.setItem('family_tree_bg_theme', newTheme);
    } catch {
      // ignore
    }
  }, []);

  const activeThemeConfig = BG_THEMES[bgTheme] || BG_THEMES['default'];

  // Undo / Redo History Stacks
  const [history, setHistory] = useState<FamilyTreeData[]>([]);
  const [future, setFuture] = useState<FamilyTreeData[]>([]);
  const originalTreeBackupRef = useRef<FamilyTreeData | null>(null);
  const treeDataRef = useRef<FamilyTreeData>(treeData);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isPersonModalOpenRef = useRef(false);
  const saveStatusRef = useRef<SaveStatus>('saved');

  useEffect(() => {
    treeDataRef.current = treeData;
  }, [treeData]);

  useEffect(() => {
    isPersonModalOpenRef.current = isPersonModalOpen;
  }, [isPersonModalOpen]);

  useEffect(() => {
    saveStatusRef.current = saveStatus;
  }, [saveStatus]);

  // Load tree on initial mount
  useEffect(() => {
    async function init() {
      const loaded = await loadFamilyTree();
      setTreeData(loaded);
      originalTreeBackupRef.current = loaded;
      if (hasUnsyncedChanges()) {
        setSaveStatus('offline');
        setIsSyncBannerDismissed(false);
      }
      setFitTrigger(t => t + 1);
    }
    init();
  }, []);

  // Auto-sync when user switches to tab or unlocks device
  useEffect(() => {
    const handleSyncCheck = async () => {
      // Do NOT auto-sync in background if user is actively in the edit modal or if save is currently in-flight
      if (isPersonModalOpenRef.current || saveStatusRef.current === 'saving') {
        return;
      }
      if (document.visibilityState === 'visible') {
        const fresh = await fetchServerTree();
        if (fresh && fresh.metadata?.lastUpdated) {
          setTreeData(prev => {
            const prevTime = prev.metadata?.lastUpdated ? new Date(prev.metadata.lastUpdated).getTime() : 0;
            const freshTime = new Date(fresh.metadata.lastUpdated).getTime();
            if (freshTime > prevTime) {
              // Intelligently merge so local uncommitted or recent edits (e.g. genders, notes) are never wiped out
              return mergeFamilyTrees(fresh, prev);
            }
            return prev;
          });
        }
      }
    };

    document.addEventListener('visibilitychange', handleSyncCheck);
    window.addEventListener('focus', handleSyncCheck);
    const interval = setInterval(handleSyncCheck, 10000);

    return () => {
      document.removeEventListener('visibilitychange', handleSyncCheck);
      window.removeEventListener('focus', handleSyncCheck);
      clearInterval(interval);
    };
  }, []);

  // Flush pending save immediately when switching apps, locking screen, or closing tab (keepalive resilience)
  useEffect(() => {
    const handleFlushSave = () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (treeDataRef.current) {
        saveFamilyTree(treeDataRef.current, { keepalive: true });
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleFlushSave();
      }
    };

    window.addEventListener('beforeunload', handleFlushSave);
    window.addEventListener('pagehide', handleFlushSave);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleFlushSave);
      window.removeEventListener('pagehide', handleFlushSave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Automatic retry sync when device comes back online or periodically while offline
  useEffect(() => {
    const attemptSync = async () => {
      if (saveStatusRef.current === 'offline' || hasUnsyncedChanges()) {
        if (treeDataRef.current && navigator.onLine) {
          setSaveStatus('saving');
          const success = await saveFamilyTree(treeDataRef.current);
          setSaveStatus(success ? 'saved' : 'offline');
          if (success) {
            setIsSyncBannerDismissed(false);
          }
        }
      }
    };

    const handleOnline = () => {
      attemptSync();
    };

    window.addEventListener('online', handleOnline);

    const retryInterval = setInterval(() => {
      if (saveStatusRef.current === 'offline' || hasUnsyncedChanges()) {
        attemptSync();
      }
    }, 6000);

    return () => {
      window.removeEventListener('online', handleOnline);
      clearInterval(retryInterval);
    };
  }, []);

  // Push new state with undo record (immediate save by default for maximum cross-device reliability)
  const updateTreeData = useCallback(
    (newTree: FamilyTreeData, recordHistory = true, immediateSave = true) => {
      // CRITICAL: Always generate a fresh lastUpdated timestamp on the tree state
      const treeWithFreshTimestamp: FamilyTreeData = {
        ...newTree,
        metadata: {
          ...newTree.metadata,
          lastUpdated: new Date().toISOString(),
        },
      };

      if (recordHistory) {
        setHistory(prev => [...prev.slice(-30), treeData]);
        setFuture([]);
      }
      setTreeData(treeWithFreshTimestamp);

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      setSaveStatus('saving');
      if (immediateSave) {
        saveFamilyTree(treeWithFreshTimestamp).then(success => {
          setSaveStatus(success ? 'saved' : 'offline');
          if (!success) {
            setIsSyncBannerDismissed(false);
          }
        });
      } else {
        saveTimerRef.current = setTimeout(async () => {
          const success = await saveFamilyTree(treeWithFreshTimestamp);
          setSaveStatus(success ? 'saved' : 'offline');
          if (!success) {
            setIsSyncBannerDismissed(false);
          }
        }, 200);
      }
    },
    [treeData]
  );

  // Undo / Redo handlers
  const handleUndo = useCallback(() => {
    if (history.length === 0 || isReadOnly) return;
    const previous = history[history.length - 1];
    setFuture(prev => [treeData, ...prev]);
    setHistory(prev => prev.slice(0, prev.length - 1));
    setTreeData(previous);
    saveFamilyTree(previous);
  }, [history, treeData, isReadOnly]);

  const handleRedo = useCallback(() => {
    if (future.length === 0 || isReadOnly) return;
    const next = future[0];
    setHistory(prev => [...prev, treeData]);
    setFuture(prev => prev.slice(1));
    setTreeData(next);
    saveFamilyTree(next);
  }, [future, treeData, isReadOnly]);

  // Manual sync to server
  const handleSyncToServer = useCallback(async () => {
    setSaveStatus('saving');
    const success = await saveFamilyTree(treeData);
    setSaveStatus(success ? 'saved' : 'offline');
    return success;
  }, [treeData]);

  // Pull latest data directly from server
  const handleRefreshFromServer = useCallback(async () => {
    setSaveStatus('saving');
    const serverTree = await fetchServerTree();
    if (serverTree && serverTree.persons && Object.keys(serverTree.persons).length > 0) {
      setTreeData(serverTree);
      originalTreeBackupRef.current = serverTree;
      setSaveStatus('saved');
      setFitTrigger(t => t + 1);
      return true;
    } else {
      setSaveStatus('saved');
      return false;
    }
  }, []);

  // Keyboard shortcuts (Ctrl+Z, Ctrl+Y, Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (
        (e.metaKey || e.ctrlKey) &&
        (e.key === 'y' || (e.key === 'z' && e.shiftKey))
      ) {
        e.preventDefault();
        handleRedo();
      } else if (e.key === 'Escape') {
        setIsPersonModalOpen(false);
        setIsImportModalOpen(false);
        setIsExportModalOpen(false);
        setIsTestsModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // Calculate Layout dynamically
  const layout = useMemo(() => {
    return computeTreeLayout(treeData, viewType, collapsedNodeIds);
  }, [treeData, viewType, collapsedNodeIds]);

  // Add person handler
  const handleAddNewPerson = () => {
    if (isReadOnly) {
      setIsUnlockModalOpen(true);
      return;
    }
    const newId = `person-${Date.now()}`;
    const newPerson: Person = {
      id: newId,
      fullName: 'בן/בת משפחה חדש/ה',
    };

    const updated = {
      ...treeData,
      persons: {
        ...treeData.persons,
        [newId]: newPerson,
      },
    };

    updateTreeData(updated);
    setSelectedPersonId(newId);
    setIsPersonModalOpen(true);
  };

  // Quick Add Child
  const handleQuickAddChild = (parentId: string) => {
    if (isReadOnly) {
      setIsUnlockModalOpen(true);
      return;
    }
    const childId = `person-${Date.now()}`;
    const child: Person = {
      id: childId,
      fullName: 'ילד/ה חדש/ה',
    };

    const rel: Relationship = {
      id: `rel-${Date.now()}`,
      type: 'parent-child',
      person1Id: parentId,
      person2Id: childId,
      subType: 'biological',
    };

    const updated = {
      ...treeData,
      persons: {
        ...treeData.persons,
        [childId]: child,
      },
      relationships: [...treeData.relationships, rel],
    };

    updateTreeData(updated);
    setSelectedPersonId(childId);
    setIsPersonModalOpen(true);
  };

  // Quick Add Spouse
  const handleQuickAddSpouse = (personId: string) => {
    if (isReadOnly) {
      setIsUnlockModalOpen(true);
      return;
    }
    const spouseId = `person-${Date.now()}`;
    const spouse: Person = {
      id: spouseId,
      fullName: 'בן/בת זוג',
    };

    const rel: Relationship = {
      id: `rel-${Date.now()}`,
      type: 'spouse',
      person1Id: personId,
      person2Id: spouseId,
    };

    const updated = {
      ...treeData,
      persons: {
        ...treeData.persons,
        [spouseId]: spouse,
      },
      relationships: [...treeData.relationships, rel],
    };

    updateTreeData(updated);
    setSelectedPersonId(spouseId);
    setIsPersonModalOpen(true);
  };

  // Save Person Details
  const handleSavePerson = (updatedPerson: Person) => {
    if (isReadOnly) return;
    const updated = {
      ...treeData,
      persons: {
        ...treeData.persons,
        [updatedPerson.id]: updatedPerson,
      },
    };
    updateTreeData(updated, true, true);
    setIsPersonModalOpen(false);
  };

  // Add Relationship
  const handleAddRelationship = (relData: Omit<Relationship, 'id'>) => {
    if (isReadOnly) return;
    const newRel: Relationship = {
      ...relData,
      id: `rel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };

    const updated = {
      ...treeData,
      relationships: [...treeData.relationships, newRel],
    };
    updateTreeData(updated);
  };

  // Add Person and Relationship atomically
  const handleAddPersonWithRelationship = (
    newPerson: Person,
    relData: Omit<Relationship, 'id'>,
    additionalRelData?: Omit<Relationship, 'id'>
  ) => {
    if (isReadOnly) return;
    const newRel: Relationship = {
      ...relData,
      id: `rel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };

    const newRels = [newRel];
    if (additionalRelData) {
      newRels.push({
        ...additionalRelData,
        id: `rel-${Date.now() + 1}-${Math.random().toString(36).slice(2, 6)}`,
      });
    }

    const updated: FamilyTreeData = {
      ...treeData,
      persons: {
        ...treeData.persons,
        [newPerson.id]: newPerson,
      },
      relationships: [...treeData.relationships, ...newRels],
    };
    updateTreeData(updated);
  };

  // Remove Relationship
  const handleRemoveRelationship = (relId: string) => {
    if (isReadOnly) return;
    const updated = removeRelationship(treeData, relId);
    updateTreeData(updated);
  };

  // Share existing children between two spouses
  const handleShareChildren = (parent1Id: string, parent2Id: string, childIds?: string[]) => {
    if (isReadOnly) return;
    const updated = shareChildrenBetweenSpouses(treeData, parent1Id, parent2Id, childIds);
    updateTreeData(updated);
  };

  // Add Spouse with optional child adoption
  const handleAddSpouseWithSharing = (
    person1Id: string,
    person2Id: string,
    options?: {
      newPerson?: Person;
      adoptPerson1Children?: boolean;
      adoptPerson2Children?: boolean;
    }
  ) => {
    if (isReadOnly) return;
    const updated = addSpouseAndShareChildren(treeData, person1Id, person2Id, options);
    updateTreeData(updated);
  };

  // Delete Person
  const handleDeletePerson = (personId: string) => {
    if (isReadOnly) return;
    const updated = removePersonFromTree(treeData, personId);
    updateTreeData(updated);
    setSelectedPersonId(null);
  };

  // Reorder children manually
  const handleReorderChild = (childId: string, parentId: string, direction: 'up' | 'down') => {
    if (isReadOnly) return;
    const childrenEntries = getChildren(treeData, parentId);
    const index = childrenEntries.findIndex(c => c.person.id === childId);
    if (index === -1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= childrenEntries.length) return;

    // Swap order indices
    const updatedRelationships = treeData.relationships.map(rel => {
      if (rel.type === 'parent-child' && rel.person1Id === parentId) {
        if (rel.person2Id === childId) {
          return { ...rel, orderIndex: targetIndex };
        }
        if (rel.person2Id === childrenEntries[targetIndex].person.id) {
          return { ...rel, orderIndex: index };
        }
      }
      return rel;
    });

    updateTreeData({
      ...treeData,
      relationships: updatedRelationships,
    });
  };

  // Sort children by birth date
  const handleSortChildrenByAge = (parentId: string) => {
    if (isReadOnly) return;
    const childrenEntries = getChildren(treeData, parentId);
    const sorted = [...childrenEntries].sort((a, b) => {
      const b1 = a.person.birthDate || '9999';
      const b2 = b.person.birthDate || '9999';
      return b1.localeCompare(b2);
    });

    const updatedRelationships = treeData.relationships.map(rel => {
      if (rel.type === 'parent-child' && rel.person1Id === parentId) {
        const sortedIndex = sorted.findIndex(s => s.person.id === rel.person2Id);
        if (sortedIndex !== -1) {
          return { ...rel, orderIndex: sortedIndex };
        }
      }
      return rel;
    });

    updateTreeData({
      ...treeData,
      relationships: updatedRelationships,
    });
  };

  // Branch Collapsing & Expanding
  const handleToggleCollapse = (collapseKey: string) => {
    setCollapsedNodeIds(prev => {
      const next = new Set(prev);
      if (next.has(collapseKey)) {
        next.delete(collapseKey);
      } else {
        next.add(collapseKey);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    setCollapsedNodeIds(new Set());
  };

  const handleCollapseBranches = () => {
    // Collapse any node that has children except root generation
    const newCollapsed = new Set<string>();
    for (const node of layout.nodes) {
      if (node.generation >= 1 && node.descendantCount && node.descendantCount > 0) {
        newCollapsed.add(node.id);
      }
    }
    setCollapsedNodeIds(newCollapsed);
  };

  // Import application (replace or merge)
  const handleApplyImportedTree = (importedTree: FamilyTreeData, mode: 'replace' | 'merge') => {
    if (mode === 'replace') {
      updateTreeData(importedTree);
    } else {
      // Merge
      const mergedPersons = { ...treeData.persons, ...importedTree.persons };
      const mergedRels = [...treeData.relationships, ...importedTree.relationships];
      updateTreeData({
        persons: mergedPersons,
        relationships: mergedRels,
        metadata: {
          title: treeData.metadata.title,
          lastUpdated: new Date().toISOString(),
        },
      });
    }
    setFitTrigger(t => t + 1);
  };

  // Sample tree for testing
  const handleLoadSampleTree = () => {
    updateTreeData(SAMPLE_FAMILY_TREE);
    setFitTrigger(t => t + 1);
  };

  return (
    <div
      className="fixed inset-0 w-full h-[100dvh] flex flex-col overflow-hidden select-none transition-colors duration-200"
      style={{ backgroundColor: activeThemeConfig.appBg }}
    >
      {/* Top Bar Navigation */}
      <Navbar
        treeData={treeData}
        viewType={viewType}
        onViewChange={setViewType}
        onAddPerson={handleAddNewPerson}
        onOpenImport={() => setIsImportModalOpen(true)}
        onOpenExport={() => setIsExportModalOpen(true)}
        onOpenTests={() => setIsTestsModalOpen(true)}
        onSelectPerson={id => {
          setSelectedPersonId(id);
          setIsPersonModalOpen(true);
        }}
        onFitToScreen={() => {
          setFitTrigger(t => t + 1);
        }}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={history.length > 0}
        canRedo={future.length > 0}
        saveStatus={saveStatus}
        isReadOnly={isReadOnly}
        onToggleReadOnly={() => {
          if (isReadOnly) {
            setIsUnlockModalOpen(true);
          } else {
            setIsReadOnly(true);
          }
        }}
        onSyncToServer={handleSyncToServer}
        onRefreshFromServer={handleRefreshFromServer}
      />

      {/* Prominent Offline & Pending Sync Warning Banner (Items 1 & 2) */}
      {(saveStatus === 'offline' || saveStatus === 'error') && !isSyncBannerDismissed && (
        <div className="bg-amber-50 border-b border-amber-300 px-4 py-2.5 flex items-center justify-between text-amber-950 text-xs sm:text-sm shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 bg-amber-100 border border-amber-300 rounded-full text-amber-800 shrink-0">
              <CloudOff className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-amber-950 flex items-center gap-2 flex-wrap">
                <span>שינויים אחרונים שמורים במכשיר זה בלבד (טרם סונכרנו לשרת המרכזי)</span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-200 text-amber-900 border border-amber-300">
                  ממתין לסנכרון
                </span>
              </div>
              <div className="text-amber-800 text-[11px] sm:text-xs">
                המידע שמור בבטחה במכשיר. ברגע שיחודש החיבור לרשת, המערכת תסנכרן אותו אוטומטית לכל שאר המכשירים.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 mr-3">
            <button
              type="button"
              onClick={async () => {
                setIsSyncingNow(true);
                setSaveStatus('saving');
                try {
                  const ok = await handleSyncToServer();
                  if (ok) {
                    setIsSyncBannerDismissed(false);
                  }
                } finally {
                  setIsSyncingNow(false);
                }
              }}
              disabled={isSyncingNow}
              className="px-3 py-1 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-md font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingNow ? 'animate-spin' : ''}`} />
              <span>{isSyncingNow ? 'מסנכרן...' : 'סנכרן לשרת עכשיו'}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsSyncBannerDismissed(true)}
              className="p-1 text-amber-700 hover:text-amber-900 hover:bg-amber-200/50 rounded transition-colors cursor-pointer"
              title="סגור הודעה"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Interactive Tree Area */}
      <main
        className="flex-1 relative overflow-hidden transition-colors duration-200"
        style={{ backgroundColor: activeThemeConfig.canvasBg }}
      >
        <TreeCanvas
          layout={layout}
          viewType={viewType}
          selectedPersonId={selectedPersonId}
          fitTrigger={fitTrigger}
          bgTheme={bgTheme}
          onBgThemeChange={handleBgThemeChange}
          onSelectPerson={id => {
            setSelectedPersonId(id);
            setIsPersonModalOpen(true);
          }}
          onQuickAddChild={handleQuickAddChild}
          onQuickAddSpouse={handleQuickAddSpouse}
          onToggleCollapse={handleToggleCollapse}
          onExpandAll={handleExpandAll}
          onCollapseBranches={handleCollapseBranches}
          onAddFirstPerson={handleAddNewPerson}
          onOpenImport={() => setIsImportModalOpen(true)}
          onLoadSampleTree={handleLoadSampleTree}
          onRefreshFromServer={handleRefreshFromServer}
          onViewChange={setViewType}
        />
      </main>

      {/* Person Details & Relationships Drawer */}
      {isPersonModalOpen && selectedPersonId && (
        <PersonModal
          personId={selectedPersonId}
          treeData={treeData}
          isReadOnly={isReadOnly}
          onPromptUnlock={() => setIsUnlockModalOpen(true)}
          onClose={() => {
            setIsPersonModalOpen(false);
          }}
          onSavePerson={handleSavePerson}
          onSelectPerson={id => {
            setSelectedPersonId(id);
          }}
          onAddRelationship={handleAddRelationship}
          onAddPersonWithRelationship={handleAddPersonWithRelationship}
          onAddSpouseWithSharing={handleAddSpouseWithSharing}
          onShareChildren={handleShareChildren}
          onRemoveRelationship={handleRemoveRelationship}
          onDeletePerson={handleDeletePerson}
          onReorderChild={handleReorderChild}
          onSortChildrenByAge={handleSortChildrenByAge}
        />
      )}

      {/* Import Modal */}
      {isImportModalOpen && (
        <ImportModal
          currentTree={treeData}
          onClose={() => setIsImportModalOpen(false)}
          onApplyTree={handleApplyImportedTree}
        />
      )}

      {/* Export & Print Modal */}
      {isExportModalOpen && (
        <ExportModal
          treeData={treeData}
          activeViewType={viewType}
          onClose={() => setIsExportModalOpen(false)}
        />
      )}

      {/* Acceptance Test Runner Modal */}
      {isTestsModalOpen && (
        <AcceptanceTestModal
          currentTree={treeData}
          onClose={() => setIsTestsModalOpen(false)}
          onApplyTestData={testTree => {
            updateTreeData(testTree);
          }}
          onRestoreOriginal={() => {
            if (originalTreeBackupRef.current) {
              updateTreeData(originalTreeBackupRef.current);
            } else {
              updateTreeData(EMPTY_TREE);
            }
          }}
        />
      )}

      {/* Password Unlock Modal */}
      <UnlockModal
        isOpen={isUnlockModalOpen}
        onClose={() => setIsUnlockModalOpen(false)}
        onUnlock={() => {
          setIsReadOnly(false);
        }}
      />
    </div>
  );
}
