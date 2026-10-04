import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  Sparkles,
  GitBranch,
  Layers,
  ArrowRight,
  RotateCcw,
  Check
} from 'lucide-react';
import { FamilyTreeData, Person, Relationship } from '../types/family';

interface AcceptanceTestModalProps {
  currentTree: FamilyTreeData;
  onClose: () => void;
  onApplyTestData: (testTree: FamilyTreeData) => void;
  onRestoreOriginal: () => void;
}

export const AcceptanceTestModal: React.FC<AcceptanceTestModalProps> = ({
  currentTree,
  onClose,
  onApplyTestData,
  onRestoreOriginal,
}) => {
  const [activeTest, setActiveTest] = useState<string | null>(null);

  // Test 1: 20+ Children Test Generator
  const generate20ChildrenTree = (): FamilyTreeData => {
    const parentId = 'test-parent-1';
    const spouseId = 'test-spouse-1';

    const persons: Record<string, Person> = {
      [parentId]: {
        id: parentId,
        fullName: 'אברהם יהודה (אב המשפחה - מבחן 22 ילדים)',
        birthDate: '1920',
        deathDate: '2005',
      },
      [spouseId]: {
        id: spouseId,
        fullName: 'שרה יהודה',
        birthDate: '1924',
        deathDate: '2010',
      },
    };

    const relationships: Relationship[] = [
      {
        id: 'rel-m-1',
        type: 'spouse',
        person1Id: parentId,
        person2Id: spouseId,
      },
    ];

    const hebrewNames = [
      'יצחק', 'יעקב', 'ראובן', 'שמעון', 'לוי', 'יהודה', 'יששכר', 'זבולון',
      'דן', 'נפתלי', 'גד', 'אשר', 'יוסף', 'בנימין', 'דינה', 'מרים',
      'תמר', 'רחל', 'לאה', 'דוד', 'שלמה', 'יהונתן'
    ];

    hebrewNames.forEach((name, i) => {
      const childId = `test-child-${i + 1}`;
      persons[childId] = {
        id: childId,
        fullName: `${name} יהודה`,
        birthDate: `${1945 + i}`,
      };
      relationships.push({
        id: `rel-c-${i + 1}`,
        type: 'parent-child',
        person1Id: parentId,
        person2Id: childId,
        coparentId: spouseId,
        orderIndex: i,
      });
    });

    return {
      persons,
      relationships,
      metadata: {
        title: 'עץ בדיקה: 22 ילדים ללא מגבלה',
        lastUpdated: new Date().toISOString(),
      },
    };
  };

  // Test 2: 15+ Generations Deep Lineage
  const generate15GenerationsTree = (): FamilyTreeData => {
    const persons: Record<string, Person> = {};
    const relationships: Relationship[] = [];

    let prevParentId: string | null = null;

    for (let gen = 1; gen <= 16; gen++) {
      const personId = `gen-${gen}`;
      persons[personId] = {
        id: personId,
        fullName: `יהודה דור ${gen}`,
        birthDate: `${1500 + gen * 32}`,
      };

      if (prevParentId) {
        relationships.push({
          id: `rel-gen-${gen}`,
          type: 'parent-child',
          person1Id: prevParentId,
          person2Id: personId,
        });
      }

      prevParentId = personId;
    }

    return {
      persons,
      relationships,
      metadata: {
        title: 'עץ בדיקה: 16 דורות רציפים בעומק',
        lastUpdated: new Date().toISOString(),
      },
    };
  };

  // Test 3: Multiple Spouses & Consanguineous Marriage
  const generateComplexUnionsTree = (): FamilyTreeData => {
    const persons: Record<string, Person> = {
      'root-1': { id: 'root-1', fullName: 'אהרון יהודה', birthDate: '1910' },
      'spouse-1': { id: 'spouse-1', fullName: 'רבקה (בת זוג ראשונה)', birthDate: '1915' },
      'spouse-2': { id: 'spouse-2', fullName: 'מרים (בת זוג שנייה)', birthDate: '1920' },
      // Children of spouse 1
      'c-1': { id: 'c-1', fullName: 'דניאל יהודה (מנישואין 1)', birthDate: '1938' },
      'c-2': { id: 'c-2', fullName: 'מיכל יהודה (מנישואין 1)', birthDate: '1941' },
      // Children of spouse 2
      'c-3': { id: 'c-3', fullName: 'עומר יהודה (מנישואין 2)', birthDate: '1948' },
      'c-4': { id: 'c-4', fullName: 'נועה יהודה (מנישואין 2)', birthDate: '1952' },
      // Second branch and cross marriage
      'root-2': { id: 'root-2', fullName: 'שמואל כהן', birthDate: '1912' },
      'c-ext': { id: 'c-ext', fullName: 'אלי כהן', birthDate: '1945' },
    };

    const relationships: Relationship[] = [
      // Multiple spouses
      { id: 'rel-m-1', type: 'spouse', person1Id: 'root-1', person2Id: 'spouse-1' },
      { id: 'rel-m-2', type: 'spouse', person1Id: 'root-1', person2Id: 'spouse-2' },
      // Children from union 1
      { id: 'rel-c-1', type: 'parent-child', person1Id: 'root-1', person2Id: 'c-1', coparentId: 'spouse-1' },
      { id: 'rel-c-2', type: 'parent-child', person1Id: 'root-1', person2Id: 'c-2', coparentId: 'spouse-1' },
      // Children from union 2
      { id: 'rel-c-3', type: 'parent-child', person1Id: 'root-1', person2Id: 'c-3', coparentId: 'spouse-2' },
      { id: 'rel-c-4', type: 'parent-child', person1Id: 'root-1', person2Id: 'c-4', coparentId: 'spouse-2' },
      // Branch 2
      { id: 'rel-ext-1', type: 'parent-child', person1Id: 'root-2', person2Id: 'c-ext' },
      // Consanguineous / Cross-branch marriage between Eli Cohen and Noa Yehuda
      { id: 'rel-cross', type: 'spouse', person1Id: 'c-4', person2Id: 'c-ext' },
    ];

    return {
      persons,
      relationships,
      metadata: {
        title: 'עץ בדיקה: ריבוי זוגיות ונישואין בין ענפים ללא כפילות',
        lastUpdated: new Date().toISOString(),
      },
    };
  };

  const handleRunTest = (testKey: string, treeGenerator: () => FamilyTreeData) => {
    setActiveTest(testKey);
    onApplyTestData(treeGenerator());
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-stone-200 flex flex-col space-y-5 animate-in fade-in duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-900 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-hebrew-serif font-bold text-lg text-stone-900">
                מרכז בדיקות קבלה ואימות דרישות
              </h2>
              <p className="text-xs text-stone-500">
                טעינת מבני נתונים לאימות 12 בדיקות הקבלה של המפרט
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Test List */}
        <div className="space-y-3">
          {/* Test 1 */}
          <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-stone-900">
                1. בדיקת 22 ילדים לאדם יחיד
              </div>
              <div className="text-[11px] text-stone-500">
                מוודא שאין מגבלה שרירותית על מספר הילדים והפריסה מתרחבת באופן תקין.
              </div>
            </div>
            <button
              onClick={() => handleRunTest('20-children', generate20ChildrenTree)}
              className="px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-white text-xs font-medium rounded-lg shrink-0"
            >
              הפעל בדיקה
            </button>
          </div>

          {/* Test 2 */}
          <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-stone-900">
                2. בדיקת עומק של 16 דורות רצופים
              </div>
              <div className="text-[11px] text-stone-500">
                מוודא תמיכה מלאה בהיררכיה עמוקה ללא מגבלת דורות או קריסת פריסה.
              </div>
            </div>
            <button
              onClick={() => handleRunTest('15-generations', generate15GenerationsTree)}
              className="px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-white text-xs font-medium rounded-lg shrink-0"
            >
              הפעל בדיקה
            </button>
          </div>

          {/* Test 3 */}
          <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-stone-900">
                3. ריבוי זוגיות וחיבור בין ענפים
              </div>
              <div className="text-[11px] text-stone-500">
                הורה לילדים מכמה זוגיות שונות, ונישואין בין קרובים ללא שכפול ישויות.
              </div>
            </div>
            <button
              onClick={() => handleRunTest('complex-unions', generateComplexUnionsTree)}
              className="px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-white text-xs font-medium rounded-lg shrink-0"
            >
              הפעל בדיקה
            </button>
          </div>
        </div>

        {/* Restore Original */}
        <div className="pt-2 flex items-center justify-between border-t border-stone-200 text-xs">
          <button
            onClick={() => {
              onRestoreOriginal();
              onClose();
            }}
            className="flex items-center gap-1.5 text-stone-600 hover:text-stone-900 font-medium"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>החזר לעץ המקורי (או לעץ נקי)</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-lg"
          >
            סגור חלון
          </button>
        </div>
      </div>
    </div>
  );
};
