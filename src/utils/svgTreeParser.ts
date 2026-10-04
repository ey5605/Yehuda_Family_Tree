import { Person, Relationship, RelationshipType } from '../types/family';

export interface ExtractedPerson {
  tempId: string;
  fullName: string;
  birthDate?: string;
  deathDate?: string;
  confidence: 'high' | 'medium' | 'needs-review';
  x: number;
  y: number;
  rawText: string;
}

export interface ExtractedRelationship {
  tempId: string;
  type: RelationshipType;
  fromTempId: string;
  toTempId: string;
  fromName: string;
  toName: string;
  confidence: 'high' | 'medium' | 'needs-review';
  reason: string;
}

export interface ParseResult {
  persons: ExtractedPerson[];
  relationships: ExtractedRelationship[];
  unmatchedTexts: string[];
  totalElementsFound: number;
}

// Extract date patterns from text (e.g. "1940-2015", "1940 - 2015", "נ' 1930", "1955")
function extractDatesFromText(text: string): { birth?: string; death?: string; cleanText: string } {
  let cleanText = text;
  let birth: string | undefined;
  let death: string | undefined;

  // Range pattern: 1920-1995 or 1920 - 1995
  const rangeMatch = text.match(/(\d{4})\s*[-–—]\s*(\d{4})/);
  if (rangeMatch) {
    birth = rangeMatch[1];
    death = rangeMatch[2];
    cleanText = cleanText.replace(rangeMatch[0], '').trim();
    return { birth, death, cleanText };
  }

  // Single year birth: (1950) or נ' 1950
  const birthMatch = text.match(/(?:נולד[ה]?|נ['׳]|b\.)?\s*(\d{4})/i);
  if (birthMatch) {
    birth = birthMatch[1];
    cleanText = cleanText.replace(birthMatch[0], '').trim();
  }

  // Single year death: נפ' 2005 or d. 2005
  const deathMatch = text.match(/(?:נפטר[ה]?|נפ['׳]|d\.)\s*(\d{4})/i);
  if (deathMatch) {
    death = deathMatch[1];
    cleanText = cleanText.replace(deathMatch[0], '').trim();
  }

  return { birth, death, cleanText };
}

export function parseSvgContent(svgString: string): ParseResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');

  const textNodes = Array.from(doc.querySelectorAll('text'));
  const textItems: { text: string; x: number; y: number; fontSize: number }[] = [];

  for (const node of textNodes) {
    const rawContent = (node.textContent || '').trim();
    if (!rawContent || rawContent.length < 2) continue;

    // Get position attributes
    const xAttr = node.getAttribute('x') || node.getAttribute('dx') || '0';
    const yAttr = node.getAttribute('y') || node.getAttribute('dy') || '0';
    const transform = node.getAttribute('transform') || '';
    let x = parseFloat(xAttr) || 0;
    let y = parseFloat(yAttr) || 0;

    // Parse transform translate(x, y) if available
    const matrixMatch = transform.match(/translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)/);
    if (matrixMatch) {
      x += parseFloat(matrixMatch[1]);
      y += parseFloat(matrixMatch[2]);
    }

    const fontSizeAttr = node.getAttribute('font-size') || node.style.fontSize || '14';
    const fontSize = parseFloat(fontSizeAttr) || 14;

    textItems.push({ text: rawContent, x, y, fontSize });
  }

  // Group text items that are close to each other (likely part of the same person box)
  const boxThresholdX = 140;
  const boxThresholdY = 50;
  const visitedIndices = new Set<number>();
  const persons: ExtractedPerson[] = [];

  for (let i = 0; i < textItems.length; i++) {
    if (visitedIndices.has(i)) continue;
    visitedIndices.add(i);

    const base = textItems[i];
    const group = [base];

    for (let j = i + 1; j < textItems.length; j++) {
      if (visitedIndices.has(j)) continue;
      const target = textItems[j];
      if (
        Math.abs(target.x - base.x) < boxThresholdX &&
        Math.abs(target.y - base.y) < boxThresholdY
      ) {
        group.push(target);
        visitedIndices.add(j);
      }
    }

    // Combine texts in group
    // Typically one line is name and one line is date
    let fullName = '';
    let birthDate: string | undefined;
    let deathDate: string | undefined;
    const allTexts = group.map(g => g.text).join(' ');

    const dateResult = extractDatesFromText(allTexts);
    birthDate = dateResult.birth;
    deathDate = dateResult.death;

    // Clean name from dates and parentheticals
    fullName = dateResult.cleanText
      .replace(/[()]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // If name is too short or just numbers, skip or treat as unmatched
    if (fullName.length >= 2 && !/^\d+$/.test(fullName)) {
      const avgX = group.reduce((sum, g) => sum + g.x, 0) / group.length;
      const avgY = group.reduce((sum, g) => sum + g.y, 0) / group.length;

      persons.push({
        tempId: `extracted-${persons.length + 1}`,
        fullName,
        birthDate,
        deathDate,
        confidence: birthDate ? 'high' : 'medium',
        x: avgX,
        y: avgY,
        rawText: allTexts,
      });
    }
  }

  // Extract lines / connectors to deduce relationships
  const relationships: ExtractedRelationship[] = [];
  const lines = Array.from(doc.querySelectorAll('line, path'));

  // Connect persons based on lines or layout hierarchy (parent above child, spouses beside each other)
  // Check lines
  for (const line of lines) {
    let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
    if (line.tagName.toLowerCase() === 'line') {
      x1 = parseFloat(line.getAttribute('x1') || '0');
      y1 = parseFloat(line.getAttribute('y1') || '0');
      x2 = parseFloat(line.getAttribute('x2') || '0');
      y2 = parseFloat(line.getAttribute('y2') || '0');
    } else if (line.tagName.toLowerCase() === 'path') {
      const d = line.getAttribute('d') || '';
      const points = d.match(/[-+]?[0-9]*\.?[0-9]+/g);
      if (points && points.length >= 4) {
        x1 = parseFloat(points[0]);
        y1 = parseFloat(points[1]);
        x2 = parseFloat(points[points.length - 2]);
        y2 = parseFloat(points[points.length - 1]);
      }
    }

    if (x1 && y1 && x2 && y2) {
      // Find person closest to (x1, y1) and person closest to (x2, y2)
      const p1 = findClosestPerson(persons, x1, y1, 100);
      const p2 = findClosestPerson(persons, x2, y2, 100);

      if (p1 && p2 && p1.tempId !== p2.tempId) {
        // If vertical difference is large, parent-child
        if (Math.abs(p1.y - p2.y) > 40) {
          const parent = p1.y < p2.y ? p1 : p2;
          const child = p1.y < p2.y ? p2 : p1;
          const exists = relationships.some(
            r => r.fromTempId === parent.tempId && r.toTempId === child.tempId
          );
          if (!exists) {
            relationships.push({
              tempId: `rel-${relationships.length + 1}`,
              type: 'parent-child',
              fromTempId: parent.tempId,
              toTempId: child.tempId,
              fromName: parent.fullName,
              toName: child.fullName,
              confidence: 'high',
              reason: 'זוהה קו חיבור אנכי ישיר בשרטוט',
            });
          }
        } else {
          // Horizontal line between two adjacent persons -> spouse
          const exists = relationships.some(
            r =>
              (r.fromTempId === p1.tempId && r.toTempId === p2.tempId) ||
              (r.fromTempId === p2.tempId && r.toTempId === p1.tempId)
          );
          if (!exists) {
            relationships.push({
              tempId: `rel-${relationships.length + 1}`,
              type: 'spouse',
              fromTempId: p1.tempId,
              toTempId: p2.tempId,
              fromName: p1.fullName,
              toName: p2.fullName,
              confidence: 'high',
              reason: 'זוהה קו חיבור אופקי בין שני אנשים באותה שורה',
            });
          }
        }
      }
    }
  }

  // If no lines found or few lines, infer candidate relations by geometric proximity and hierarchy
  // (with confidence 'needs-review' so the user can verify before adding!)
  if (relationships.length === 0 && persons.length > 1) {
    // Sort persons by Y position (top-to-bottom generations)
    const sorted = [...persons].sort((a, b) => a.y - b.y);

    // Group into approximate Y bands (generations)
    const generations: ExtractedPerson[][] = [];
    for (const p of sorted) {
      let placed = false;
      for (const gen of generations) {
        if (Math.abs(gen[0].y - p.y) < 60) {
          gen.push(p);
          placed = true;
          break;
        }
      }
      if (!placed) {
        generations.push([p]);
      }
    }

    // Connect adjacent generations
    for (let g = 0; g < generations.length - 1; g++) {
      const parentGen = generations[g];
      const childGen = generations[g + 1];

      for (const child of childGen) {
        // Find closest parent horizontally
        let closestParent: ExtractedPerson | null = null;
        let minDist = Infinity;
        for (const parent of parentGen) {
          const dist = Math.abs(parent.x - child.x);
          if (dist < minDist) {
            minDist = dist;
            closestParent = parent;
          }
        }

        if (closestParent) {
          relationships.push({
            tempId: `rel-inferred-${relationships.length + 1}`,
            type: 'parent-child',
            fromTempId: closestParent.tempId,
            toTempId: child.tempId,
            fromName: closestParent.fullName,
            toName: child.fullName,
            confidence: 'needs-review',
            reason: 'קשר משוער לפי מיקום אנכי (דור מעל דור) - נדרש אישור',
          });
        }
      }
    }
  }

  return {
    persons,
    relationships,
    unmatchedTexts: textItems
      .filter(t => !persons.some(p => p.rawText.includes(t.text)))
      .map(t => t.text),
    totalElementsFound: textItems.length,
  };
}

function findClosestPerson(persons: ExtractedPerson[], x: number, y: number, maxDist = 120): ExtractedPerson | null {
  let closest: ExtractedPerson | null = null;
  let minDist = maxDist;

  for (const p of persons) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < minDist) {
      minDist = d;
      closest = p;
    }
  }

  return closest;
}
