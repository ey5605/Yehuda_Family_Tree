import { FamilyTreeData, Person, Relationship } from '../types/family';

export interface ParsedTreeOutput {
  tree: FamilyTreeData;
  sourceType: string;
  stats: {
    personsCount: number;
    relationshipsCount: number;
    spouseCount: number;
    parentChildCount: number;
  };
}

/**
 * Universal JSON Family Tree Parser
 * Intelligently recognizes and parses:
 * 1. Standard full tree JSON format ({ persons: {}, relationships: [] })
 * 2. Flat array of persons with spouses, children, parents (Hebrew & English keys)
 * 3. Object-map of persons ({ "Eran": { spouses: [...], children: [...] } })
 * 4. Nested hierarchical tree ({ name: "...", spouse: "...", children: [...] })
 * 5. Handles multiple spouses for any person
 */
export function parseUniversalFamilyJson(jsonInput: string | object): ParsedTreeOutput {
  let raw: any;
  if (typeof jsonInput === 'string') {
    try {
      raw = JSON.parse(jsonInput.trim());
    } catch (e: any) {
      throw new Error(`שגיאה בקריאת קובץ JSON: ${e.message}`);
    }
  } else {
    raw = jsonInput;
  }

  if (!raw || typeof raw !== 'object') {
    throw new Error('התוכן אינו אובייקט או מערך JSON תקין');
  }

  // 1. Check if it's already in the native format ({ persons: {...}, relationships: [] })
  if (raw.persons && (Array.isArray(raw.relationships) || (typeof raw.persons === 'object' && !Array.isArray(raw.persons)))) {
    return parseNativeFormat(raw);
  }

  // 2. Flexible / Human format
  return parseFlexibleFormat(raw);
}

// -------------------------------------------------------------
// Native Format Parser
// -------------------------------------------------------------
function parseNativeFormat(raw: any): ParsedTreeOutput {
  const persons: Record<string, Person> = {};
  const relationships: Relationship[] = [];

  // Parse persons (can be dictionary or array)
  if (Array.isArray(raw.persons)) {
    for (const p of raw.persons) {
      if (p && (p.fullName || p.name || p.id)) {
        const id = String(p.id || `person-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
        persons[id] = {
          id,
          fullName: p.fullName || p.name || 'ללא שם',
          birthDate: p.birthDate || p.birth,
          deathDate: p.deathDate || p.death,
          isBirthApproximate: !!p.isBirthApproximate,
          isDeathApproximate: !!p.isDeathApproximate,
          gender: p.gender,
          photoUrl: p.photoUrl || p.photo,
          notes: p.notes,
        };
      }
    }
  } else if (typeof raw.persons === 'object') {
    for (const [key, p] of Object.entries<any>(raw.persons)) {
      if (p && typeof p === 'object') {
        const id = String(p.id || key);
        persons[id] = {
          id,
          fullName: p.fullName || p.name || key,
          birthDate: p.birthDate || p.birth,
          deathDate: p.deathDate || p.death,
          isBirthApproximate: !!p.isBirthApproximate,
          isDeathApproximate: !!p.isDeathApproximate,
          gender: p.gender,
          photoUrl: p.photoUrl || p.photo,
          notes: p.notes,
        };
      }
    }
  }

  // Parse relationships
  if (Array.isArray(raw.relationships)) {
    for (const r of raw.relationships) {
      if (r && r.type && r.person1Id && r.person2Id) {
        if (persons[r.person1Id] && persons[r.person2Id]) {
          relationships.push({
            id: r.id || `rel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type: r.type,
            person1Id: String(r.person1Id),
            person2Id: String(r.person2Id),
            subType: r.subType || 'biological',
            coparentId: r.coparentId ? String(r.coparentId) : undefined,
            orderIndex: typeof r.orderIndex === 'number' ? r.orderIndex : undefined,
          });
        }
      }
    }
  }

  const spouseCount = relationships.filter(r => r.type === 'spouse').length;
  const parentChildCount = relationships.filter(r => r.type === 'parent-child').length;

  return {
    tree: {
      persons,
      relationships,
      metadata: raw.metadata || {
        title: 'אילן היוחסין',
        lastUpdated: new Date().toISOString(),
      },
    },
    sourceType: 'פורמט גיבוי מלא',
    stats: {
      personsCount: Object.keys(persons).length,
      relationshipsCount: relationships.length,
      spouseCount,
      parentChildCount,
    },
  };
}

// -------------------------------------------------------------
// Flexible Format Parser (Handles array, map, nested, Hebrew/English)
// -------------------------------------------------------------
interface IntermediatePerson {
  id: string;
  fullName: string;
  birthDate?: string;
  deathDate?: string;
  gender?: 'male' | 'female' | 'other';
  photoUrl?: string;
  notes?: string;
  spouses: Set<string>;  // Store target IDs
  children: Set<string>; // Store target IDs
  parents: Set<string>;  // Store target IDs
}

function parseFlexibleFormat(raw: any): ParsedTreeOutput {
  const personRegistry = new Map<string, IntermediatePerson>(); // Key: Normalized name or ID
  const idToPerson = new Map<string, IntermediatePerson>();

  function getOrCreatePerson(input: any): IntermediatePerson | null {
    if (!input) return null;

    if (typeof input === 'string') {
      const name = input.trim();
      if (!name) return null;

      const normName = normalizeKey(name);
      if (personRegistry.has(normName)) {
        return personRegistry.get(normName)!;
      }

      const newId = `person-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const p: IntermediatePerson = {
        id: newId,
        fullName: name,
        spouses: new Set(),
        children: new Set(),
        parents: new Set(),
      };
      personRegistry.set(normName, p);
      idToPerson.set(newId, p);
      return p;
    }

    if (typeof input === 'object') {
      const name = extractName(input);
      const rawId = input.id ? String(input.id).trim() : null;

      if (!name && !rawId) return null;

      const displayName = name || rawId || 'ללא שם';
      const normKey = normalizeKey(displayName);

      let existing: IntermediatePerson | undefined;
      if (rawId && idToPerson.has(rawId)) {
        existing = idToPerson.get(rawId);
      } else if (personRegistry.has(normKey)) {
        existing = personRegistry.get(normKey);
      }

      if (existing) {
        // Merge attributes if new object has more data
        if (input.birthDate || input.birth || input['תאריך לידה']) {
          existing.birthDate = existing.birthDate || String(input.birthDate || input.birth || input['תאריך לידה']);
        }
        if (input.deathDate || input.death || input['תאריך פטירה']) {
          existing.deathDate = existing.deathDate || String(input.deathDate || input.death || input['תאריך פטירה']);
        }
        if (input.gender || input['מין']) {
          existing.gender = existing.gender || normalizeGender(input.gender || input['מין']);
        }
        if (input.photoUrl || input.photo || input['תמונה']) {
          existing.photoUrl = existing.photoUrl || String(input.photoUrl || input.photo || input['תמונה']);
        }
        return existing;
      }

      const id = rawId || `person-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const p: IntermediatePerson = {
        id,
        fullName: displayName,
        birthDate: extractDate(input, ['birthDate', 'birth', 'born', 'birthYear', 'תאריך לידה', 'שנת לידה']),
        deathDate: extractDate(input, ['deathDate', 'death', 'died', 'deathYear', 'תאריך פטירה', 'שנת פטירה']),
        gender: normalizeGender(input.gender || input.sex || input['מין']),
        photoUrl: input.photoUrl || input.photo || input.image || input['תמונה'],
        notes: input.notes || input.bio || input['הערות'],
        spouses: new Set(),
        children: new Set(),
        parents: new Set(),
      };

      personRegistry.set(normKey, p);
      if (rawId) personRegistry.set(normalizeKey(rawId), p);
      idToPerson.set(id, p);
      return p;
    }

    return null;
  }

  // Extract raw list of item representations
  const itemsToProcess: any[] = [];

  function collectItems(val: any) {
    if (!val) return;
    if (Array.isArray(val)) {
      for (const item of val) collectItems(item);
    } else if (typeof val === 'object') {
      const keys = Object.keys(val);
      const isPersonObj = keys.some(k => ['fullName', 'name', 'children', 'spouses', 'spouse', 'parents', 'שם', 'שם מלא'].includes(k));
      if (isPersonObj) {
        itemsToProcess.push(val);
        // Also collect nested children if any
        const children = extractList(val, ['children', 'child', 'descendants', 'ילדים', 'צאצאים']);
        for (const ch of children) {
          if (typeof ch === 'object') collectItems(ch);
        }
      } else {
        // Wrapper object like { family: [...] } or { "Eran": {...} }
        for (const [k, v] of Object.entries<any>(val)) {
          if (v && typeof v === 'object') {
            if (!v.name && !v.fullName && !v['שם']) {
              v.fullName = k;
            }
            collectItems(v);
          }
        }
      }
    }
  }

  collectItems(raw);

  // Step 1: Pre-register all persons from items
  for (const item of itemsToProcess) {
    getOrCreatePerson(item);
  }

  // Step 2: Connect relationships between registered persons
  for (const item of itemsToProcess) {
    const p = getOrCreatePerson(item);
    if (!p) continue;

    // Spouses
    const spouses = extractList(item, ['spouses', 'spouse', 'partner', 'partners', 'husband', 'wife', 'בן זוג', 'בת זוג', 'בני זוג', 'בנות זוג']);
    for (const spRaw of spouses) {
      const sp = getOrCreatePerson(spRaw);
      if (sp && sp.id !== p.id) {
        p.spouses.add(sp.id);
        sp.spouses.add(p.id);
      }
    }

    // Children
    const children = extractList(item, ['children', 'child', 'descendants', 'sons', 'daughters', 'ילדים', 'ילד', 'צאצאים', 'צאצא']);
    for (const chRaw of children) {
      const ch = getOrCreatePerson(chRaw);
      if (ch && ch.id !== p.id) {
        p.children.add(ch.id);
        ch.parents.add(p.id);

        // If P has exactly one spouse, also link the spouse as child's parent
        if (p.spouses.size === 1) {
          const onlySpouseId = Array.from(p.spouses)[0];
          const onlySpouse = idToPerson.get(onlySpouseId);
          if (onlySpouse) {
            onlySpouse.children.add(ch.id);
            ch.parents.add(onlySpouse.id);
          }
        }
      }
    }

    // Parents
    const parents = extractList(item, ['parents', 'parent', 'father', 'mother', 'הורים', 'הורה', 'אב', 'אם', 'אבא', 'אמא']);
    for (const parRaw of parents) {
      const par = getOrCreatePerson(parRaw);
      if (par && par.id !== p.id) {
        par.children.add(p.id);
        p.parents.add(par.id);
      }
    }
  }

  // Step 3: Build final Person objects
  const finalPersons: Record<string, Person> = {};
  for (const p of idToPerson.values()) {
    finalPersons[p.id] = {
      id: p.id,
      fullName: p.fullName,
      birthDate: p.birthDate,
      deathDate: p.deathDate,
      gender: p.gender,
      photoUrl: p.photoUrl,
      notes: p.notes,
    };
  }

  // Step 4: Build final Relationships
  const finalRelationships: Relationship[] = [];
  const spousePairs = new Set<string>();
  const parentChildPairs = new Set<string>();

  // 1. Spouses
  for (const p of idToPerson.values()) {
    for (const spouseId of p.spouses) {
      if (finalPersons[spouseId]) {
        const pairKey = [p.id, spouseId].sort().join(':::');
        if (!spousePairs.has(pairKey)) {
          spousePairs.add(pairKey);
          finalRelationships.push({
            id: `rel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type: 'spouse',
            person1Id: p.id,
            person2Id: spouseId,
          });
        }
      }
    }
  }

  // 2. Parent-Child
  for (const p of idToPerson.values()) {
    for (const childId of p.children) {
      if (finalPersons[childId]) {
        const pcKey = `${p.id}->${childId}`;
        if (!parentChildPairs.has(pcKey)) {
          parentChildPairs.add(pcKey);

          const child = idToPerson.get(childId);
          // Find if child has another parent that is married to P
          let coparentId: string | undefined;
          if (child) {
            for (const otherParentId of child.parents) {
              if (otherParentId !== p.id && p.spouses.has(otherParentId)) {
                coparentId = otherParentId;
                break;
              }
            }
          }

          finalRelationships.push({
            id: `rel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type: 'parent-child',
            person1Id: p.id,
            person2Id: childId,
            subType: 'biological',
            coparentId,
          });
        }
      }
    }
  }

  const spouseCount = finalRelationships.filter(r => r.type === 'spouse').length;
  const parentChildCount = finalRelationships.filter(r => r.type === 'parent-child').length;

  return {
    tree: {
      persons: finalPersons,
      relationships: finalRelationships,
      metadata: {
        title: 'אילן היוחסין המיובא',
        lastUpdated: new Date().toISOString(),
      },
    },
    sourceType: 'קובץ JSON מובנה',
    stats: {
      personsCount: Object.keys(finalPersons).length,
      relationshipsCount: finalRelationships.length,
      spouseCount,
      parentChildCount,
    },
  };
}

// -------------------------------------------------------------
// Format Exporters
// -------------------------------------------------------------
export function exportStandardJson(data: FamilyTreeData): string {
  return JSON.stringify(data, null, 2);
}

export function exportHumanReadableJson(data: FamilyTreeData): string {
  const personsList = Object.values(data.persons).map(person => {
    // Find all spouses
    const spouses = data.relationships
      .filter(r => r.type === 'spouse' && (r.person1Id === person.id || r.person2Id === person.id))
      .map(r => {
        const spouseId = r.person1Id === person.id ? r.person2Id : r.person1Id;
        const spouse = data.persons[spouseId];
        return spouse ? spouse.fullName : spouseId;
      });

    // Find all children
    const children = data.relationships
      .filter(r => r.type === 'parent-child' && r.person1Id === person.id)
      .map(r => {
        const child = data.persons[r.person2Id];
        return child ? child.fullName : r.person2Id;
      });

    // Find all parents
    const parents = data.relationships
      .filter(r => r.type === 'parent-child' && r.person2Id === person.id)
      .map(r => {
        const parent = data.persons[r.person1Id];
        return parent ? parent.fullName : r.person1Id;
      });

    const item: Record<string, any> = {
      fullName: person.fullName,
    };

    if (person.birthDate) item.birthDate = person.birthDate;
    if (person.deathDate) item.deathDate = person.deathDate;
    if (person.gender) item.gender = person.gender;
    if (spouses.length > 0) item.spouses = spouses;
    if (parents.length > 0) item.parents = parents;
    if (children.length > 0) item.children = children;
    if (person.photoUrl && !person.photoUrl.startsWith('data:')) {
      item.photoUrl = person.photoUrl;
    }
    if (person.notes) item.notes = person.notes;

    return item;
  });

  return JSON.stringify(personsList, null, 2);
}

// -------------------------------------------------------------
// Utilities
// -------------------------------------------------------------
function normalizeKey(str: string): string {
  return str.toLowerCase().replace(/[\s\-_־'"]/g, '');
}

function extractName(obj: any): string | null {
  const keys = ['fullName', 'name', 'personName', 'label', 'title', 'שם מלא', 'שם'];
  for (const k of keys) {
    if (obj[k] && typeof obj[k] === 'string' && obj[k].trim()) {
      return obj[k].trim();
    }
  }
  return null;
}

function extractDate(obj: any, keys: string[]): string | undefined {
  for (const k of keys) {
    if (obj[k]) {
      return String(obj[k]).trim();
    }
  }
  return undefined;
}

function extractList(obj: any, keys: string[]): any[] {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) {
      if (Array.isArray(obj[k])) {
        return obj[k];
      }
      if (typeof obj[k] === 'string' || typeof obj[k] === 'object') {
        return [obj[k]];
      }
    }
  }
  return [];
}

function normalizeGender(val: any): 'male' | 'female' | 'other' | undefined {
  if (!val) return undefined;
  const s = String(val).toLowerCase();
  if (['m', 'male', 'זכר', 'איש'].includes(s)) return 'male';
  if (['f', 'female', 'נקבה', 'אשה', 'אישה'].includes(s)) return 'female';
  if (['other', 'אחר'].includes(s)) return 'other';
  return undefined;
}
