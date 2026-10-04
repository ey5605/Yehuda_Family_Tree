import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { TreeCanvas } from './components/TreeCanvas';
import { PersonModal } from './components/PersonModal';
import { ImportModal } from './components/ImportModal';
import { ExportModal } from './components/ExportModal';
import { AcceptanceTestModal } from './components/AcceptanceTestModal';
import { FamilyTreeData, ViewType, Person, Relationship } from './types/family';
import { computeTreeLayout } from './utils/treeLayout';
import {
  loadFamilyTree,
  saveFamilyTree,
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
  const [isReadOnly, setIsReadOnly] = useState<boolean>(false);
  const [fitTrigger, setFitTrigger] = useState(1);

  // Undo / Redo History Stacks
  const [history, setHistory] = useState<FamilyTreeData[]>([]);
  const [future, setFuture] = useState<FamilyTreeData[]>([]);
  const originalTreeBackupRef = useRef<FamilyTreeData | null>(null);

  // Load tree on initial mount
  useEffect(() => {
    async function init() {
      const loaded = await loadFamilyTree();
      setTreeData(loaded);
      originalTreeBackupRef.current = loaded;
      setFitTrigger(t => t + 1);
    }
    init();
  }, []);

  // Push new state with undo record
  const updateTreeData = useCallback(
    (newTree: FamilyTreeData, recordHistory = true) => {
      if (recordHistory) {
        setHistory(prev => [...prev.slice(-30), treeData]);
        setFuture([]);
      }
      setTreeData(newTree);

      // Trigger debounced autosave
      setSaveStatus('saving');
      const timer = setTimeout(async () => {
        const success = await saveFamilyTree(newTree);
        setSaveStatus(success ? 'saved' : 'offline');
      }, 500);

      return () => clearTimeout(timer);
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
    if (isReadOnly) return;
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
    if (isReadOnly) return;
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
    if (isReadOnly) return;
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
    updateTreeData(updated);
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
  const handleToggleCollapse = (personId: string) => {
    setCollapsedNodeIds(prev => {
      const next = new Set(prev);
      if (next.has(personId)) {
        next.delete(personId);
      } else {
        next.add(personId);
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
    <div className="fixed inset-0 w-full h-[100dvh] flex flex-col overflow-hidden bg-stone-50 select-none">
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
        onToggleReadOnly={() => setIsReadOnly(r => !r)}
      />

      {/* Main Interactive Tree Area */}
      <main className="flex-1 relative overflow-hidden">
        <TreeCanvas
          layout={layout}
          viewType={viewType}
          selectedPersonId={selectedPersonId}
          fitTrigger={fitTrigger}
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
          onViewChange={setViewType}
        />
      </main>

      {/* Person Details & Relationships Drawer */}
      {isPersonModalOpen && selectedPersonId && (
        <PersonModal
          personId={selectedPersonId}
          treeData={treeData}
          isReadOnly={isReadOnly}
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
    </div>
  );
}
