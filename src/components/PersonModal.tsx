import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  User,
  Camera,
  Trash2,
  Calendar,
  AlertTriangle,
  Heart,
  UserPlus,
  ArrowUpRight,
  ArrowDownRight,
  ShieldAlert,
  ArrowUpDown,
  Search,
  Check,
  ChevronDown,
  Users,
  Sparkles,
  Lock,
  Unlock,
  RefreshCw
} from 'lucide-react';
import { Person, FamilyTreeData, Relationship, ParentChildSubType, Gender } from '../types/family';
import {
  getParents,
  getChildren,
  getSpouses,
  canAddParent,
  canAddChild,
  canAddSpouse,
  validateDates,
  formatDisplayDate,
  findDuplicateNames,
  getDeletionImpact,
  removePersonFromTree,
  removeRelationship,
  getUnsharedChildren,
} from '../utils/familyGraph';

interface PersonModalProps {
  personId: string | null;
  initialMode?: 'view' | 'edit';
  treeData: FamilyTreeData;
  isReadOnly: boolean;
  onPromptUnlock?: () => void;
  onClose: () => void;
  onSavePerson: (updatedPerson: Person) => void;
  onSelectPerson: (personId: string) => void;
  onAddRelationship: (rel: Omit<Relationship, 'id'>) => void;
  onAddPersonWithRelationship: (newPerson: Person, rel: Omit<Relationship, 'id'>, additionalRel?: Omit<Relationship, 'id'>) => void;
  onAddSpouseWithSharing?: (
    person1Id: string,
    person2Id: string,
    options?: {
      newPerson?: Person;
      adoptPerson1Children?: boolean;
      adoptPerson2Children?: boolean;
    }
  ) => void;
  onShareChildren: (parent1Id: string, parent2Id: string, childIds?: string[]) => void;
  onRemoveRelationship: (relationshipId: string) => void;
  onDeletePerson: (personId: string) => void;
  onReorderChild: (childId: string, parentId: string, direction: 'up' | 'down') => void;
  onSortChildrenByAge: (parentId: string) => void;
}

export const PersonModal: React.FC<PersonModalProps> = ({
  personId,
  initialMode = 'view',
  treeData,
  isReadOnly,
  onPromptUnlock,
  onClose,
  onSavePerson,
  onSelectPerson,
  onAddRelationship,
  onAddPersonWithRelationship,
  onAddSpouseWithSharing,
  onShareChildren,
  onRemoveRelationship,
  onDeletePerson,
  onReorderChild,
  onSortChildrenByAge,
}) => {
  const person = personId ? treeData.persons[personId] : null;

  // Form State
  const [fullName, setFullName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [isBirthApproximate, setIsBirthApproximate] = useState(false);
  const [deathDate, setDeathDate] = useState('');
  const [isDeathApproximate, setIsDeathApproximate] = useState(false);
  const [notes, setNotes] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  const [gender, setGender] = useState<Gender | undefined>(undefined);

  // Relationship adding modals/tabs
  const [isAddingParent, setIsAddingParent] = useState(false);
  const [isAddingSpouse, setIsAddingSpouse] = useState(false);
  const [isAddingChild, setIsAddingChild] = useState(false);
  const [selectedExistingPersonId, setSelectedExistingPersonId] = useState('');
  const [newPersonName, setNewPersonName] = useState('');
  const [subType, setSubType] = useState<ParentChildSubType>('biological');
  const [selectedCoparentId, setSelectedCoparentId] = useState<string>('');
  const [adoptMyChildren, setAdoptMyChildren] = useState(true);
  const [adoptSpouseChildren, setAdoptSpouseChildren] = useState(true);

  // Delete impact confirmation dialog state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Photo crop/zoom state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Sync form when person opens
  useEffect(() => {
    if (person) {
      setFullName(person.fullName || '');
      setBirthDate(person.birthDate || '');
      setIsBirthApproximate(person.isBirthApproximate || false);
      setDeathDate(person.deathDate || '');
      setIsDeathApproximate(person.isDeathApproximate || false);
      setNotes(person.notes || '');
      setPhotoUrl(person.photoUrl);
      setGender(person.gender);
      setPhotoError(null);
      setIsUploadingPhoto(false);
    }
  }, [person]);

  if (!person) return null;

  // Real-time duplicate name detection
  const duplicateNames = fullName.trim()
    ? findDuplicateNames(treeData, fullName, person.id)
    : [];

  // Date validation check
  const dateValidation = validateDates(birthDate, deathDate);

  // Current relationships
  const parents = getParents(treeData, person.id);
  const children = getChildren(treeData, person.id);
  const spouses = getSpouses(treeData, person.id);

  // Handle Photo File Upload with rock-solid FileReader & Canvas downscaling
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setPhotoError('נא לבחור קובץ תמונה תקין (JPG, PNG, WebP וכד\').');
      return;
    }

    setPhotoError(null);
    setIsUploadingPhoto(true);

    const reader = new FileReader();

    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (!result) {
        setIsUploadingPhoto(false);
        setPhotoError('שגיאה בטעינת קובץ התמונה. נא לנסות שוב.');
        return;
      }

      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const size = 300; // Crisp square avatar
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            setPhotoUrl(result);
            setIsUploadingPhoto(false);
            return;
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          const minDim = Math.min(img.width, img.height);
          const startX = (img.width - minDim) / 2;
          const startY = (img.height - minDim) / 2;

          ctx.drawImage(img, startX, startY, minDim, minDim, 0, 0, size, size);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          setPhotoUrl(dataUrl);
        } catch (err) {
          console.error('Error processing photo canvas:', err);
          setPhotoUrl(result);
        } finally {
          setIsUploadingPhoto(false);
        }
      };

      img.onerror = () => {
        setIsUploadingPhoto(false);
        setPhotoError('לא ניתן לפענח את התמונה. נא לוודא שהקובץ תקין.');
      };

      img.src = result;
    };

    reader.onerror = () => {
      setIsUploadingPhoto(false);
      setPhotoError('שגיאה בקריאת הקובץ מהמכשיר.');
    };

    reader.readAsDataURL(file);
  };

  // Save changes
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return;

    onSavePerson({
      ...person,
      fullName: fullName.trim(),
      birthDate: birthDate.trim() || undefined,
      isBirthApproximate,
      deathDate: deathDate.trim() || undefined,
      isDeathApproximate,
      photoUrl,
      gender,
      notes: notes.trim() || undefined,
    });
  };

  // Add Parent action
  const handleConfirmAddParent = () => {
    let parentId = selectedExistingPersonId;
    const isNew = !parentId && newPersonName.trim().length > 0;

    if (isNew) {
      parentId = `person-${Date.now()}`;
    }

    if (!parentId) return;

    if (!isNew) {
      const check = canAddParent(treeData, person.id, parentId);
      if (!check.canAdd) {
        alert(check.reason);
        return;
      }
      onAddRelationship({
        type: 'parent-child',
        person1Id: parentId,
        person2Id: person.id,
        subType,
      });
    } else {
      const newPerson: Person = {
        id: parentId,
        fullName: newPersonName.trim(),
      };
      onAddPersonWithRelationship(newPerson, {
        type: 'parent-child',
        person1Id: parentId,
        person2Id: person.id,
        subType,
      });
    }

    setIsAddingParent(false);
    setSelectedExistingPersonId('');
    setNewPersonName('');
  };

  // Add Spouse action
  const handleConfirmAddSpouse = () => {
    let spouseId = selectedExistingPersonId;
    const isNew = !spouseId && newPersonName.trim().length > 0;

    if (isNew) {
      spouseId = `person-${Date.now()}`;
    }

    if (!spouseId) return;

    if (!isNew) {
      const check = canAddSpouse(treeData, person.id, spouseId);
      if (!check.canAdd) {
        alert(check.reason);
        return;
      }
      if (onAddSpouseWithSharing) {
        onAddSpouseWithSharing(person.id, spouseId, {
          adoptPerson1Children: adoptMyChildren,
          adoptPerson2Children: adoptSpouseChildren,
        });
      } else {
        onAddRelationship({
          type: 'spouse',
          person1Id: person.id,
          person2Id: spouseId,
        });
        if (adoptMyChildren || adoptSpouseChildren) {
          onShareChildren(person.id, spouseId);
        }
      }
    } else {
      const newPerson: Person = {
        id: spouseId,
        fullName: newPersonName.trim(),
      };
      if (onAddSpouseWithSharing) {
        onAddSpouseWithSharing(person.id, spouseId, {
          newPerson,
          adoptPerson1Children: adoptMyChildren,
          adoptPerson2Children: false,
        });
      } else {
        onAddPersonWithRelationship(newPerson, {
          type: 'spouse',
          person1Id: person.id,
          person2Id: spouseId,
        });
        if (adoptMyChildren && children.length > 0) {
          onShareChildren(person.id, spouseId);
        }
      }
    }

    setIsAddingSpouse(false);
    setSelectedExistingPersonId('');
    setNewPersonName('');
  };

  // Add Child action
  const handleConfirmAddChild = () => {
    let childId = selectedExistingPersonId;
    const isNew = !childId && newPersonName.trim().length > 0;

    if (isNew) {
      childId = `person-${Date.now()}`;
    }

    if (!childId) return;

    const relData: Omit<Relationship, 'id'> = {
      type: 'parent-child',
      person1Id: person.id,
      person2Id: childId,
      subType,
      coparentId: selectedCoparentId || undefined,
    };

    let additionalRel: Omit<Relationship, 'id'> | undefined = undefined;
    if (selectedCoparentId && selectedCoparentId !== person.id) {
      additionalRel = {
        type: 'parent-child',
        person1Id: selectedCoparentId,
        person2Id: childId,
        subType,
        coparentId: person.id,
      };
    }

    if (!isNew) {
      const check = canAddChild(treeData, person.id, childId);
      if (!check.canAdd) {
        alert(check.reason);
        return;
      }
      onAddRelationship(relData);
      if (additionalRel) {
        onAddRelationship(additionalRel);
      }
    } else {
      const newPerson: Person = {
        id: childId,
        fullName: newPersonName.trim(),
      };
      onAddPersonWithRelationship(newPerson, relData, additionalRel);
    }

    setIsAddingChild(false);
    setSelectedExistingPersonId('');
    setNewPersonName('');
    setSelectedCoparentId('');
  };

  const deletionImpact = getDeletionImpact(treeData, person.id);

  return (
    <div
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-40 bg-stone-900/40 backdrop-blur-xs flex justify-end cursor-pointer"
    >
      {/* Sliding Drawer */}
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col overflow-hidden border-r border-stone-200 animate-in slide-in-from-left duration-200 cursor-default"
      >
        {/* Header */}
        <div className="p-3.5 sm:p-4 border-b border-stone-200 flex items-center justify-between bg-stone-50 shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-hebrew-serif font-bold text-base sm:text-lg text-stone-900">
              פרטי בן/בת משפחה
            </span>
            {isReadOnly && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  צפייה בלבד
                </span>
                {onPromptUnlock && (
                  <button
                    type="button"
                    onClick={onPromptUnlock}
                    className="text-xs text-amber-900 bg-white hover:bg-amber-100 px-2 py-0.5 rounded border border-amber-300 flex items-center gap-1 font-medium transition-colors shadow-2xs"
                    title="פתח לעריכה באמצעות סיסמה"
                  >
                    <Unlock className="w-3 h-3 text-amber-700" />
                    <span>פתח לעריכה</span>
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {!isReadOnly && (
              <button
                type="button"
                onClick={handleSave}
                className="px-3 py-1.5 text-xs font-semibold bg-stone-900 hover:bg-stone-800 text-white rounded-lg transition-colors shadow-xs"
              >
                שמור
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-200 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-6 pb-12 sm:pb-6">
          <form onSubmit={handleSave} className="space-y-5">
            {/* Photo Avatar & Upload */}
            <div className="flex items-center gap-4">
              <div className="relative w-20 h-20 rounded-2xl bg-stone-100 border border-stone-200 overflow-hidden shrink-0 flex items-center justify-center group shadow-xs">
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt={fullName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-10 h-10 text-stone-300" />
                )}

                {!isReadOnly && (
                  <label
                    htmlFor="photo-upload"
                    className="absolute inset-0 bg-stone-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity text-white"
                  >
                    {isUploadingPhoto ? (
                      <RefreshCw className="w-5 h-5 animate-spin text-amber-200" />
                    ) : (
                      <Camera className="w-5 h-5" />
                    )}
                  </label>
                )}
              </div>

              {!isReadOnly && (
                <div className="flex flex-col gap-1.5">
                  <input
                    ref={fileInputRef}
                    id="photo-upload"
                    type="file"
                    accept="image/*"
                    onClick={e => {
                      (e.target as HTMLInputElement).value = '';
                    }}
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={isUploadingPhoto}
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 text-xs font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 disabled:opacity-50 rounded-lg transition-colors text-right flex items-center gap-1.5 cursor-pointer"
                  >
                    {isUploadingPhoto ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-700 shrink-0" />
                        <span>מעבד תמונה...</span>
                      </>
                    ) : (
                      <span>{photoUrl ? 'החלף תמונה' : 'העלה תמונה'}</span>
                    )}
                  </button>
                  {photoUrl && (
                    <button
                      type="button"
                      disabled={isUploadingPhoto}
                      onClick={() => setPhotoUrl(undefined)}
                      className="px-3 py-1 text-xs text-rose-600 hover:text-rose-700 transition-colors text-right flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      הסר תמונה
                    </button>
                  )}
                  {photoError && (
                    <div className="text-[11px] text-rose-600 font-medium mt-0.5 max-w-[220px]">
                      {photoError}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Full Name & Gender Row */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="block text-xs font-medium text-stone-700">
                  שם מלא <span className="text-rose-500">*</span>
                </label>
                <span className="text-[11px] font-medium text-stone-500">מין בן המשפחה:</span>
              </div>
              <div className="flex items-center gap-2 sm:gap-2.5">
                <input
                  type="text"
                  required
                  disabled={isReadOnly}
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="לדוגמה: ישראל יהודה"
                  className="flex-1 min-w-0 px-3 py-2 text-base sm:text-sm bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-400 focus:outline-none placeholder:text-stone-300/60 disabled:bg-stone-100"
                />

                {/* Gender Checkboxes */}
                <div className="flex items-center gap-1.5 shrink-0 select-none">
                  {/* Male Checkbox */}
                  <label
                    title="גבר (מסגרת כחולה)"
                    className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                      gender === 'male'
                        ? 'bg-blue-50 text-blue-800 border-blue-400 shadow-2xs font-semibold'
                        : 'bg-white text-stone-600 border-stone-300 hover:bg-stone-50'
                    } ${isReadOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <input
                      type="checkbox"
                      disabled={isReadOnly}
                      checked={gender === 'male'}
                      onChange={() => {
                        if (isReadOnly) return;
                        setGender(prev => (prev === 'male' ? undefined : 'male'));
                      }}
                      className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600"
                    />
                    <span>גבר</span>
                  </label>

                  {/* Female Checkbox */}
                  <label
                    title="אישה (מסגרת ורודה)"
                    className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                      gender === 'female'
                        ? 'bg-rose-50 text-rose-800 border-rose-400 shadow-2xs font-semibold'
                        : 'bg-white text-stone-600 border-stone-300 hover:bg-stone-50'
                    } ${isReadOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <input
                      type="checkbox"
                      disabled={isReadOnly}
                      checked={gender === 'female'}
                      onChange={() => {
                        if (isReadOnly) return;
                        setGender(prev => (prev === 'female' ? undefined : 'female'));
                      }}
                      className="w-3.5 h-3.5 rounded text-rose-600 focus:ring-rose-500 cursor-pointer accent-rose-500"
                    />
                    <span>אישה</span>
                  </label>
                </div>
              </div>
              {duplicateNames.length > 0 && (
                <div className="mt-1.5 text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-200 flex items-start gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    שים לב: קיים כבר אדם בעץ עם השם הזה ({duplicateNames.map(d => d.fullName).join(', ')}). המערכת מאפשרת שמות זהים, אך ודא שאין מדובר בכפילות.
                  </span>
                </div>
              )}
            </div>

            {/* Dates Row: Birth and Death */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Birth Date */}
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  תאריך לידה (שנה, חודש-שנה או מלא)
                </label>
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={birthDate}
                  onChange={e => setBirthDate(e.target.value)}
                  placeholder="1932 או 1932-05 או 1932-05-14"
                  className="w-full px-3 py-2 text-base sm:text-sm bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-400 focus:outline-none font-mono placeholder:text-stone-300/60 disabled:bg-stone-100"
                />
                <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer text-xs text-stone-600">
                  <input
                    type="checkbox"
                    disabled={isReadOnly}
                    checked={isBirthApproximate}
                    onChange={e => setIsBirthApproximate(e.target.checked)}
                    className="rounded border-stone-300 text-stone-800 focus:ring-stone-400"
                  />
                  <span>תאריך משוער (כ־)</span>
                </label>
              </div>

              {/* Death Date */}
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  תאריך פטירה (אם רלוונטי)
                </label>
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={deathDate}
                  onChange={e => setDeathDate(e.target.value)}
                  placeholder="1998 או 1998-11"
                  className="w-full px-3 py-2 text-base sm:text-sm bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-400 focus:outline-none font-mono placeholder:text-stone-300/60 disabled:bg-stone-100"
                />
                <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer text-xs text-stone-600">
                  <input
                    type="checkbox"
                    disabled={isReadOnly}
                    checked={isDeathApproximate}
                    onChange={e => setIsDeathApproximate(e.target.checked)}
                    className="rounded border-stone-300 text-stone-800 focus:ring-stone-400"
                  />
                  <span>תאריך משוער (כ־)</span>
                </label>
              </div>
            </div>

            {/* Date Validation Error Warning */}
            {!dateValidation.isValid && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{dateValidation.warning}</span>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                הערות ופרטים נוספים
              </label>
              <textarea
                disabled={isReadOnly}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="מידע ביוגרפי, עיסוק, מקום לידה ועוד..."
                className="w-full px-3 py-2 text-base sm:text-sm bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-400 focus:outline-none placeholder:text-stone-300/60 disabled:bg-stone-100 resize-none"
              />
            </div>

            {/* Save Button */}
            {!isReadOnly && (
              <button
                type="submit"
                className="w-full py-2 px-4 bg-stone-900 hover:bg-stone-800 text-white text-xs font-medium rounded-lg transition-colors shadow-xs"
              >
                שמור שינויים בפרטים
              </button>
            )}
          </form>

          <hr className="border-stone-200" />

          {/* Relationships Section */}
          <div className="space-y-4">
            <h3 className="font-hebrew-serif font-bold text-base text-stone-900">
              קשרי משפחה
            </h3>

            {/* 1. Parents List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-stone-600 font-medium">
                <span>הורים ({parents.length})</span>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingParent(true);
                      setIsAddingSpouse(false);
                      setIsAddingChild(false);
                    }}
                    className="text-stone-900 hover:underline flex items-center gap-1"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>הוסף הורה</span>
                  </button>
                )}
              </div>

              {parents.length === 0 ? (
                <div className="text-xs text-stone-400 p-2.5 bg-stone-50 rounded-lg border border-stone-100">
                  לא הוגדרו הורים
                </div>
              ) : (
                <div className="space-y-1.5">
                  {parents.map(({ person: p, relationship: rel }) => (
                    <div
                      key={rel.id}
                      className="p-2.5 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg flex items-center justify-between text-xs transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => onSelectPerson(p.id)}
                        className="font-medium text-stone-900 hover:underline flex items-center gap-1.5 text-right"
                      >
                        <User className="w-3.5 h-3.5 text-stone-400" />
                        <span>{p.fullName}</span>
                        {rel.subType === 'adoptive' && (
                          <span className="text-[10px] text-stone-500">(מאמץ)</span>
                        )}
                      </button>

                      {!isReadOnly && (
                        <button
                          type="button"
                          onClick={() => onRemoveRelationship(rel.id)}
                          title="הסר קשר הורה בלבד (האדם יישאר בעץ)"
                          className="text-stone-400 hover:text-rose-600 p-1"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 2. Spouses List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-stone-600 font-medium">
                <span>בני / בנות זוג ({spouses.length})</span>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingSpouse(true);
                      setIsAddingParent(false);
                      setIsAddingChild(false);
                    }}
                    className="text-stone-900 hover:underline flex items-center gap-1"
                  >
                    <Heart className="w-3.5 h-3.5" />
                    <span>הוסף בן/בת זוג</span>
                  </button>
                )}
              </div>

              {spouses.length === 0 ? (
                <div className="text-xs text-stone-400 p-2.5 bg-stone-50 rounded-lg border border-stone-100">
                  לא הוגדרו בני זוג
                </div>
              ) : (
                <div className="space-y-2">
                  {spouses.map(({ person: sp, relationship: rel }) => {
                    const unsharedFromPerson = getUnsharedChildren(treeData, person.id, sp.id);
                    const unsharedFromSpouse = getUnsharedChildren(treeData, sp.id, person.id);
                    const totalUnsharedCount = unsharedFromPerson.length + unsharedFromSpouse.length;
                    const sharedChildren = getChildren(treeData, person.id).filter(c =>
                      getChildren(treeData, sp.id).some(sc => sc.person.id === c.person.id)
                    );

                    return (
                      <div
                        key={rel.id}
                        className="p-2.5 bg-stone-50 hover:bg-stone-100/80 border border-stone-200 rounded-lg space-y-2 text-xs transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => onSelectPerson(sp.id)}
                            className="font-medium text-stone-900 hover:underline flex items-center gap-1.5 text-right"
                          >
                            <Heart className="w-3.5 h-3.5 text-rose-500" />
                            <span className="font-semibold">{sp.fullName}</span>
                            {sp.birthDate && (
                              <span className="text-[11px] text-stone-400 font-mono">
                                ({sp.birthDate.slice(0, 4)})
                              </span>
                            )}
                          </button>

                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() => onRemoveRelationship(rel.id)}
                              title="הסר קשר נישואין בלבד"
                              className="text-stone-400 hover:text-rose-600 p-1 rounded hover:bg-stone-200 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Unshared children alert and one-click auto-adoption button */}
                        {!isReadOnly && totalUnsharedCount > 0 && (
                          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-md text-[11px] text-amber-950 space-y-1.5">
                            <div className="font-semibold flex items-center gap-1.5 text-amber-900">
                              <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span>נמצאו ילדים שאינם רשומים כמשותפים לשני בני הזוג:</span>
                            </div>
                            <div className="text-stone-700 space-y-0.5 pr-2 font-medium">
                              {unsharedFromSpouse.length > 0 && (
                                <div>
                                  • {unsharedFromSpouse.length} ילדים של {sp.fullName} (
                                  {unsharedFromSpouse.map(c => c.fullName).join(', ')})
                                </div>
                              )}
                              {unsharedFromPerson.length > 0 && (
                                <div>
                                  • {unsharedFromPerson.length} ילדים של {person.fullName} (
                                  {unsharedFromPerson.map(c => c.fullName).join(', ')})
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => onShareChildren(person.id, sp.id)}
                              className="w-full mt-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium text-xs flex items-center justify-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                            >
                              <Users className="w-3.5 h-3.5" />
                              <span>אימוץ / שיוך אוטומטי של כל הילדים כילדים משותפים</span>
                            </button>
                          </div>
                        )}

                        {/* Status if all existing children are shared */}
                        {totalUnsharedCount === 0 && sharedChildren.length > 0 && (
                          <div className="text-[11px] text-emerald-700 flex items-center gap-1 pr-1 font-medium">
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span>כל הילדים ({sharedChildren.length}) רשומים כילדים משותפים של שני בני הזוג</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3. Children List with Reorder Controls */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-stone-600 font-medium">
                <span>ילדים ({children.length})</span>
                <div className="flex items-center gap-2">
                  {!isReadOnly && children.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onSortChildrenByAge(person.id)}
                      title="סדר ילדים לפי שנת לידה"
                      className="text-stone-600 hover:text-stone-900 flex items-center gap-1 text-[11px]"
                    >
                      <ArrowUpDown className="w-3 h-3" />
                      <span>מיין לפי גיל</span>
                    </button>
                  )}
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingChild(true);
                        setIsAddingParent(false);
                        setIsAddingSpouse(false);
                      }}
                      className="text-stone-900 hover:underline flex items-center gap-1"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>הוסף ילד/ה</span>
                    </button>
                  )}
                </div>
              </div>

              {children.length === 0 ? (
                <div className="text-xs text-stone-400 p-2.5 bg-stone-50 rounded-lg border border-stone-100">
                  לא הוגדרו ילדים
                </div>
              ) : (
                <div className="space-y-1.5">
                  {children.map(({ person: ch, relationship: rel }, idx) => (
                    <div
                      key={rel.id}
                      className="p-2 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg flex items-center justify-between text-xs transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => onSelectPerson(ch.id)}
                        className="font-medium text-stone-900 hover:underline flex items-center gap-1.5 text-right flex-1 truncate"
                      >
                        <User className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                        <span className="truncate">{ch.fullName}</span>
                        {ch.birthDate && (
                          <span className="text-[11px] text-stone-400 font-mono shrink-0">
                            ({ch.birthDate.slice(0, 4)})
                          </span>
                        )}
                      </button>

                      {!isReadOnly && (
                        <div className="flex items-center gap-1 shrink-0 mr-2">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => onReorderChild(ch.id, person.id, 'up')}
                            title="הזז למעלה / ימינה בסדר הילדים"
                            className="p-1 text-stone-400 hover:text-stone-700 disabled:opacity-20"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            disabled={idx === children.length - 1}
                            onClick={() => onReorderChild(ch.id, person.id, 'down')}
                            title="הזז למטה / שמאלה בסדר הילדים"
                            className="p-1 text-stone-400 hover:text-stone-700 disabled:opacity-20"
                          >
                            ▼
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveRelationship(rel.id)}
                            title="הסר קשר הורה-ילד (הילד יישאר בעץ)"
                            className="text-stone-400 hover:text-rose-600 p-1"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add Parent / Spouse / Child Panel Dialog */}
            {(isAddingParent || isAddingSpouse || isAddingChild) && (
              <div className="p-4 bg-stone-100 border border-stone-300 rounded-xl space-y-3 mt-4">
                <div className="flex items-center justify-between text-xs font-bold text-stone-900">
                  <span>
                    {isAddingParent && 'הוספת הורה'}
                    {isAddingSpouse && 'הוספת בן/בת זוג'}
                    {isAddingChild && 'הוספת ילד/ה'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingParent(false);
                      setIsAddingSpouse(false);
                      setIsAddingChild(false);
                    }}
                    className="text-stone-400 hover:text-stone-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Option 1: Create New Person */}
                <div>
                  <label className="block text-[11px] font-medium text-stone-600 mb-1">
                    שם האדם החדש:
                  </label>
                  <input
                    type="text"
                    value={newPersonName}
                    onChange={e => {
                      setNewPersonName(e.target.value);
                      if (e.target.value) setSelectedExistingPersonId('');
                    }}
                    placeholder="הזן שם מלא..."
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-400 placeholder:text-stone-300/60"
                  />
                </div>

                <div className="text-center text-[10px] text-stone-400 font-bold">או בחר אדם שכבר קיים בעץ:</div>

                {/* Option 2: Connect existing person */}
                <div>
                  <select
                    value={selectedExistingPersonId}
                    onChange={e => {
                      setSelectedExistingPersonId(e.target.value);
                      if (e.target.value) setNewPersonName('');
                    }}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded-lg focus:outline-none"
                  >
                    <option value="">-- בחר אדם קיים מהרשימה --</option>
                    {Object.values(treeData.persons)
                      .filter(p => p.id !== person.id)
                      .map(p => (
                        <option key={p.id} value={p.id}>
                          {p.fullName} {p.birthDate ? `(${p.birthDate.slice(0, 4)})` : ''}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Parent / Child Specific Options: Biological / Adoptive */}
                {(isAddingParent || isAddingChild) && (
                  <div className="flex items-center gap-4 text-xs text-stone-700">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="subtype"
                        checked={subType === 'biological'}
                        onChange={() => setSubType('biological')}
                      />
                      <span>ביולוגי</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="subtype"
                        checked={subType === 'adoptive'}
                        onChange={() => setSubType('adoptive')}
                      />
                      <span>מאמץ / מאומץ</span>
                    </label>
                  </div>
                )}

                {/* Child Specific: Co-parent selection if spouses exist */}
                {isAddingChild && spouses.length > 0 && (
                  <div>
                    <label className="block text-[11px] font-medium text-stone-600 mb-1">
                      הורה נוסף מזוגיות:
                    </label>
                    <select
                      value={selectedCoparentId}
                      onChange={e => setSelectedCoparentId(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded-lg"
                    >
                      <option value="">(ללא ציון הורה נוסף)</option>
                      {spouses.map(({ person: sp }) => (
                        <option key={sp.id} value={sp.id}>
                          {sp.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Spouse Specific: Auto-adopt / Share Children Options */}
                {isAddingSpouse && (
                  <div className="space-y-2 pt-2 border-t border-stone-200">
                    {/* If selected existing spouse has children */}
                    {selectedExistingPersonId && (() => {
                      const selectedSpouse = treeData.persons[selectedExistingPersonId];
                      const selectedSpouseChildren = getChildren(treeData, selectedExistingPersonId);
                      if (!selectedSpouse || selectedSpouseChildren.length === 0) return null;

                      return (
                        <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs space-y-2">
                          <div className="flex items-center gap-1.5 font-bold text-amber-950">
                            <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>
                              נמצאו {selectedSpouseChildren.length} ילדים רשומים תחת {selectedSpouse.fullName}:
                            </span>
                          </div>
                          <div className="text-[11px] text-stone-700 bg-white/90 p-2 rounded border border-amber-200 font-medium">
                            {selectedSpouseChildren.map(c => c.person.fullName).join(', ')}
                          </div>
                          <label className="flex items-start gap-2 cursor-pointer font-medium text-amber-950 select-none">
                            <input
                              type="checkbox"
                              checked={adoptSpouseChildren}
                              onChange={e => setAdoptSpouseChildren(e.target.checked)}
                              className="mt-0.5 rounded text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                            />
                            <span>
                              אימוץ אוטומטי: שייך את כל הילדים הרשומים תחת {selectedSpouse.fullName} כילדים משותפים לשני בני הזוג
                            </span>
                          </label>
                        </div>
                      );
                    })()}

                    {/* If current person has children */}
                    {children.length > 0 && (
                      <div className="p-3 bg-stone-50 border border-stone-200 rounded-lg text-xs space-y-2">
                        <div className="flex items-center gap-1.5 font-bold text-stone-900">
                          <Users className="w-4 h-4 text-stone-600 shrink-0" />
                          <span>
                            ל־{person.fullName} יש {children.length} ילדים רשומים בעץ:
                          </span>
                        </div>
                        <div className="text-[11px] text-stone-700 bg-white p-2 rounded border border-stone-200 font-medium">
                          {children.map(c => c.person.fullName).join(', ')}
                        </div>
                        <label className="flex items-start gap-2 cursor-pointer font-medium text-stone-900 select-none">
                          <input
                            type="checkbox"
                            checked={adoptMyChildren}
                            onChange={e => setAdoptMyChildren(e.target.checked)}
                            className="mt-0.5 rounded text-stone-800 focus:ring-stone-500 w-4 h-4 cursor-pointer"
                          />
                          <span>
                            אימוץ אוטומטי: שייך את כל הילדים של {person.fullName} כמשותפים גם עם{' '}
                            {selectedExistingPersonId
                              ? treeData.persons[selectedExistingPersonId]?.fullName || 'בן/בת הזוג'
                              : newPersonName.trim()
                              ? newPersonName.trim()
                              : 'בן/בת הזוג החדש/ה'}
                          </span>
                        </label>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingParent(false);
                      setIsAddingSpouse(false);
                      setIsAddingChild(false);
                    }}
                    className="px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-200 rounded-lg"
                  >
                    ביטול
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (isAddingParent) handleConfirmAddParent();
                      if (isAddingSpouse) handleConfirmAddSpouse();
                      if (isAddingChild) handleConfirmAddChild();
                    }}
                    disabled={!newPersonName.trim() && !selectedExistingPersonId}
                    className="px-4 py-1.5 text-xs font-medium bg-stone-900 hover:bg-stone-800 disabled:opacity-40 text-white rounded-lg transition-colors"
                  >
                    הוסף קשר
                  </button>
                </div>
              </div>
            )}
          </div>

          <hr className="border-stone-200" />

          {/* Delete Person Action */}
          {!isReadOnly && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full py-2.5 px-3 border border-rose-200 text-rose-700 hover:bg-rose-50 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>מחק אדם זה מהעץ...</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal for Deletion with Impact Report */}
      {showDeleteConfirm && deletionImpact && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <ShieldAlert className="w-6 h-6 shrink-0" />
              <h3 className="font-hebrew-serif font-bold text-lg text-stone-900">
                מחיקת {deletionImpact.person.fullName}
              </h3>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              מחיקת אדם תסיר אותו לצמיתות מהמערכת יחד עם הקשרים הישירים שלו.
              <strong> שימו לב: צאצאיו וילדיו לא יימחקו מהעץ!</strong> הם יישארו כענף עצמאי.
            </p>

            <div className="p-3 bg-stone-50 rounded-lg text-xs space-y-1.5 border border-stone-200">
              <div className="font-medium text-stone-800">הקשרים שיוסרו:</div>
              <ul className="list-disc list-inside text-stone-600 space-y-0.5">
                <li>{deletionImpact.parentRelationsCount} קשרי הורים</li>
                <li>{deletionImpact.spouseRelationsCount} קשרי בני/בנות זוג</li>
                <li>
                  {deletionImpact.childRelationsCount} קשרי ילדים
                  {deletionImpact.childrenNames.length > 0 && (
                    <span> ({deletionImpact.childrenNames.join(', ')})</span>
                  )}
                </li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-xs text-stone-600 hover:bg-stone-100 rounded-lg"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeletePerson(person.id);
                  setShowDeleteConfirm(false);
                  onClose();
                }}
                className="px-4 py-2 text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-xs"
              >
                אשר מחיקה
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
