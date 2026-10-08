import { FamilyTreeData, LayoutNode, LayoutConnector, TreeLayout, ViewType, Person, BranchCollapseButton } from '../types/family';
import { getParents, getChildren, getSpouses } from './familyGraph';

interface Dimensions {
  nodeWidth: number;
  nodeHeight: number;
  hGap: number;
  vGap: number;
  spouseGap: number;
}

// Compute generation level for every person in the graph
// Rule: gen(child) >= gen(parent) + 1, and gen(spouse1) === gen(spouse2)
export function computeGenerations(data: FamilyTreeData): Map<string, number> {
  const genMap = new Map<string, number>();

  for (const id of Object.keys(data.persons)) {
    genMap.set(id, 0);
  }

  // Iteratively relax constraints until convergence (DAG longest path with spouse equalization)
  let changed = true;
  let iterations = 0;
  const maxIterations = Math.max(Object.keys(data.persons).length * 3, 50);

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    // 1. Parent-Child: Child must be strictly at least 1 generation below all parents
    for (const rel of data.relationships) {
      if (rel.type === 'parent-child') {
        const parentGen = genMap.get(rel.person1Id) ?? 0;
        const childGen = genMap.get(rel.person2Id) ?? 0;
        if (childGen <= parentGen) {
          genMap.set(rel.person2Id, parentGen + 1);
          changed = true;
        }
      }
    }

    // 2. Spouses: Spouses must be in the same generation
    for (const rel of data.relationships) {
      if (rel.type === 'spouse') {
        const g1 = genMap.get(rel.person1Id) ?? 0;
        const g2 = genMap.get(rel.person2Id) ?? 0;
        const targetG = Math.max(g1, g2);
        if (g1 !== targetG) {
          genMap.set(rel.person1Id, targetG);
          changed = true;
        }
        if (g2 !== targetG) {
          genMap.set(rel.person2Id, targetG);
          changed = true;
        }
      }
    }
  }

  return genMap;
}

// Compute total descendant count for a person (for collapse badge)
export function countDescendants(data: FamilyTreeData, personId: string, visited = new Set<string>()): number {
  if (visited.has(personId)) return 0;
  visited.add(personId);

  let count = 0;
  const children = getChildren(data, personId);
  for (const { person: child } of children) {
    count += 1 + countDescendants(data, child.id, visited);
  }
  return count;
}

export function computeTreeLayout(
  data: FamilyTreeData,
  viewType: ViewType,
  collapsedNodeIds: Set<string> = new Set()
): TreeLayout {
  const persons = Object.values(data.persons);
  if (persons.length === 0) {
    return {
      nodes: [],
      connectors: [],
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 },
    };
  }

  // Dimension presets per view
  let dims: Dimensions;
  if (viewType === 'detailed-vertical') {
    dims = {
      nodeWidth: 244,
      nodeHeight: 156,
      hGap: 36,
      vGap: 110,
      spouseGap: 24,
    };
  } else if (viewType === 'compact-vertical') {
    dims = {
      nodeWidth: 184,
      nodeHeight: 66,
      hGap: 18,
      vGap: 64,
      spouseGap: 16,
    };
  } else {
    // compact-horizontal (RTL)
    dims = {
      nodeWidth: 192,
      nodeHeight: 60,
      hGap: 64,
      vGap: 24,
      spouseGap: 18,
    };
  }

  const genMap = computeGenerations(data);

  if (viewType === 'compact-horizontal') {
    return computeHorizontalRTLTreeLayout(data, dims, genMap, collapsedNodeIds);
  }

  return computeVerticalTreeLayout(data, dims, genMap, collapsedNodeIds, viewType);
}

// -------------------------------------------------------------
// Vertical Layout (Detailed & Compact Vertical)
// -------------------------------------------------------------
interface UnionGroup {
  spouse: Person | null; // null for single parent children
  childrenSubtrees: FamilySubtree[];
  linkedChildren?: Person[]; // children already placed as a spouse in another branch
  width: number;
  isCollapsed?: boolean;
}

interface FamilySubtree {
  primaryPerson: Person;
  orderedSpouses: Person[]; // Previous spouses to left, new to right
  unions: UnionGroup[];
  width: number;
  generation: number;
  x: number;
  y: number;
  isCollapsed: boolean;
  descendantCount: number;
}

// Helper: check if a root or subtree has any descendant in a target set
export function findDescendantInSet(
  data: FamilyTreeData,
  rootPersonId: string,
  targetSet: Set<string>,
  visited = new Set<string>()
): string | null {
  if (visited.has(rootPersonId)) return null;
  visited.add(rootPersonId);
  if (targetSet.has(rootPersonId)) return rootPersonId;
  const children = getChildren(data, rootPersonId);
  for (const { person: child } of children) {
    const found = findDescendantInSet(data, child.id, targetSet, visited);
    if (found) return found;
  }
  return null;
}

// Helper: Find other parent/coparent of a child with respect to a primary parent
export function getChildOtherParent(
  data: FamilyTreeData,
  primaryId: string,
  childId: string
): string | null {
  const parents = getParents(data, childId);
  const other = parents.find(p => p.person.id !== primaryId);
  if (other) return other.person.id;

  // Check coparentId in relationship
  for (const rel of data.relationships) {
    if (
      rel.type === 'parent-child' &&
      rel.person1Id === primaryId &&
      rel.person2Id === childId &&
      rel.coparentId
    ) {
      return rel.coparentId;
    }
  }
  return null;
}

// Helper: Canonical collapse key for a couple or solo parent branch
export function getUnionCollapseKey(primaryId: string, spouseId: string | null | undefined): string {
  if (!spouseId || spouseId === 'solo') {
    return `${primaryId}::solo`;
  }
  return primaryId < spouseId ? `${primaryId}::${spouseId}` : `${spouseId}::${primaryId}`;
}

// Helper: Check if a specific union branch is collapsed
export function isUnionCollapsed(
  primaryId: string,
  spouseId: string | null | undefined,
  collapsedNodeIds: Set<string>
): boolean {
  if (!collapsedNodeIds || collapsedNodeIds.size === 0) return false;
  const key = getUnionCollapseKey(primaryId, spouseId);
  if (collapsedNodeIds.has(key)) return true;
  // Backwards compatibility: if person is collapsed globally
  if (collapsedNodeIds.has(primaryId)) return true;
  if (spouseId && spouseId !== 'solo' && collapsedNodeIds.has(spouseId)) return true;
  return false;
}

// Helper: Count descendants belonging to a specific union
export function countUnionDescendants(
  data: FamilyTreeData,
  primaryId: string,
  spouseId: string | null | undefined
): number {
  const children = getChildren(data, primaryId);
  const unionChildren = children.filter(c => {
    const other = getChildOtherParent(data, primaryId, c.person.id);
    if (spouseId && spouseId !== 'solo') {
      return other === spouseId;
    }
    return !other;
  });

  const visited = new Set<string>();
  function countRecursive(personId: string) {
    if (visited.has(personId)) return;
    visited.add(personId);
    const childList = getChildren(data, personId);
    for (const { person: child } of childList) {
      countRecursive(child.id);
    }
  }

  for (const { person: child } of unionChildren) {
    countRecursive(child.id);
  }

  return visited.size > 0 ? visited.size : countDescendants(data, primaryId);
}

// Helper: Collect all person IDs that should be hidden because an ancestor or union is collapsed
export function getHiddenPersonIds(
  data: FamilyTreeData,
  collapsedNodeIds: Set<string>
): Set<string> {
  const hidden = new Set<string>();
  if (!collapsedNodeIds || collapsedNodeIds.size === 0) return hidden;

  function hideBranchDescendants(id: string) {
    if (hidden.has(id)) return;
    hidden.add(id);

    // Spouses of this person: hide spouse if they don't have separate visible parents
    const spouses = getSpouses(data, id);
    for (const s of spouses) {
      const sParents = getParents(data, s.person.id);
      const hasVisibleParents = sParents.length > 0 && sParents.some(p => !hidden.has(p.person.id));
      if (!hasVisibleParents) {
        hidden.add(s.person.id);
      }
    }

    // Children of this person
    const children = getChildren(data, id);
    for (const { person: child } of children) {
      hideBranchDescendants(child.id);
    }
  }

  for (const key of collapsedNodeIds) {
    if (key.includes('::')) {
      const [id1, id2] = key.split('::');
      if (id2 === 'solo') {
        const children = getChildren(data, id1);
        for (const { person: child } of children) {
          const other = getChildOtherParent(data, id1, child.id);
          if (!other) {
            hideBranchDescendants(child.id);
          }
        }
      } else {
        const children = getChildren(data, id1);
        for (const { person: child } of children) {
          const other = getChildOtherParent(data, id1, child.id);
          if (other === id2) {
            hideBranchDescendants(child.id);
          }
        }
        const children2 = getChildren(data, id2);
        for (const { person: child } of children2) {
          const other = getChildOtherParent(data, id2, child.id);
          if (other === id1) {
            hideBranchDescendants(child.id);
          }
        }
      }
    } else {
      const children = getChildren(data, key);
      for (const { person: child } of children) {
        hideBranchDescendants(child.id);
      }
    }
  }

  return hidden;
}

function computeVerticalTreeLayout(
  data: FamilyTreeData,
  dims: Dimensions,
  genMap: Map<string, number>,
  collapsedNodeIds: Set<string>,
  viewType: ViewType = 'detailed-vertical'
): TreeLayout {
  const nodes: LayoutNode[] = [];
  const connectors: LayoutConnector[] = [];
  const branchButtons: BranchCollapseButton[] = [];
  const placedPersons = new Set<string>();
  const hiddenPersons = getHiddenPersonIds(data, collapsedNodeIds);

  // Helper: Find which spouse a child belongs to
  function getOtherParentForChild(primaryId: string, childId: string): string | null {
    const parents = getParents(data, childId);
    const other = parents.find(p => p.person.id !== primaryId);
    if (other) return other.person.id;

    // Check coparentId in relationship
    for (const rel of data.relationships) {
      if (
        rel.type === 'parent-child' &&
        rel.person1Id === primaryId &&
        rel.person2Id === childId &&
        rel.coparentId
      ) {
        return rel.coparentId;
      }
    }
    return null;
  }

  function isDescendantBranch(sub: FamilySubtree): boolean {
    return (
      sub.orderedSpouses.length > 0 ||
      sub.unions.some(u => u.childrenSubtrees.length > 0) ||
      (sub.descendantCount ?? 0) > 0
    );
  }

  function getVerticalSiblingGap(subA: FamilySubtree, subB: FamilySubtree): number {
    const isClusterA = isDescendantBranch(subA);
    const isClusterB = isDescendantBranch(subB);
    if (isClusterA && isClusterB) {
      // Exactly double what it was now between family branches (or single parents) with descendants!
      return dims.hGap * 2;
    }
    if (isClusterA || isClusterB) {
      // Clear separation between a family branch and a single sibling
      return Math.round(dims.hGap * 1.6);
    }
    // Between two single siblings without descendants
    return dims.hGap;
  }

  function computeChildrenWidth(subtrees: FamilySubtree[]): number {
    if (subtrees.length === 0) return 0;
    let total = 0;
    for (let i = 0; i < subtrees.length; i++) {
      total += subtrees[i].width;
      if (i < subtrees.length - 1) {
        total += getVerticalSiblingGap(subtrees[i], subtrees[i + 1]);
      }
    }
    return total;
  }

  const visitedInBuild = new Set<string>();

  function buildFamilySubtree(person: Person): FamilySubtree {
    visitedInBuild.add(person.id);

    const isCollapsed = collapsedNodeIds.has(person.id);
    const descendantCount = countDescendants(data, person.id);
    const personGen = genMap.get(person.id) ?? 0;

    // Get all spouses of this person
    const allSpouseEntries = getSpouses(data, person.id);
    const allSpouses: Person[] = [];
    for (const s of allSpouseEntries) {
      if (!visitedInBuild.has(s.person.id) && !hiddenPersons.has(s.person.id)) {
        visitedInBuild.add(s.person.id);
        allSpouses.push(s.person);
      }
    }

    // Partition all children of this person by their union (by spouse)
    const allChildrenEntries = getChildren(data, person.id);
    const unionMap = new Map<string | null, FamilySubtree[]>();
    const linkedMap = new Map<string | null, Person[]>();

    // Initialize map entries for each spouse
    for (const sp of allSpouses) {
      unionMap.set(sp.id, []);
      linkedMap.set(sp.id, []);
    }
    unionMap.set(null, []); // for single-parent / unspecified children
    linkedMap.set(null, []);

    for (const { person: child } of allChildrenEntries) {
      if (hiddenPersons.has(child.id)) {
        continue;
      }
      const otherParentId = getChildOtherParent(data, person.id, child.id);
      const targetKey = otherParentId && unionMap.has(otherParentId) ? otherParentId : null;

      // Check if this specific union is collapsed
      const unionCollapsed = isUnionCollapsed(person.id, targetKey, collapsedNodeIds);
      if (unionCollapsed) {
        continue;
      }

      if (!visitedInBuild.has(child.id)) {
        const childSubtree = buildFamilySubtree(child);
        const list = unionMap.get(targetKey) || [];
        list.push(childSubtree);
        unionMap.set(targetKey, list);
      } else {
        // Child was already visited in build (e.g. as a spouse in another branch) or placed elsewhere
        const list = linkedMap.get(targetKey) || [];
        list.push(child);
        linkedMap.set(targetKey, list);
      }
    }

    // Helper to get total children count for a spouse from raw data (stable across expand/collapse)
    const getRawSpouseChildrenCount = (spouseId: string) => {
      return allChildrenEntries.filter(
        c => getChildOtherParent(data, person.id, c.person.id) === spouseId
      ).length;
    };

    // Sort spouses stably:
    // If multiple spouses, place previous marriage / spouse with children on the right (higher X, RTL first),
    // and current partner on the left, with the primary person in the center!
    const sortedSpouses = [...allSpouses].sort((a, b) => {
      const aCount = getRawSpouseChildrenCount(a.id);
      const bCount = getRawSpouseChildrenCount(b.id);
      if (aCount !== bCount) {
        return aCount - bCount; // spouse with fewer children to left (sp0), spouse with more children to right (sp1)
      }
      const bA = a.birthDate || '9999';
      const bB = b.birthDate || '9999';
      if (bA !== bB) {
        return bB.localeCompare(bA);
      }
      return a.id.localeCompare(b.id);
    });

    const orderedSpouses: Person[] = sortedSpouses;

    // Build UnionGroup objects in the ordered sequence
    const unions: UnionGroup[] = [];
    for (const sp of orderedSpouses) {
      const childSubs = unionMap.get(sp.id) || [];
      const linkedSubs = linkedMap.get(sp.id) || [];
      const uWidth = computeChildrenWidth(childSubs);
      const isCol = isUnionCollapsed(person.id, sp.id, collapsedNodeIds);
      unions.push({
        spouse: sp,
        childrenSubtrees: childSubs,
        linkedChildren: linkedSubs,
        width: uWidth,
        isCollapsed: isCol,
      });
    }

    // Solo children
    const soloChildren = unionMap.get(null) || [];
    const soloLinked = linkedMap.get(null) || [];
    const hasSoloChildrenInData = allChildrenEntries.some(
      c => !getChildOtherParent(data, person.id, c.person.id) ||
           !allSpouses.some(s => s.id === getChildOtherParent(data, person.id, c.person.id))
    );
    if (soloChildren.length > 0 || soloLinked.length > 0 || hasSoloChildrenInData) {
      const soloWidth = computeChildrenWidth(soloChildren);
      const isCol = isUnionCollapsed(person.id, null, collapsedNodeIds);
      unions.push({
        spouse: null,
        childrenSubtrees: soloChildren,
        linkedChildren: soloLinked,
        width: Math.max(dims.nodeWidth, soloWidth),
        isCollapsed: isCol,
      });
    }

    // Calculate total family block width
    const totalAdults = 1 + allSpouses.length;
    const adultsWidth = totalAdults * dims.nodeWidth + (totalAdults - 1) * dims.spouseGap;

    const allChildrenSubtrees = unions.flatMap(u => u.childrenSubtrees);
    const totalChildrenWidth = computeChildrenWidth(allChildrenSubtrees);

    const width = Math.max(adultsWidth, totalChildrenWidth);

    return {
      primaryPerson: person,
      orderedSpouses,
      unions,
      width,
      generation: personGen,
      x: 0,
      y: 0,
      isCollapsed,
      descendantCount,
    };
  }

  // Assign Coordinates
  function placeFamilySubtree(
    tree: FamilySubtree,
    leftX: number,
    baseStartY: number
  ) {
    tree.x = leftX;
    // Y-coordinate is STRICTLY determined by generation rank!
    // This ensures parents are ALWAYS above their children!
    const nodeY = baseStartY + tree.generation * (dims.nodeHeight + dims.vGap);
    tree.y = nodeY;

    // Place adults row:
    // If 1 spouse: [Primary] [Spouse]
    // If 2+ spouses: [Spouse 0] [Primary] [Spouse 1] ...
    // All spouses are strictly adjacent to the primary person!
    const totalAdults = 1 + tree.orderedSpouses.length;
    const adultsRowWidth = totalAdults * dims.nodeWidth + (totalAdults - 1) * dims.spouseGap;
    let adultsStartX = leftX + (tree.width - adultsRowWidth) / 2;

    // Dedicated cosmetic offset: space Yihye & Chamam further right from Salem & Tzadaka
    if (tree.primaryPerson.id === 'p0018') {
      const yihyeExtraGap = viewType === 'detailed-vertical' ? 700 : 450;
      adultsStartX += yihyeExtraGap;
    }

    const adultPositions = new Map<string, { x: number; y: number }>();

    if (tree.orderedSpouses.length <= 1) {
      if (tree.orderedSpouses.length === 1) {
        const sp = tree.orderedSpouses[0];
        // If spouse has parents in the tree (like Bracha), place spouse on LEFT and primary on RIGHT!
        const spouseHasAncestry = getParents(data, sp.id).length > 0;

        if (spouseHasAncestry) {
          const spouseX = adultsStartX;
          adultPositions.set(sp.id, { x: spouseX, y: nodeY });

          const primaryX = spouseX + dims.nodeWidth + dims.spouseGap;
          adultPositions.set(tree.primaryPerson.id, { x: primaryX, y: nodeY });
        } else {
          const primaryX = adultsStartX;
          adultPositions.set(tree.primaryPerson.id, { x: primaryX, y: nodeY });

          const spouseX = primaryX + dims.nodeWidth + dims.spouseGap;
          adultPositions.set(sp.id, { x: spouseX, y: nodeY });
        }
      } else {
        const primaryX = adultsStartX;
        adultPositions.set(tree.primaryPerson.id, { x: primaryX, y: nodeY });
      }
    } else {
      // 2 or more spouses: [Spouse 0] - [Primary] - [Spouse 1] ...
      // Primary is in the center, previous spouse on left, new spouse on right!
      const sp0 = tree.orderedSpouses[0];
      const sp0X = adultsStartX;
      adultPositions.set(sp0.id, { x: sp0X, y: nodeY });

      const primaryX = sp0X + dims.nodeWidth + dims.spouseGap;
      adultPositions.set(tree.primaryPerson.id, { x: primaryX, y: nodeY });

      let nextX = primaryX + dims.nodeWidth + dims.spouseGap;
      for (let i = 1; i < tree.orderedSpouses.length; i++) {
        const sp = tree.orderedSpouses[i];
        adultPositions.set(sp.id, { x: nextX, y: nodeY });
        nextX += dims.nodeWidth + dims.spouseGap;
      }
    }

    // Push Primary Node
    const pPos = adultPositions.get(tree.primaryPerson.id)!;
    if (!placedPersons.has(tree.primaryPerson.id)) {
      nodes.push({
        id: tree.primaryPerson.id,
        uniqueKey: `${tree.primaryPerson.id}-${nodes.length}`,
        person: tree.primaryPerson,
        x: pPos.x,
        y: pPos.y,
        width: dims.nodeWidth,
        height: dims.nodeHeight,
        generation: tree.generation,
        isCollapsed: tree.isCollapsed,
        descendantCount: tree.descendantCount,
        spouses: tree.orderedSpouses,
      });
      placedPersons.add(tree.primaryPerson.id);
    }

    // Push Spouse Nodes and Marriage Connectors
    for (const spouse of tree.orderedSpouses) {
      const sPos = adultPositions.get(spouse.id)!;
      if (!placedPersons.has(spouse.id)) {
        nodes.push({
          id: spouse.id,
          uniqueKey: `${spouse.id}-${nodes.length}`,
          person: spouse,
          x: sPos.x,
          y: sPos.y,
          width: dims.nodeWidth,
          height: dims.nodeHeight,
          generation: tree.generation,
          isCollapsed: tree.isCollapsed,
        });
        placedPersons.add(spouse.id);
      }

      // Draw horizontal marriage connector between spouse and primary person
      const leftNodeX = Math.min(pPos.x, sPos.x);
      const rightNodeX = Math.max(pPos.x, sPos.x);
      const mStartX = leftNodeX + dims.nodeWidth;
      const mEndX = rightNodeX;
      const mY = nodeY + dims.nodeHeight / 2;

      connectors.push({
        id: `rel-${tree.primaryPerson.id}-${spouse.id}`,
        type: 'marriage',
        path: `M ${mStartX} ${mY} L ${mEndX} ${mY}`,
        fromX: mStartX,
        fromY: mY,
        toX: mEndX,
        toY: mY,
      });
    }

    // Place Children Subtrees for each union (or branch stub button if collapsed)
    const allChildrenForPerson = getChildren(data, tree.primaryPerson.id);
    const stemExtension =
      viewType === 'detailed-vertical'
        ? Math.round(dims.vGap * 0.58)
        : Math.round(24 * 1.6); // 1.6x length of branch exiting parents before splitting to descendants
    const busY = nodeY + dims.nodeHeight + stemExtension;

    for (const union of tree.unions) {
      // Check if this union has children (either active subtrees, linked children, or in the data when collapsed)
      const hasChildren = union.spouse
        ? allChildrenForPerson.some(c => getChildOtherParent(data, tree.primaryPerson.id, c.person.id) === union.spouse?.id)
        : allChildrenForPerson.some(c => !getChildOtherParent(data, tree.primaryPerson.id, c.person.id));

      const hasLinked = Boolean(union.linkedChildren && union.linkedChildren.length > 0);

      if (!hasChildren && union.childrenSubtrees.length === 0 && !hasLinked) {
        continue;
      }

      // Determine anchor for this union
      let unionAnchorX: number;
      let stemStartY: number;

      if (union.spouse) {
        const sPos = adultPositions.get(union.spouse.id);
        if (sPos) {
          const leftNodeX = Math.min(pPos.x, sPos.x);
          const rightNodeX = Math.max(pPos.x, sPos.x);
          const mStartX = leftNodeX + dims.nodeWidth;
          const mEndX = rightNodeX;
          unionAnchorX = (mStartX + mEndX) / 2;
          stemStartY = nodeY + dims.nodeHeight / 2; // directly from the horizontal marriage line!
        } else {
          unionAnchorX = pPos.x + dims.nodeWidth / 2;
          stemStartY = nodeY + dims.nodeHeight;
        }
      } else {
        // Solo / single-parent children
        unionAnchorX = pPos.x + dims.nodeWidth / 2;
        stemStartY = nodeY + dims.nodeHeight;
      }

      // Position branch button higher up between couple squares (in their lower section, adjacent to bottom)
      const branchBtnY = union.spouse
        ? nodeY + Math.round(dims.nodeHeight * 0.88)
        : nodeY + dims.nodeHeight + 12;

      const unionIsCollapsed = union.isCollapsed ?? isUnionCollapsed(tree.primaryPerson.id, union.spouse?.id, collapsedNodeIds);
      const collapseKey = getUnionCollapseKey(tree.primaryPerson.id, union.spouse?.id);
      const descCount = countUnionDescendants(data, tree.primaryPerson.id, union.spouse?.id);

      if (unionIsCollapsed) {
        // When branch is collapsed: draw stub stem from marriage line/parent and place expand button on it!
        const stubEndY = branchBtnY;
        connectors.push({
          id: `stem-stub-${tree.primaryPerson.id}-${union.spouse?.id || 'solo'}`,
          type: 'child',
          path: `M ${unionAnchorX} ${stemStartY} L ${unionAnchorX} ${stubEndY}`,
          fromX: unionAnchorX,
          fromY: stemStartY,
          toX: unionAnchorX,
          toY: stubEndY,
        });

        branchButtons.push({
          id: `branch-btn-${tree.primaryPerson.id}-${union.spouse?.id || 'solo'}`,
          personId: tree.primaryPerson.id,
          spouseId: union.spouse?.id || null,
          collapseKey,
          x: unionAnchorX,
          y: branchBtnY,
          descendantCount: descCount,
          isCollapsed: true,
        });
      } else if (union.childrenSubtrees.length > 0 || hasLinked) {
        // Slight vertical offset for bus bar if this branch connects into an already-placed spouse,
        // so its horizontal bus line remains distinct and never collides with the other spouse's parent bus line
        const actualBusY = hasLinked ? busY - 18 : busY;

        // When branch is expanded: draw full stem down to bus bar and place collapse button on it!
        connectors.push({
          id: `stem-${tree.primaryPerson.id}-${union.spouse?.id || 'solo'}`,
          type: 'child',
          path: `M ${unionAnchorX} ${stemStartY} L ${unionAnchorX} ${actualBusY}`,
          fromX: unionAnchorX,
          fromY: stemStartY,
          toX: unionAnchorX,
          toY: actualBusY,
        });

        branchButtons.push({
          id: `branch-btn-${tree.primaryPerson.id}-${union.spouse?.id || 'solo'}`,
          personId: tree.primaryPerson.id,
          spouseId: union.spouse?.id || null,
          collapseKey,
          x: unionAnchorX,
          y: branchBtnY,
          descendantCount: descCount,
          isCollapsed: false,
        });

        // Calculate start X for this union's children centered directly under unionAnchorX
        const uChildrenWidth = computeChildrenWidth(union.childrenSubtrees);

        let uStartChildX: number;
        const isSalemUnion = tree.primaryPerson.id === 'p0002';
        if (isSalemUnion && union.linkedChildren && union.linkedChildren.length > 0 && union.childrenSubtrees.length > 0) {
          const coupleRightEdge = adultPositions.size > 0
            ? Math.max(...Array.from(adultPositions.values()).map(p => p.x + dims.nodeWidth))
            : unionAnchorX;
          // Offset Aharon's branch to the right to create clear distinction from Sara Talaba & Yehuda
          const aharonExtraGap = viewType === 'detailed-vertical' ? 240 : 160;
          uStartChildX = coupleRightEdge + dims.hGap + aharonExtraGap;
        } else {
          uStartChildX = unionAnchorX - uChildrenWidth / 2;
          if (uStartChildX < leftX) {
            uStartChildX = leftX;
          }
        }

        let currentChildX = uStartChildX;
        const childMidpoints: number[] = [];

        for (let i = 0; i < union.childrenSubtrees.length; i++) {
          const childSub = union.childrenSubtrees[i];

          // Check if this child subtree itself has an already-placed linked child (like Salem with Sara Talaba)
          const linkedDescId = childSub.unions
            .flatMap(u => u.linkedChildren || [])
            .map(c => c.id)
            .find(id => placedPersons.has(id));
          const linkedDescNode = linkedDescId ? nodes.find(n => n.id === linkedDescId) : null;

          let targetXForChild = currentChildX;
          if (childSub.primaryPerson.id === 'p0002' && linkedDescNode) {
            // Place Salem & Tzadaka directly above Sara Talaba!
            targetXForChild = linkedDescNode.x;
          }

          placeFamilySubtree(childSub, targetXForChild, baseStartY);

          // Connect STRICTLY to the child itself (primaryPerson), never to the child's spouse!
          const childNode = nodes.find(n => n.id === childSub.primaryPerson.id);
          const childCenter = childNode
            ? childNode.x + childNode.width / 2
            : targetXForChild + dims.nodeWidth / 2;
          childMidpoints.push(childCenter);

          const childTopY = baseStartY + childSub.generation * (dims.nodeHeight + dims.vGap);

          // Branch down from bus bar to child top
          connectors.push({
            id: `child-stem-${childSub.primaryPerson.id}`,
            type: 'child',
            path: `M ${childCenter} ${actualBusY} L ${childCenter} ${childTopY}`,
            fromX: childCenter,
            fromY: actualBusY,
            toX: childCenter,
            toY: childTopY,
          });

          const gap = i < union.childrenSubtrees.length - 1
            ? getVerticalSiblingGap(childSub, union.childrenSubtrees[i + 1])
            : 0;

          if (childSub.primaryPerson.id === 'p0002' && linkedDescNode) {
            const maxPlacedRight = Math.max(...nodes.map(n => n.x + n.width));
            currentChildX = Math.max(currentChildX, maxPlacedRight + gap);
          } else {
            currentChildX += childSub.width + gap;
          }
        }

        // Connect to linked children (e.g. Bracha placed as spouse to Shalom)
        if (union.linkedChildren) {
          for (const linkedChild of union.linkedChildren) {
            const placedChildNode = nodes.find(n => n.id === linkedChild.id);
            if (placedChildNode) {
              const childCenter = placedChildNode.x + placedChildNode.width / 2;
              childMidpoints.push(childCenter);
              const childTopY = placedChildNode.y;

              // Vertical connector dropping straight into the top center of the spouse!
              connectors.push({
                id: `child-stem-linked-${linkedChild.id}-${tree.primaryPerson.id}`,
                type: 'child',
                path: `M ${childCenter} ${actualBusY} L ${childCenter} ${childTopY}`,
                fromX: childCenter,
                fromY: actualBusY,
                toX: childCenter,
                toY: childTopY,
              });
            }
          }
        }

        // Bus bar for this union's children
        if (childMidpoints.length > 0) {
          const minX = Math.min(...childMidpoints, unionAnchorX);
          const maxX = Math.max(...childMidpoints, unionAnchorX);
          connectors.push({
            id: `bus-${tree.primaryPerson.id}-${union.spouse?.id || 'solo'}`,
            type: 'child',
            path: `M ${minX} ${actualBusY} L ${maxX} ${actualBusY}`,
            fromX: minX,
            fromY: actualBusY,
            toX: maxX,
            toY: actualBusY,
          });
        }
      }
    }
  }

  // 1. Identify TRUE component roots:
  const trueRoots: Person[] = [];
  const processedRoots = new Set<string>();

  for (const person of Object.values(data.persons)) {
    if (hiddenPersons.has(person.id)) continue;
    const parents = getParents(data, person.id);
    if (parents.length === 0) {
      // Check if any spouse has parents
      const spouses = getSpouses(data, person.id);
      const spouseHasParents = spouses.some(s => getParents(data, s.person.id).length > 0);
      if (!spouseHasParents) {
        trueRoots.push(person);
      }
    }
  }

  // Sort roots: primary lineage with most descendants first!
  trueRoots.sort((a, b) => {
    const da = countDescendants(data, a.id);
    const db = countDescendants(data, b.id);
    if (db !== da) return db - da;
    const ga = genMap.get(a.id) ?? 0;
    const gb = genMap.get(b.id) ?? 0;
    return ga - gb;
  });

  // Group married true roots together
  const rootGroups: Person[] = [];
  for (const root of trueRoots) {
    if (processedRoots.has(root.id) || hiddenPersons.has(root.id)) continue;
    rootGroups.push(root);
    processedRoots.add(root.id);

    const spouses = getSpouses(data, root.id);
    for (const s of spouses) {
      processedRoots.add(s.person.id);
    }
  }

  // Layout all root groups
  let currentGroupLeft = 50;
  for (const root of rootGroups) {
    if (placedPersons.has(root.id) || hiddenPersons.has(root.id)) continue;

    // Check if this root is an ancestor branch of someone already placed (e.g. Bracha)
    const targetLinkedId = findDescendantInSet(data, root.id, placedPersons);
    if (targetLinkedId) {
      const targetNode = nodes.find(n => n.id === targetLinkedId);
      if (targetNode) {
        // Find existing nodes at upper generations (<= targetNode.generation)
        const upperNodes = nodes.filter(n => n.generation <= targetNode.generation);

        const targetSpouses = getSpouses(data, targetNode.id);
        const primarySpouseNode = targetSpouses
          .map(s => nodes.find(n => n.id === s.person.id))
          .find(Boolean);

        const isRightSide = !primarySpouseNode || targetNode.x >= primarySpouseNode.x;

        if (isRightSide) {
          // Place to the right of upper nodes near targetNode
          const nearUpperNodes = upperNodes.filter(n => n.x >= targetNode.x - 2000 && n.x <= targetNode.x + 15000);
          const rightEdge = nearUpperNodes.length > 0
            ? Math.max(...nearUpperNodes.map(n => n.x + n.width))
            : targetNode.x + targetNode.width;

          const startLeft = rightEdge + dims.hGap * 1.5;
          const subtree = buildFamilySubtree(root);
          placeFamilySubtree(subtree, startLeft, 50);
          continue;
        } else {
          // Place to the left of targetNode (e.g. Bracha on the left of Shalom)
          const subtree = buildFamilySubtree(root);
          const nearUpperNodes = upperNodes.filter(n => n.x <= targetNode.x && n.x >= targetNode.x - 3000);
          const leftEdge = nearUpperNodes.length > 0
            ? Math.min(...nearUpperNodes.map(n => n.x))
            : targetNode.x;

          const startLeft = leftEdge - subtree.width - dims.hGap * 1.5;
          placeFamilySubtree(subtree, startLeft, 50);
          continue;
        }
      }
    }

    const subtree = buildFamilySubtree(root);
    placeFamilySubtree(subtree, currentGroupLeft, 50);
    currentGroupLeft = Math.max(currentGroupLeft + subtree.width + dims.hGap * 2, ...nodes.map(n => n.x + n.width)) + dims.hGap * 2;
  }

  // Catch any remaining unplaced persons (EXCLUDING hidden persons from collapsed branches!)
  for (const person of Object.values(data.persons)) {
    if (hiddenPersons.has(person.id) || placedPersons.has(person.id)) continue;
    const subtree = buildFamilySubtree(person);
    placeFamilySubtree(subtree, currentGroupLeft, 50);
    currentGroupLeft += subtree.width + dims.hGap * 2;
  }

  // Consanguineous / Cross-branch marriages (between distant relatives)
  for (const rel of data.relationships) {
    if (rel.type === 'spouse') {
      const p1 = nodes.find(n => n.id === rel.person1Id);
      const p2 = nodes.find(n => n.id === rel.person2Id);
      if (p1 && p2 && Math.abs(p1.x - p2.x) > dims.nodeWidth * 2.5) {
        const startX = p1.x + p1.width / 2;
        const startY = p1.y;
        const endX = p2.x + p2.width / 2;
        const endY = p2.y;
        const arcY = Math.min(startY, endY) - 30;
        connectors.push({
          id: `cross-spouse-${rel.id}`,
          type: 'cross-branch',
          path: `M ${startX} ${startY} Q ${(startX + endX) / 2} ${arcY} ${endX} ${endY}`,
          fromX: startX,
          fromY: startY,
          toX: endX,
          toY: endY,
          label: 'נישואין בין ענפים',
        });
      }
    }
  }

  return calculateBounds(nodes, connectors, branchButtons);
}

// -------------------------------------------------------------
// Horizontal RTL Layout (Compact Horizontal)
// Requirement: "דורות מימין לשמאל: הדורות הוותיקים מימין והצאצאים מתפתחים שמאלה"
// -------------------------------------------------------------
interface HUnionGroup {
  spouse: Person | null;
  childrenSubtrees: HFamilySubtree[];
  linkedChildren?: Person[];
  height: number;
  isCollapsed?: boolean;
}

interface HFamilySubtree {
  person: Person;
  orderedSpouses: Person[];
  unions: HUnionGroup[];
  height: number;
  generation: number;
  isCollapsed: boolean;
  descendantCount: number;
}

function computeHorizontalRTLTreeLayout(
  data: FamilyTreeData,
  dims: Dimensions,
  genMap: Map<string, number>,
  collapsedNodeIds: Set<string>
): TreeLayout {
  const nodes: LayoutNode[] = [];
  const connectors: LayoutConnector[] = [];
  const branchButtons: BranchCollapseButton[] = [];
  const placedPersons = new Set<string>();
  const hiddenPersons = getHiddenPersonIds(data, collapsedNodeIds);

  const maxGen = Math.max(...Array.from(genMap.values()), 0);

  function getOtherParentForChild(primaryId: string, childId: string): string | null {
    const parents = getParents(data, childId);
    const other = parents.find(p => p.person.id !== primaryId);
    if (other) return other.person.id;
    return null;
  }

  function isDescendantCluster(sub: HFamilySubtree): boolean {
    return (
      sub.orderedSpouses.length > 0 ||
      sub.unions.some(u => u.childrenSubtrees.length > 0) ||
      (sub.descendantCount ?? 0) > 0
    );
  }

  function getSiblingGap(subA: HFamilySubtree, subB: HFamilySubtree): number {
    const clusterA = isDescendantCluster(subA);
    const clusterB = isDescendantCluster(subB);
    if (clusterA && clusterB) {
      // Generous gap between sibling family clusters so their descendant groups don't look cramped
      return 84;
    }
    if (clusterA || clusterB) {
      // Gap between a sibling family cluster and a single sibling
      return 56;
    }
    // Gap between two single siblings with no spouses/children
    return dims.vGap;
  }

  function computeChildrenTotalHeight(subtrees: HFamilySubtree[]): number {
    if (subtrees.length === 0) return 0;
    let total = 0;
    for (let i = 0; i < subtrees.length; i++) {
      total += subtrees[i].height;
      if (i < subtrees.length - 1) {
        total += getSiblingGap(subtrees[i], subtrees[i + 1]);
      }
    }
    return total;
  }

  const visitedInBuild = new Set<string>();

  function buildHSubtree(person: Person): HFamilySubtree {
    visitedInBuild.add(person.id);

    const isCollapsed = collapsedNodeIds.has(person.id);
    const descendantCount = countDescendants(data, person.id);
    const personGen = genMap.get(person.id) ?? 0;

    const allSpouseEntries = getSpouses(data, person.id);
    const allSpouses: Person[] = [];
    for (const s of allSpouseEntries) {
      if (!visitedInBuild.has(s.person.id) && !hiddenPersons.has(s.person.id)) {
        visitedInBuild.add(s.person.id);
        allSpouses.push(s.person);
      }
    }

    const allChildrenEntries = getChildren(data, person.id);
    const unionMap = new Map<string | null, HFamilySubtree[]>();
    const linkedMap = new Map<string | null, Person[]>();

    for (const sp of allSpouses) {
      unionMap.set(sp.id, []);
      linkedMap.set(sp.id, []);
    }
    unionMap.set(null, []);
    linkedMap.set(null, []);

    for (const { person: child } of allChildrenEntries) {
      if (hiddenPersons.has(child.id)) {
        continue;
      }
      const otherParentId = getChildOtherParent(data, person.id, child.id);
      const targetKey = otherParentId && unionMap.has(otherParentId) ? otherParentId : null;

      // Check if this specific union is collapsed
      const unionCollapsed = isUnionCollapsed(person.id, targetKey, collapsedNodeIds);
      if (unionCollapsed) {
        continue;
      }

      if (!visitedInBuild.has(child.id)) {
        const childSubtree = buildHSubtree(child);
        const list = unionMap.get(targetKey) || [];
        list.push(childSubtree);
        unionMap.set(targetKey, list);
      } else {
        const list = linkedMap.get(targetKey) || [];
        list.push(child);
        linkedMap.set(targetKey, list);
      }
    }

    // Helper to get total children count for a spouse from raw data (stable across expand/collapse)
    const getRawSpouseChildrenCount = (spouseId: string) => {
      return allChildrenEntries.filter(
        c => getChildOtherParent(data, person.id, c.person.id) === spouseId
      ).length;
    };

    // Sort spouses stably so that previous marriage / spouse with children is placed on bottom (sp1),
    // and current partner on top (sp0), with primary person in the center!
    const sortedSpouses = [...allSpouses].sort((a, b) => {
      const aCount = getRawSpouseChildrenCount(a.id);
      const bCount = getRawSpouseChildrenCount(b.id);
      if (aCount !== bCount) {
        return aCount - bCount;
      }
      const bA = a.birthDate || '9999';
      const bB = b.birthDate || '9999';
      if (bA !== bB) {
        return bB.localeCompare(bA);
      }
      return a.id.localeCompare(b.id);
    });

    const orderedSpouses: Person[] = sortedSpouses;

    const unions: HUnionGroup[] = [];
    for (const sp of orderedSpouses) {
      const childSubs = unionMap.get(sp.id) || [];
      const linkedSubs = linkedMap.get(sp.id) || [];
      const uHeight = computeChildrenTotalHeight(childSubs);
      const isCol = isUnionCollapsed(person.id, sp.id, collapsedNodeIds);
      unions.push({
        spouse: sp,
        childrenSubtrees: childSubs,
        linkedChildren: linkedSubs,
        height: uHeight,
        isCollapsed: isCol,
      });
    }

    const soloChildren = unionMap.get(null) || [];
    const soloLinked = linkedMap.get(null) || [];
    const hasSoloChildrenInData = allChildrenEntries.some(
      c => !getChildOtherParent(data, person.id, c.person.id) ||
           !allSpouses.some(s => s.id === getChildOtherParent(data, person.id, c.person.id))
    );
    if (soloChildren.length > 0 || soloLinked.length > 0 || hasSoloChildrenInData) {
      const soloHeight = computeChildrenTotalHeight(soloChildren);
      const isCol = isUnionCollapsed(person.id, null, collapsedNodeIds);
      unions.push({
        spouse: null,
        childrenSubtrees: soloChildren,
        linkedChildren: soloLinked,
        height: Math.max(dims.nodeHeight, soloHeight),
        isCollapsed: isCol,
      });
    }

    const totalAdults = 1 + allSpouses.length;
    const adultsHeight = totalAdults * dims.nodeHeight + (totalAdults - 1) * dims.spouseGap;

    const allChildrenSubtrees = unions.flatMap(u => u.childrenSubtrees);
    const totalChildrenHeight = computeChildrenTotalHeight(allChildrenSubtrees);

    const height = Math.max(adultsHeight, totalChildrenHeight);

    return {
      person,
      orderedSpouses,
      unions,
      height,
      generation: personGen,
      isCollapsed,
      descendantCount,
    };
  }

  function placeHSubtree(
    tree: HFamilySubtree,
    topY: number,
    baseStartX: number
  ) {
    // In RTL horizontal layout:
    // Generation 0 is on the RIGHT.
    // Descendants branch to the LEFT (lower X values).
    const nodeX = baseStartX - tree.generation * (dims.nodeWidth + dims.hGap);

    const totalAdults = 1 + tree.orderedSpouses.length;
    const adultsColumnHeight = totalAdults * dims.nodeHeight + (totalAdults - 1) * dims.spouseGap;
    let adultsStartY = topY + (tree.height - adultsColumnHeight) / 2;

    // Dedicated cosmetic offset: space Yihye & Chamam further down from Salem & Tzadaka
    let yihyeExtraGapH = 0;
    if (tree.person.id === 'p0018') {
      yihyeExtraGapH = 268;
      adultsStartY += yihyeExtraGapH;
    }

    const adultPositions = new Map<string, { x: number; y: number }>();

    if (tree.orderedSpouses.length <= 1) {
      if (tree.orderedSpouses.length === 1) {
        const spouse = tree.orderedSpouses[0];
        const spouseHasAncestry = getParents(data, spouse.id).length > 0;

        if (spouseHasAncestry) {
          // Place spouse on TOP and primary person on BOTTOM (user request: Bracha on top, Shalom below)
          const spouseY = adultsStartY;
          adultPositions.set(spouse.id, { x: nodeX, y: spouseY });

          if (!placedPersons.has(spouse.id)) {
            nodes.push({
              id: spouse.id,
              uniqueKey: `${spouse.id}-${nodes.length}`,
              person: spouse,
              x: nodeX,
              y: spouseY,
              width: dims.nodeWidth,
              height: dims.nodeHeight,
              generation: tree.generation,
              isCollapsed: tree.isCollapsed,
            });
            placedPersons.add(spouse.id);
          }

          const primaryY = spouseY + dims.nodeHeight + dims.spouseGap;
          adultPositions.set(tree.person.id, { x: nodeX, y: primaryY });

          if (!placedPersons.has(tree.person.id)) {
            nodes.push({
              id: tree.person.id,
              uniqueKey: `${tree.person.id}-${nodes.length}`,
              person: tree.person,
              x: nodeX,
              y: primaryY,
              width: dims.nodeWidth,
              height: dims.nodeHeight,
              generation: tree.generation,
              isCollapsed: tree.isCollapsed,
              descendantCount: tree.descendantCount,
              spouses: tree.orderedSpouses,
            });
            placedPersons.add(tree.person.id);
          }

          // Vertical connector between spouse (top) and primary (bottom)
          connectors.push({
            id: `h-rel-${tree.person.id}-${spouse.id}`,
            type: 'marriage',
            path: `M ${nodeX + dims.nodeWidth / 2} ${spouseY + dims.nodeHeight} L ${nodeX + dims.nodeWidth / 2} ${primaryY}`,
            fromX: nodeX + dims.nodeWidth / 2,
            fromY: spouseY + dims.nodeHeight,
            toX: nodeX + dims.nodeWidth / 2,
            toY: primaryY,
          });
        } else {
          let currY = adultsStartY;
          adultPositions.set(tree.person.id, { x: nodeX, y: currY });

          if (!placedPersons.has(tree.person.id)) {
            nodes.push({
              id: tree.person.id,
              uniqueKey: `${tree.person.id}-${nodes.length}`,
              person: tree.person,
              x: nodeX,
              y: currY,
              width: dims.nodeWidth,
              height: dims.nodeHeight,
              generation: tree.generation,
              isCollapsed: tree.isCollapsed,
              descendantCount: tree.descendantCount,
              spouses: tree.orderedSpouses,
            });
            placedPersons.add(tree.person.id);
          }

          currY += dims.nodeHeight + dims.spouseGap;
          adultPositions.set(spouse.id, { x: nodeX, y: currY });

          if (!placedPersons.has(spouse.id)) {
            nodes.push({
              id: spouse.id,
              uniqueKey: `${spouse.id}-${nodes.length}`,
              person: spouse,
              x: nodeX,
              y: currY,
              width: dims.nodeWidth,
              height: dims.nodeHeight,
              generation: tree.generation,
              isCollapsed: tree.isCollapsed,
            });
            placedPersons.add(spouse.id);
          }

          connectors.push({
            id: `h-rel-${tree.person.id}-${spouse.id}`,
            type: 'marriage',
            path: `M ${nodeX + dims.nodeWidth / 2} ${adultsStartY + dims.nodeHeight} L ${nodeX + dims.nodeWidth / 2} ${currY}`,
            fromX: nodeX + dims.nodeWidth / 2,
            fromY: adultsStartY + dims.nodeHeight,
            toX: nodeX + dims.nodeWidth / 2,
            toY: currY,
          });
        }
      } else {
        adultPositions.set(tree.person.id, { x: nodeX, y: adultsStartY });
        if (!placedPersons.has(tree.person.id)) {
          nodes.push({
            id: tree.person.id,
            uniqueKey: `${tree.person.id}-${nodes.length}`,
            person: tree.person,
            x: nodeX,
            y: adultsStartY,
            width: dims.nodeWidth,
            height: dims.nodeHeight,
            generation: tree.generation,
            isCollapsed: tree.isCollapsed,
            descendantCount: tree.descendantCount,
            spouses: tree.orderedSpouses,
          });
          placedPersons.add(tree.person.id);
        }
      }
    } else {
      // 2 or more spouses: Primary person in the middle!
      // sp0 at adultsStartY, Primary in center, sp1 below
      const sp0 = tree.orderedSpouses[0];
      const sp0Y = adultsStartY;
      adultPositions.set(sp0.id, { x: nodeX, y: sp0Y });
      if (!placedPersons.has(sp0.id)) {
        nodes.push({
          id: sp0.id,
          uniqueKey: `${sp0.id}-${nodes.length}`,
          person: sp0,
          x: nodeX,
          y: sp0Y,
          width: dims.nodeWidth,
          height: dims.nodeHeight,
          generation: tree.generation,
          isCollapsed: tree.isCollapsed,
        });
        placedPersons.add(sp0.id);
      }

      const primaryY = sp0Y + dims.nodeHeight + dims.spouseGap;
      adultPositions.set(tree.person.id, { x: nodeX, y: primaryY });
      if (!placedPersons.has(tree.person.id)) {
        nodes.push({
          id: tree.person.id,
          uniqueKey: `${tree.person.id}-${nodes.length}`,
          person: tree.person,
          x: nodeX,
          y: primaryY,
          width: dims.nodeWidth,
          height: dims.nodeHeight,
          generation: tree.generation,
          isCollapsed: tree.isCollapsed,
          descendantCount: tree.descendantCount,
          spouses: tree.orderedSpouses,
        });
        placedPersons.add(tree.person.id);
      }

      // Vertical connector between sp0 and primary
      connectors.push({
        id: `h-rel-${tree.person.id}-${sp0.id}`,
        type: 'marriage',
        path: `M ${nodeX + dims.nodeWidth / 2} ${sp0Y + dims.nodeHeight} L ${nodeX + dims.nodeWidth / 2} ${primaryY}`,
        fromX: nodeX + dims.nodeWidth / 2,
        fromY: sp0Y + dims.nodeHeight,
        toX: nodeX + dims.nodeWidth / 2,
        toY: primaryY,
      });

      let nextY = primaryY + dims.nodeHeight + dims.spouseGap;
      for (let i = 1; i < tree.orderedSpouses.length; i++) {
        const sp = tree.orderedSpouses[i];
        adultPositions.set(sp.id, { x: nodeX, y: nextY });
        if (!placedPersons.has(sp.id)) {
          nodes.push({
            id: sp.id,
            uniqueKey: `${sp.id}-${nodes.length}`,
            person: sp,
            x: nodeX,
            y: nextY,
            width: dims.nodeWidth,
            height: dims.nodeHeight,
            generation: tree.generation,
            isCollapsed: tree.isCollapsed,
          });
          placedPersons.add(sp.id);
        }

        // Vertical connector between primary and this spouse
        connectors.push({
          id: `h-rel-${tree.person.id}-${sp.id}`,
          type: 'marriage',
          path: `M ${nodeX + dims.nodeWidth / 2} ${primaryY + dims.nodeHeight} L ${nodeX + dims.nodeWidth / 2} ${nextY}`,
          fromX: nodeX + dims.nodeWidth / 2,
          fromY: primaryY + dims.nodeHeight,
          toX: nodeX + dims.nodeWidth / 2,
          toY: nextY,
        });

        nextY += dims.nodeHeight + dims.spouseGap;
      }
    }

    // Children placed to the LEFT (or branch stub button if collapsed)
    const allChildrenForPersonH = getChildren(data, tree.person.id);
    const busX = nodeX - dims.hGap / 2;

    for (const union of tree.unions) {
      const hasChildren = union.spouse
        ? allChildrenForPersonH.some(c => getChildOtherParent(data, tree.person.id, c.person.id) === union.spouse?.id)
        : allChildrenForPersonH.some(c => !getChildOtherParent(data, tree.person.id, c.person.id));

      const hasLinked = Boolean(union.linkedChildren && union.linkedChildren.length > 0);

      if (!hasChildren && union.childrenSubtrees.length === 0 && !hasLinked) {
        continue;
      }

      const pPos = adultPositions.get(tree.person.id)!;
      let anchorY: number;

      if (union.spouse) {
        const sPos = adultPositions.get(union.spouse.id);
        if (sPos) {
          const topNodeY = Math.min(pPos.y, sPos.y) + dims.nodeHeight;
          const botNodeY = Math.max(pPos.y, sPos.y);
          anchorY = (topNodeY + botNodeY) / 2; // directly from vertical marriage line!
        } else {
          anchorY = pPos.y + dims.nodeHeight / 2;
        }
      } else {
        // Solo children
        anchorY = pPos.y + dims.nodeHeight / 2;
      }

      // Connecting line from between parents to descendant branch:
      // When couple is present: line starts at the vertical marriage line between parents!
      // When solo: line starts at parent node's left edge.
      const stemStartX = union.spouse ? nodeX + dims.nodeWidth / 2 : nodeX;

      // Branch collapse/expand button position:
      // User request: "את לחצן הפתיחה/סגירה של הענפים תמקם בין בני הזוג, בחלק השמאלי של המלבן"
      // In Y: anchorY (between the spouses in their vertical gap)
      // In X: in the left part of the couple rectangle (nodeX + 22)
      const branchBtnX = union.spouse ? nodeX + 22 : nodeX - 14;
      const branchBtnY = anchorY;

      const unionIsCollapsed = union.isCollapsed ?? isUnionCollapsed(tree.person.id, union.spouse?.id, collapsedNodeIds);
      const collapseKey = getUnionCollapseKey(tree.person.id, union.spouse?.id);
      const descCount = countUnionDescendants(data, tree.person.id, union.spouse?.id);

      if (unionIsCollapsed) {
        // Line from marriage line between parents to the branch button / left edge of rectangle
        connectors.push({
          id: `h-stem-stub-${tree.person.id}-${union.spouse?.id || 'solo'}`,
          type: 'child',
          path: `M ${stemStartX} ${anchorY} L ${nodeX} ${anchorY}`,
          fromX: stemStartX,
          fromY: anchorY,
          toX: nodeX,
          toY: anchorY,
        });

        branchButtons.push({
          id: `h-branch-btn-${tree.person.id}-${union.spouse?.id || 'solo'}`,
          personId: tree.person.id,
          spouseId: union.spouse?.id || null,
          collapseKey,
          x: branchBtnX,
          y: branchBtnY,
          descendantCount: descCount,
          isCollapsed: true,
        });
      } else if (union.childrenSubtrees.length > 0 || hasLinked) {
        // Slight horizontal offset for bus bar if this branch connects into an already-placed spouse,
        // so its bus line remains distinct and never collides with the other spouse's parent bus line
        const actualBusX = hasLinked ? busX + 18 : busX;

        // Full stem from marriage line between parents, through the left part of the rectangle, all the way to bus bar
        connectors.push({
          id: `h-stem-${tree.person.id}-${union.spouse?.id || 'solo'}`,
          type: 'child',
          path: `M ${stemStartX} ${anchorY} L ${actualBusX} ${anchorY}`,
          fromX: stemStartX,
          fromY: anchorY,
          toX: actualBusX,
          toY: anchorY,
        });

        branchButtons.push({
          id: `h-branch-btn-${tree.person.id}-${union.spouse?.id || 'solo'}`,
          personId: tree.person.id,
          spouseId: union.spouse?.id || null,
          collapseKey,
          x: branchBtnX,
          y: branchBtnY,
          descendantCount: descCount,
          isCollapsed: false,
        });

        const uChildrenHeight = computeChildrenTotalHeight(union.childrenSubtrees);

        let uStartChildY: number;
        const isSalemUnion = tree.person.id === 'p0002';
        if (isSalemUnion && union.linkedChildren && union.linkedChildren.length > 0 && union.childrenSubtrees.length > 0) {
          const coupleBottomEdge = adultPositions.size > 0
            ? Math.max(...Array.from(adultPositions.values()).map(p => p.y + dims.nodeHeight))
            : anchorY;
          // Offset Aharon's branch downwards to create clear distinction from Sara Talaba & Yehuda
          const aharonExtraGapH = 150;
          uStartChildY = coupleBottomEdge + dims.vGap + aharonExtraGapH;
        } else {
          // When placing Yihye's children, use unshifted anchor so Yehuda remains aligned with Sara Talaba & Salem,
          // while Yihye & Hamam couple is lowered further down independently!
          const childAnchorY = tree.person.id === 'p0018' ? anchorY - yihyeExtraGapH : anchorY;
          uStartChildY = childAnchorY - uChildrenHeight / 2;
          if (uStartChildY < topY) {
            uStartChildY = topY;
          }
        }

        let currentChildY = uStartChildY;
        const childMidpointsY: number[] = [];

        for (let i = 0; i < union.childrenSubtrees.length; i++) {
          const childSub = union.childrenSubtrees[i];

          const linkedDescId = childSub.unions
            .flatMap(u => u.linkedChildren || [])
            .map(c => c.id)
            .find(id => placedPersons.has(id));
          const linkedDescNode = linkedDescId ? nodes.find(n => n.id === linkedDescId) : null;

          let targetYForChild = currentChildY;
          if (childSub.person.id === 'p0002' && linkedDescNode) {
            // Align Salem directly with Sara Talaba in horizontal layout
            targetYForChild = linkedDescNode.y;
          }

          placeHSubtree(childSub, targetYForChild, baseStartX);

          // Connect strictly to the child primary node
          const childNode = nodes.find(n => n.id === childSub.person.id);
          const childCenterY = childNode
            ? childNode.y + childNode.height / 2
            : targetYForChild + dims.nodeHeight / 2;
          childMidpointsY.push(childCenterY);

          const childRightEdgeX = baseStartX - childSub.generation * (dims.nodeWidth + dims.hGap) + dims.nodeWidth;

          // Connect from bus bar to child right edge
          connectors.push({
            id: `h-child-stem-${childSub.person.id}`,
            type: 'child',
            path: `M ${actualBusX} ${childCenterY} L ${childRightEdgeX} ${childCenterY}`,
            fromX: actualBusX,
            fromY: childCenterY,
            toX: childRightEdgeX,
            toY: childCenterY,
          });

          const gap = i < union.childrenSubtrees.length - 1
            ? getSiblingGap(childSub, union.childrenSubtrees[i + 1])
            : 0;

          if (childSub.person.id === 'p0002' && linkedDescNode) {
            const maxPlacedBottom = Math.max(...nodes.map(n => n.y + n.height));
            currentChildY = Math.max(currentChildY, maxPlacedBottom + gap);
          } else {
            currentChildY += childSub.height + gap;
          }
        }

        // Connect to linked children (e.g. Bracha placed as spouse to Shalom)
        if (union.linkedChildren) {
          for (const linkedChild of union.linkedChildren) {
            const placedChildNode = nodes.find(n => n.id === linkedChild.id);
            if (placedChildNode) {
              const childCenterY = placedChildNode.y + placedChildNode.height / 2;
              childMidpointsY.push(childCenterY);
              const childRightEdgeX = placedChildNode.x + placedChildNode.width;

              // Horizontal connector connecting from bus bar into right edge of spouse!
              connectors.push({
                id: `h-child-stem-linked-${linkedChild.id}-${tree.person.id}`,
                type: 'child',
                path: `M ${actualBusX} ${childCenterY} L ${childRightEdgeX} ${childCenterY}`,
                fromX: actualBusX,
                fromY: childCenterY,
                toX: childRightEdgeX,
                toY: childCenterY,
              });
            }
          }
        }

        if (childMidpointsY.length > 0) {
          const minY = Math.min(...childMidpointsY, anchorY);
          const maxY = Math.max(...childMidpointsY, anchorY);
          connectors.push({
            id: `h-bus-${tree.person.id}-${union.spouse?.id || 'solo'}`,
            type: 'child',
            path: `M ${actualBusX} ${minY} L ${actualBusX} ${maxY}`,
            fromX: actualBusX,
            fromY: minY,
            toX: actualBusX,
            toY: maxY,
          });
        }
      }
    }
  }

  // True roots
  const trueRoots: Person[] = [];
  const processedRoots = new Set<string>();

  for (const person of Object.values(data.persons)) {
    if (hiddenPersons.has(person.id)) continue;
    const parents = getParents(data, person.id);
    if (parents.length === 0) {
      const spouses = getSpouses(data, person.id);
      const spouseHasParents = spouses.some(s => getParents(data, s.person.id).length > 0);
      if (!spouseHasParents) {
        trueRoots.push(person);
      }
    }
  }

  // Sort roots: primary lineage with most descendants first!
  trueRoots.sort((a, b) => {
    const da = countDescendants(data, a.id);
    const db = countDescendants(data, b.id);
    if (db !== da) return db - da;
    return (genMap.get(a.id) ?? 0) - (genMap.get(b.id) ?? 0);
  });

  const rootGroups: Person[] = [];
  for (const root of trueRoots) {
    if (processedRoots.has(root.id) || hiddenPersons.has(root.id)) continue;
    rootGroups.push(root);
    processedRoots.add(root.id);
    for (const s of getSpouses(data, root.id)) {
      processedRoots.add(s.person.id);
    }
  }

  // Right edge baseline X for generation 0 (stable and deterministic)
  const baseStartX = maxGen * (dims.nodeWidth + dims.hGap) + 50;
  let currentGroupTop = 50;

  for (const root of rootGroups) {
    if (placedPersons.has(root.id) || hiddenPersons.has(root.id)) continue;

    // Check if this root is an ancestor branch of someone already placed (e.g. Bracha)
    const targetLinkedId = findDescendantInSet(data, root.id, placedPersons);
    if (targetLinkedId) {
      const targetNode = nodes.find(n => n.id === targetLinkedId);
      if (targetNode) {
        const upperNodes = nodes.filter(n => n.generation <= targetNode.generation);

        const targetSpouses = getSpouses(data, targetNode.id);
        const primarySpouseNode = targetSpouses
          .map(s => nodes.find(n => n.id === s.person.id))
          .find(Boolean);

        const isBottomSide = primarySpouseNode ? targetNode.y >= primarySpouseNode.y : true;

        if (isBottomSide) {
          const nearUpperNodes = upperNodes.filter(n => n.y >= targetNode.y - 1500 && n.y <= targetNode.y + 1200);
          const bottomEdge = nearUpperNodes.length > 0
            ? Math.max(...nearUpperNodes.map(n => n.y + n.height))
            : targetNode.y + targetNode.height;

          const startTop = bottomEdge + dims.vGap * 1.5;
          const subtree = buildHSubtree(root);
          placeHSubtree(subtree, startTop, baseStartX);
          continue;
        } else {
          // Target node is placed ABOVE primary spouse (e.g. Bracha above Shalom)
          // Place ancestor branch ABOVE targetNode!
          const subtree = buildHSubtree(root);
          const nearUpperNodes = upperNodes.filter(n => n.y <= targetNode.y && n.y >= targetNode.y - 4000);
          const topAnchor = nearUpperNodes.length > 0
            ? Math.min(...nearUpperNodes.map(n => n.y))
            : targetNode.y;

          const startTop = topAnchor - subtree.height - dims.vGap * 1.5;
          placeHSubtree(subtree, startTop, baseStartX);
          continue;
        }
      }
    }

    const subtree = buildHSubtree(root);
    placeHSubtree(subtree, currentGroupTop, baseStartX);
    currentGroupTop = Math.max(currentGroupTop + subtree.height + 90, ...nodes.map(n => n.y + n.height)) + dims.vGap * 2;
  }

  for (const person of Object.values(data.persons)) {
    if (hiddenPersons.has(person.id) || placedPersons.has(person.id)) continue;
    const subtree = buildHSubtree(person);
    placeHSubtree(subtree, currentGroupTop, baseStartX);
    currentGroupTop += subtree.height + 90;
  }

  return calculateBounds(nodes, connectors, branchButtons);
}

function calculateBounds(
  nodes: LayoutNode[],
  connectors: LayoutConnector[],
  branchButtons: BranchCollapseButton[] = []
): TreeLayout {
  if (nodes.length === 0) {
    return {
      nodes: [],
      connectors: [],
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 },
      branchButtons: [],
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }

  const padding = 80;
  return {
    nodes,
    connectors,
    bounds: {
      minX: minX - padding,
      minY: minY - padding,
      maxX: maxX + padding,
      maxY: maxY + padding,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2,
    },
    branchButtons,
  };
}
