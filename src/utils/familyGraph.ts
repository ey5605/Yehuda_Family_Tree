import { FamilyTreeData, Person, Relationship, DateValidationResult } from '../types/family';

// Get parents of a person
export function getParents(data: FamilyTreeData, personId: string): { person: Person; relationship: Relationship }[] {
  const result: { person: Person; relationship: Relationship }[] = [];
  for (const rel of data.relationships) {
    if (rel.type === 'parent-child' && rel.person2Id === personId) {
      const parent = data.persons[rel.person1Id];
      if (parent) {
        result.push({ person: parent, relationship: rel });
      }
    }
  }
  return result;
}

// Get children of a person
export function getChildren(data: FamilyTreeData, personId: string): { person: Person; relationship: Relationship }[] {
  const result: { person: Person; relationship: Relationship }[] = [];
  for (const rel of data.relationships) {
    if (rel.type === 'parent-child' && rel.person1Id === personId) {
      const child = data.persons[rel.person2Id];
      if (child) {
        result.push({ person: child, relationship: rel });
      }
    }
  }

  // Sort children by orderIndex if present, otherwise by birthDate
  return result.sort((a, b) => {
    if (a.relationship.orderIndex !== undefined && b.relationship.orderIndex !== undefined) {
      return a.relationship.orderIndex - b.relationship.orderIndex;
    }
    const b1 = a.person.birthDate || '9999';
    const b2 = b.person.birthDate || '9999';
    return b1.localeCompare(b2);
  });
}

// Get spouses of a person
export function getSpouses(data: FamilyTreeData, personId: string): { person: Person; relationship: Relationship }[] {
  const result: { person: Person; relationship: Relationship }[] = [];
  for (const rel of data.relationships) {
    if (rel.type === 'spouse') {
      if (rel.person1Id === personId) {
        const spouse = data.persons[rel.person2Id];
        if (spouse) result.push({ person: spouse, relationship: rel });
      } else if (rel.person2Id === personId) {
        const spouse = data.persons[rel.person1Id];
        if (spouse) result.push({ person: spouse, relationship: rel });
      }
    }
  }
  return result;
}

// Get all ancestors of a person (to prevent cycles)
export function getAllAncestors(data: FamilyTreeData, personId: string, visited = new Set<string>()): Set<string> {
  if (visited.has(personId)) return visited;
  visited.add(personId);

  const parents = getParents(data, personId);
  for (const { person } of parents) {
    getAllAncestors(data, person.id, visited);
  }
  return visited;
}

// Check if adding prospectiveParent as a parent of childId would create a cycle
export function canAddParent(data: FamilyTreeData, childId: string, prospectiveParentId: string): { canAdd: boolean; reason?: string } {
  if (childId === prospectiveParentId) {
    return { canAdd: false, reason: 'אדם אינו יכול להיות הורה של עצמו.' };
  }

  // Check if prospectiveParent is already a parent
  const existingParents = getParents(data, childId);
  if (existingParents.some(p => p.person.id === prospectiveParentId)) {
    return { canAdd: false, reason: 'אדם זה כבר מוגדר כהורה של האדם הנוכחי.' };
  }

  // Check if prospectiveParent is a descendant of childId (cycle check)
  // i.e., childId is in the ancestors of prospectiveParent
  const prospectiveAncestors = getAllAncestors(data, prospectiveParentId);
  if (prospectiveAncestors.has(childId)) {
    return {
      canAdd: false,
      reason: 'לא ניתן להוסיף קשר זה כיוון שהוא ייצור מעגל שבו אדם הופך לאב קדמון של עצמו.',
    };
  }

  return { canAdd: true };
}

// Check if adding prospectiveChild as a child of parentId is allowed
export function canAddChild(data: FamilyTreeData, parentId: string, prospectiveChildId: string): { canAdd: boolean; reason?: string } {
  return canAddParent(data, prospectiveChildId, parentId);
}

// Check if adding spouse is allowed
export function canAddSpouse(data: FamilyTreeData, person1Id: string, person2Id: string): { canAdd: boolean; reason?: string } {
  if (person1Id === person2Id) {
    return { canAdd: false, reason: 'אדם אינו יכול להיות בן/בת זוג של עצמו.' };
  }
  const spouses = getSpouses(data, person1Id);
  if (spouses.some(s => s.person.id === person2Id)) {
    return { canAdd: false, reason: 'קשר זוגיות בין שני אנשים אלה כבר קיים.' };
  }
  return { canAdd: true };
}

// Validate date logical consistency
export function validateDates(birthDate?: string, deathDate?: string): DateValidationResult {
  if (!birthDate || !deathDate) {
    return { isValid: true };
  }

  const cleanBirth = birthDate.replace(/[^0-9-]/g, '');
  const cleanDeath = deathDate.replace(/[^0-9-]/g, '');

  if (!cleanBirth || !cleanDeath) {
    return { isValid: true };
  }

  // If both have year or full ISO
  // Compare strings (e.g. "1950" vs "1940", or "1950-02" vs "1950-01")
  const birthPrefix = cleanBirth.slice(0, Math.min(cleanBirth.length, cleanDeath.length));
  const deathPrefix = cleanDeath.slice(0, Math.min(cleanBirth.length, cleanDeath.length));

  if (cleanDeath < cleanBirth) {
    return {
      isValid: false,
      warning: `תשומת לב: תאריך הפטירה (${deathDate}) קודם לתאריך הלידה (${birthDate}). אנא בדוק את הנתונים.`,
    };
  }

  return { isValid: true };
}

// Format flexible date for display without inventing missing days/months
export function formatDisplayDate(dateStr?: string, isApproximate?: boolean): string {
  if (!dateStr) return '';
  const prefix = isApproximate ? 'כ־' : '';
  const trimmed = dateStr.trim();

  // If in YYYY-MM-DD format, display as DD/MM/YYYY
  const parts = trimmed.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${prefix}${parseInt(d, 10)}/${parseInt(m, 10)}/${y}`;
  }
  if (parts.length === 2) {
    const [y, m] = parts;
    return `${prefix}${parseInt(m, 10)}/${y}`;
  }
  return `${prefix}${trimmed}`;
}

// Duplicate name search (returns other people with the exact same name for warning)
export function findDuplicateNames(data: FamilyTreeData, fullName: string, currentId?: string): Person[] {
  const trimmed = fullName.trim().toLowerCase();
  if (!trimmed) return [];

  const duplicates: Person[] = [];
  for (const p of Object.values(data.persons)) {
    if (p.id !== currentId && p.fullName.trim().toLowerCase() === trimmed) {
      duplicates.push(p);
    }
  }
  return duplicates;
}

// Summary of what relationships will be removed if a person is deleted
export interface DeletionImpact {
  person: Person;
  parentRelationsCount: number;
  childRelationsCount: number;
  spouseRelationsCount: number;
  totalRelationsCount: number;
  childrenNames: string[];
}

export function getDeletionImpact(data: FamilyTreeData, personId: string): DeletionImpact | null {
  const person = data.persons[personId];
  if (!person) return null;

  const parents = getParents(data, personId);
  const children = getChildren(data, personId);
  const spouses = getSpouses(data, personId);

  return {
    person,
    parentRelationsCount: parents.length,
    childRelationsCount: children.length,
    spouseRelationsCount: spouses.length,
    totalRelationsCount: parents.length + children.length + spouses.length,
    childrenNames: children.map(c => c.person.fullName),
  };
}

// Delete person and sever connections (preserves children as independent persons!)
export function removePersonFromTree(data: FamilyTreeData, personId: string): FamilyTreeData {
  const newPersons = { ...data.persons };
  delete newPersons[personId];

  const newRelationships = data.relationships.filter(
    r => r.person1Id !== personId && r.person2Id !== personId
  );

  return {
    ...data,
    persons: newPersons,
    relationships: newRelationships,
    metadata: {
      ...data.metadata,
      lastUpdated: new Date().toISOString(),
    },
  };
}

// Remove a specific relationship without deleting persons
export function removeRelationship(data: FamilyTreeData, relationshipId: string): FamilyTreeData {
  return {
    ...data,
    relationships: data.relationships.filter(r => r.id !== relationshipId),
    metadata: {
      ...data.metadata,
      lastUpdated: new Date().toISOString(),
    },
  };
}

// Get children of parentId that are NOT yet linked to spouseId
export function getUnsharedChildren(
  data: FamilyTreeData,
  parentId: string,
  spouseId: string
): Person[] {
  const children = getChildren(data, parentId);
  const spouseChildrenIds = new Set(getChildren(data, spouseId).map(c => c.person.id));

  return children
    .filter(c => !spouseChildrenIds.has(c.person.id))
    .map(c => c.person);
}

// Link children as shared children between two spouses
export function shareChildrenBetweenSpouses(
  data: FamilyTreeData,
  parent1Id: string,
  parent2Id: string,
  childIdsToShare?: string[]
): FamilyTreeData {
  const newRelationships = [...data.relationships];
  const targetChildIds = childIdsToShare ? new Set(childIdsToShare) : null;

  // 1. Share parent1's children with parent2
  const p1Children = getChildren(data, parent1Id);
  for (const { person: child, relationship: rel } of p1Children) {
    if (targetChildIds && !targetChildIds.has(child.id)) continue;

    // Check if parent2 is already linked to child
    const alreadyLinked = newRelationships.some(
      r => r.type === 'parent-child' && r.person1Id === parent2Id && r.person2Id === child.id
    );

    if (!alreadyLinked) {
      newRelationships.push({
        id: `rel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'parent-child',
        person1Id: parent2Id,
        person2Id: child.id,
        coparentId: parent1Id,
        subType: 'biological',
      });
    }

    // Set coparentId on parent1's relationship to child
    const p1RelIdx = newRelationships.findIndex(r => r.id === rel.id);
    if (p1RelIdx !== -1) {
      newRelationships[p1RelIdx] = {
        ...newRelationships[p1RelIdx],
        coparentId: parent2Id,
      };
    }
  }

  // 2. Share parent2's children with parent1 (reciprocal)
  const p2Children = getChildren(data, parent2Id);
  for (const { person: child, relationship: rel } of p2Children) {
    if (targetChildIds && !targetChildIds.has(child.id)) continue;

    const alreadyLinked = newRelationships.some(
      r => r.type === 'parent-child' && r.person1Id === parent1Id && r.person2Id === child.id
    );

    if (!alreadyLinked) {
      newRelationships.push({
        id: `rel-${Date.now() + 1}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'parent-child',
        person1Id: parent1Id,
        person2Id: child.id,
        coparentId: parent2Id,
        subType: 'biological',
      });
    }

    const p2RelIdx = newRelationships.findIndex(r => r.id === rel.id);
    if (p2RelIdx !== -1) {
      newRelationships[p2RelIdx] = {
        ...newRelationships[p2RelIdx],
        coparentId: parent1Id,
      };
    }
  }

  return {
    ...data,
    relationships: newRelationships,
    metadata: {
      ...data.metadata,
      lastUpdated: new Date().toISOString(),
    },
  };
}

// Atomically add spouse and optionally adopt/share existing children between them
export function addSpouseAndShareChildren(
  data: FamilyTreeData,
  person1Id: string,
  person2Id: string,
  options?: {
    newPerson?: Person;
    adoptPerson1Children?: boolean;
    adoptPerson2Children?: boolean;
  }
): FamilyTreeData {
  let updatedData: FamilyTreeData = { ...data };

  if (options?.newPerson) {
    updatedData = {
      ...updatedData,
      persons: {
        ...updatedData.persons,
        [options.newPerson.id]: options.newPerson,
      },
    };
  }

  // Ensure spouse relationship exists
  const hasSpouseRel = updatedData.relationships.some(
    r =>
      r.type === 'spouse' &&
      ((r.person1Id === person1Id && r.person2Id === person2Id) ||
        (r.person1Id === person2Id && r.person2Id === person1Id))
  );

  const newRelationships = [...updatedData.relationships];
  if (!hasSpouseRel) {
    newRelationships.push({
      id: `rel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'spouse',
      person1Id,
      person2Id,
    });
  }

  updatedData = {
    ...updatedData,
    relationships: newRelationships,
  };

  // 1. Adopt person1's children to person2
  if (options?.adoptPerson1Children) {
    const p1Children = getChildren(updatedData, person1Id);
    for (const { person: child, relationship: rel } of p1Children) {
      const alreadyLinked = newRelationships.some(
        r => r.type === 'parent-child' && r.person1Id === person2Id && r.person2Id === child.id
      );
      if (!alreadyLinked) {
        newRelationships.push({
          id: `rel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'parent-child',
          person1Id: person2Id,
          person2Id: child.id,
          coparentId: person1Id,
          subType: 'biological',
        });
      }
      const p1RelIdx = newRelationships.findIndex(r => r.id === rel.id);
      if (p1RelIdx !== -1) {
        newRelationships[p1RelIdx] = {
          ...newRelationships[p1RelIdx],
          coparentId: person2Id,
        };
      }
    }
  }

  // 2. Adopt person2's children to person1
  if (options?.adoptPerson2Children) {
    const p2Children = getChildren(updatedData, person2Id);
    for (const { person: child, relationship: rel } of p2Children) {
      const alreadyLinked = newRelationships.some(
        r => r.type === 'parent-child' && r.person1Id === person1Id && r.person2Id === child.id
      );
      if (!alreadyLinked) {
        newRelationships.push({
          id: `rel-${Date.now() + 1}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'parent-child',
          person1Id,
          person2Id: child.id,
          coparentId: person2Id,
          subType: 'biological',
        });
      }
      const p2RelIdx = newRelationships.findIndex(r => r.id === rel.id);
      if (p2RelIdx !== -1) {
        newRelationships[p2RelIdx] = {
          ...newRelationships[p2RelIdx],
          coparentId: person1Id,
        };
      }
    }
  }

  return {
    ...updatedData,
    relationships: newRelationships,
    metadata: {
      ...updatedData.metadata,
      lastUpdated: new Date().toISOString(),
    },
  };
}
