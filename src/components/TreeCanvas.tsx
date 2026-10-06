import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  FolderMinus,
  FolderPlus,
  UserPlus,
  Upload,
  User,
  Heart,
  ChevronDown,
  ChevronUp,
  Sparkles,
  GitBranch,
  Layers,
  LayoutGrid,
  RefreshCw
} from 'lucide-react';
import { TreeLayout, LayoutNode, LayoutConnector, ViewType, FamilyTreeData } from '../types/family';
import { formatDisplayDate } from '../utils/familyGraph';

interface TreeCanvasProps {
  layout: TreeLayout;
  viewType: ViewType;
  selectedPersonId: string | null;
  fitTrigger?: number;
  onSelectPerson: (personId: string) => void;
  onQuickAddChild: (parentId: string) => void;
  onQuickAddSpouse: (personId: string) => void;
  onToggleCollapse: (personId: string) => void;
  onExpandAll: () => void;
  onCollapseBranches: () => void;
  onAddFirstPerson: () => void;
  onOpenImport: () => void;
  onLoadSampleTree: () => void;
  onRefreshFromServer?: () => void;
  onViewChange: (view: ViewType) => void;
  canvasRefCallback?: (ref: HTMLDivElement | null) => void;
}

export const TreeCanvas: React.FC<TreeCanvasProps> = ({
  layout,
  viewType,
  selectedPersonId,
  fitTrigger,
  onSelectPerson,
  onQuickAddChild,
  onQuickAddSpouse,
  onToggleCollapse,
  onExpandAll,
  onCollapseBranches,
  onAddFirstPerson,
  onOpenImport,
  onLoadSampleTree,
  onRefreshFromServer,
  onViewChange,
  canvasRefCallback,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isSmoothTransition, setIsSmoothTransition] = useState(false);

  // Synchronous refs to prevent stale closure bugs in high-frequency events (wheel, touch, pan)
  const scaleRef = useRef(1);
  const posRef = useRef({ x: 0, y: 0 });
  const hasMovedRef = useRef(false);
  const hasFittedInitialRef = useRef(false);

  // Sync refs whenever state updates
  useEffect(() => {
    scaleRef.current = scale;
    posRef.current = position;
  }, [scale, position]);

  // Set external canvas ref if provided
  useEffect(() => {
    if (canvasRefCallback) {
      canvasRefCallback(containerRef.current);
    }
  }, [canvasRefCallback]);

  // Mathematical zoom around a specific screen coordinate (screenX, screenY)
  // Guarantees that the world point under the cursor/touch stays EXACTLY stationary
  const zoomAtPoint = useCallback((screenX: number, screenY: number, factor: number) => {
    setIsSmoothTransition(false);
    const curScale = scaleRef.current;
    const curPos = posRef.current;

    const newScale = Math.min(Math.max(curScale * factor, 0.1), 3.0);
    if (Math.abs(newScale - curScale) < 0.0001) return;

    // World point under (screenX, screenY): worldX = (screenX - curPos.x) / curScale
    // After zoom: screenX = newPos.x + worldX * newScale
    // => newPos.x = screenX - (screenX - curPos.x) * (newScale / curScale)
    const newX = screenX - (screenX - curPos.x) * (newScale / curScale);
    const newY = screenY - (screenY - curPos.y) * (newScale / curScale);

    scaleRef.current = newScale;
    posRef.current = { x: newX, y: newY };
    setScale(newScale);
    setPosition({ x: newX, y: newY });
  }, []);

  // Fit tree to container, accurately centered on the bounding box of the tree nodes
  const fitToScreen = useCallback((smooth = false) => {
    if (!containerRef.current || layout.nodes.length === 0) return;

    const container = containerRef.current;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (cw <= 0 || ch <= 0) return;

    // Calculate exact bounding box directly from actual layout nodes
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const node of layout.nodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    }

    if (minX === Infinity || maxX === -Infinity) return;

    const tw = maxX - minX;
    const th = maxY - minY;
    if (tw <= 0 || th <= 0) return;

    // Margins around tree so nodes don't touch screen edges
    const padX = Math.max(cw * 0.07, 44);
    const padY = Math.max(ch * 0.07, 44);

    const scaleX = (cw - padX * 2) / tw;
    const scaleY = (ch - padY * 2) / th;

    const fitScale = Math.min(scaleX, scaleY);
    const newScale = Math.min(Math.max(fitScale, 0.15), 1.0);

    // Exact geometric center of the tree
    const treeCenterX = minX + tw / 2;
    const treeCenterY = minY + th / 2;

    const centerX = cw / 2 - treeCenterX * newScale;
    const centerY = ch / 2 - treeCenterY * newScale;

    if (smooth) {
      setIsSmoothTransition(true);
      setTimeout(() => setIsSmoothTransition(false), 320);
    } else {
      setIsSmoothTransition(false);
    }

    scaleRef.current = newScale;
    posRef.current = { x: centerX, y: centerY };
    setScale(newScale);
    setPosition({ x: centerX, y: centerY });
  }, [layout.nodes]);

  // Center tree on initial load and whenever fitTrigger changes
  useEffect(() => {
    if (!containerRef.current || layout.nodes.length === 0) return;

    const timer = setTimeout(() => {
      fitToScreen(false);
      hasFittedInitialRef.current = true;
    }, 40);

    return () => clearTimeout(timer);
  }, [layout.nodes.length, fitTrigger, fitToScreen]);

  // Re-fit when view type changes
  useEffect(() => {
    const timer = setTimeout(() => {
      fitToScreen(false);
    }, 40);
    return () => clearTimeout(timer);
  }, [viewType, fitToScreen]);

  // ResizeObserver to ensure fit once container layout is resolved
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          if (!hasFittedInitialRef.current && layout.nodes.length > 0) {
            fitToScreen(false);
            hasFittedInitialRef.current = true;
          }
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [layout.nodes.length, fitToScreen]);

  // Center on selected person if requested
  useEffect(() => {
    if (!selectedPersonId || !containerRef.current) return;
    const targetNode = layout.nodes.find(n => n.id === selectedPersonId);
    if (!targetNode) return;

    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;

    const targetX = targetNode.x + targetNode.width / 2;
    const targetY = targetNode.y + targetNode.height / 2;

    const curScale = scaleRef.current;
    const targetPos = {
      x: cw / 2 - targetX * curScale,
      y: ch / 2 - targetY * curScale,
    };

    setIsSmoothTransition(true);
    setTimeout(() => setIsSmoothTransition(false), 320);

    posRef.current = targetPos;
    setPosition(targetPos);
  }, [selectedPersonId, layout.nodes]);

  // Non-passive wheel listener attached directly to container to prevent browser scroll/pinch
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Exponential zoom based on deltaY for smooth tracking across all input devices
      const zoomSensitivity = 0.0016;
      const factor = Math.exp(-e.deltaY * zoomSensitivity);
      const clampedFactor = Math.min(Math.max(factor, 0.84), 1.18);

      zoomAtPoint(mouseX, mouseY, clampedFactor);
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', onWheel);
    };
  }, [zoomAtPoint]);

  // Mouse Pan Handlers
  const dragStartRef = useRef<{ x: number; y: number; initialPos: { x: number; y: number } } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    if ((e.target as HTMLElement).closest('button')) return;

    setIsSmoothTransition(false);
    setIsDragging(true);
    hasMovedRef.current = false;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      initialPos: { ...posRef.current },
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.hypot(dx, dy) > 5) {
      hasMovedRef.current = true;
    }
    const newPos = {
      x: dragStartRef.current.initialPos.x + dx,
      y: dragStartRef.current.initialPos.y + dy,
    };
    posRef.current = newPos;
    setPosition(newPos);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
    setTimeout(() => {
      hasMovedRef.current = false;
    }, 150);
  };

  // Touch Support (pan and pinch-to-zoom centered on gesture)
  const touchStateRef = useRef<{
    mode: 'pan' | 'pinch';
    startX: number;
    startY: number;
    initialPos: { x: number; y: number };
    initialScale: number;
    initialDist: number;
    initialWorldMidX: number;
    initialWorldMidY: number;
  } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!containerRef.current) return;
    setIsSmoothTransition(false);
    const rect = containerRef.current.getBoundingClientRect();

    if (e.touches.length === 1) {
      const t = e.touches[0];
      touchStateRef.current = {
        mode: 'pan',
        startX: t.clientX,
        startY: t.clientY,
        initialPos: { ...posRef.current },
        initialScale: scaleRef.current,
        initialDist: 0,
        initialWorldMidX: 0,
        initialWorldMidY: 0,
      };
      hasMovedRef.current = false;
      setIsDragging(true);
    } else if (e.touches.length === 2) {
      setIsDragging(false);
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      const midX = (t0.clientX + t1.clientX) / 2 - rect.left;
      const midY = (t0.clientY + t1.clientY) / 2 - rect.top;

      const curScale = scaleRef.current;
      const curPos = posRef.current;
      const worldMidX = (midX - curPos.x) / curScale;
      const worldMidY = (midY - curPos.y) / curScale;

      touchStateRef.current = {
        mode: 'pinch',
        startX: midX,
        startY: midY,
        initialPos: { ...curPos },
        initialScale: curScale,
        initialDist: Math.max(dist, 10),
        initialWorldMidX: worldMidX,
        initialWorldMidY: worldMidY,
      };
      hasMovedRef.current = true;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!containerRef.current || !touchStateRef.current) return;
    const state = touchStateRef.current;
    const rect = containerRef.current.getBoundingClientRect();

    if (e.touches.length === 1 && state.mode === 'pan') {
      const t = e.touches[0];
      const dx = t.clientX - state.startX;
      const dy = t.clientY - state.startY;
      if (Math.hypot(dx, dy) > 8) {
        hasMovedRef.current = true;
      }
      const newPos = {
        x: state.initialPos.x + dx,
        y: state.initialPos.y + dy,
      };
      posRef.current = newPos;
      setPosition(newPos);
    } else if (e.touches.length === 2) {
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      const currentMidX = (t0.clientX + t1.clientX) / 2 - rect.left;
      const currentMidY = (t0.clientY + t1.clientY) / 2 - rect.top;

      if (state.mode !== 'pinch') {
        const curScale = scaleRef.current;
        const curPos = posRef.current;
        touchStateRef.current = {
          mode: 'pinch',
          startX: currentMidX,
          startY: currentMidY,
          initialPos: { ...curPos },
          initialScale: curScale,
          initialDist: Math.max(dist, 10),
          initialWorldMidX: (currentMidX - curPos.x) / curScale,
          initialWorldMidY: (currentMidY - curPos.y) / curScale,
        };
        hasMovedRef.current = true;
        return;
      }

      const scaleFactor = dist / state.initialDist;
      const newScale = Math.min(Math.max(state.initialScale * scaleFactor, 0.1), 3.0);

      // Keep world midpoint locked under current touch midpoint
      const newPosX = currentMidX - state.initialWorldMidX * newScale;
      const newPosY = currentMidY - state.initialWorldMidY * newScale;

      scaleRef.current = newScale;
      posRef.current = { x: newPosX, y: newPosY };
      setScale(newScale);
      setPosition({ x: newPosX, y: newPosY });
      hasMovedRef.current = true;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && containerRef.current) {
      // Transition from pinch to single-finger pan seamlessly
      const t = e.touches[0];
      touchStateRef.current = {
        mode: 'pan',
        startX: t.clientX,
        startY: t.clientY,
        initialPos: { ...posRef.current },
        initialScale: scaleRef.current,
        initialDist: 0,
        initialWorldMidX: 0,
        initialWorldMidY: 0,
      };
      setIsDragging(true);
    } else if (e.touches.length === 0) {
      setIsDragging(false);
      touchStateRef.current = null;
      setTimeout(() => {
        hasMovedRef.current = false;
      }, 150);
    }
  };

  // Zoom button handlers
  const zoomIn = () => {
    if (!containerRef.current) return;
    const cw = containerRef.current.clientWidth / 2;
    const ch = containerRef.current.clientHeight / 2;
    zoomAtPoint(cw, ch, 1.25);
  };

  const zoomOut = () => {
    if (!containerRef.current) return;
    const cw = containerRef.current.clientWidth / 2;
    const ch = containerRef.current.clientHeight / 2;
    zoomAtPoint(cw, ch, 0.8);
  };

  const resetZoom = () => {
    fitToScreen(true);
  };

  return (
    <div
      ref={containerRef}
      dir="ltr"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`relative w-full h-full bg-stone-100 overflow-hidden select-none touch-none cursor-${
        isDragging ? 'grabbing' : 'grab'
      }`}
      style={{ touchAction: 'none' }}
    >
      {/* Background subtle grid pattern */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          backgroundImage: `radial-gradient(#a8a29e 1px, transparent 1px)`,
          backgroundSize: `${30 * scale}px ${30 * scale}px`,
          backgroundPosition: `${position.x}px ${position.y}px`,
        }}
      />

      {/* Empty State */}
      {layout.nodes.length === 0 && (
        <div dir="rtl" className="absolute inset-0 flex items-center justify-center p-6 z-20 pointer-events-auto">
          <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-stone-200 shadow-xl text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-amber-50 text-amber-900 border border-amber-200 flex items-center justify-center font-hebrew-serif text-3xl font-bold">
              י
            </div>
            <h2 className="text-xl font-bold font-hebrew-serif text-stone-900 mb-2">
              ברוכים הבאים לאילן היוחסין של משפחת יהודה
            </h2>
            <p className="text-sm text-stone-600 mb-6 leading-relaxed">
              העץ עדיין ריק. ניתן להתחיל בהזנת האדם הראשון, לייבא עץ קיים מקובץ JSON, או לטעון עץ לדוגמה לצורך בדיקה.
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={onAddFirstPerson}
                className="w-full py-2.5 px-4 bg-stone-900 hover:bg-stone-800 text-white text-sm font-medium rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                <span>הוסף אדם ראשון</span>
              </button>

              <button
                onClick={onOpenImport}
                className="w-full py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-800 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4" />
                <span>ייבוא מקובץ (JSON / SVG)</span>
              </button>

              <button
                onClick={onLoadSampleTree}
                className="w-full py-2 px-4 text-stone-500 hover:text-stone-800 text-xs transition-colors flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>טען עץ בדיקה מרובה דורות וילדים</span>
              </button>

              {onRefreshFromServer && (
                <button
                  onClick={onRefreshFromServer}
                  className="w-full py-2 px-4 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 mt-1"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-amber-700" />
                  <span>בדוק וסנכרן נתונים מהשרת (אם הוזנו במכשיר אחר)</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Pan/Zoom World Container */}
      <div
        id="tree-world-container"
        dir="ltr"
        className={`absolute top-0 left-0 origin-top-left will-change-transform ${
          isSmoothTransition ? 'transition-transform duration-300 ease-out' : ''
        }`}
        style={{
          transformOrigin: '0 0',
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
        }}
      >
        {/* SVG Connector Lines */}
        <svg
          className="absolute top-0 left-0 pointer-events-none overflow-visible"
          style={{
            width: layout.bounds.maxX + 100,
            height: layout.bounds.maxY + 100,
          }}
        >
          {layout.connectors.map(conn => {
            const isCrossBranch = conn.type === 'cross-branch';
            return (
              <g key={conn.id}>
                <path
                  d={conn.path}
                  fill="none"
                  stroke={isCrossBranch ? '#d97706' : '#78716c'}
                  strokeWidth={isCrossBranch ? 2 : 1.75}
                  strokeDasharray={isCrossBranch ? '5,5' : undefined}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {isCrossBranch && (
                  <circle
                    cx={conn.toX}
                    cy={conn.toY}
                    r={3.5}
                    fill="#d97706"
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* Tree Nodes */}
        {layout.nodes.map((node, idx) => {
          const isSelected = selectedPersonId === node.id;
          const { person } = node;

          const handleNodeSelect = (e: React.SyntheticEvent) => {
            e.stopPropagation();
            if (hasMovedRef.current) return;
            onSelectPerson(person.id);
          };

          return (
            <div
              key={node.uniqueKey || `${node.id}-${idx}`}
              onClick={handleNodeSelect}
              dir="rtl"
              style={{
                left: `${node.x}px`,
                top: `${node.y}px`,
                width: `${node.width}px`,
                height: `${node.height}px`,
              }}
              className={`absolute group bg-white rounded-xl transition-all duration-150 cursor-pointer touch-manipulation ${
                isSelected
                  ? 'ring-2 ring-amber-700 shadow-md border-amber-300 z-10'
                  : 'border border-stone-200 hover:border-stone-400 hover:shadow-sm'
              }`}
            >
              {/* Detailed Vertical View Card */}
              {viewType === 'detailed-vertical' && (
                <div className="h-full p-2.5 flex flex-col justify-between">
                  <div className="flex items-center gap-2.5">
                    {/* Avatar */}
                    <div className="w-11 h-11 rounded-lg bg-stone-100 border border-stone-200 overflow-hidden shrink-0 flex items-center justify-center">
                      {person.photoUrl ? (
                        <img
                          src={person.photoUrl}
                          alt={person.fullName}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <User className="w-5 h-5 text-stone-400" />
                      )}
                    </div>

                    {/* Name & Dates */}
                    <div className="min-w-0 flex-1">
                      <div
                        className="font-hebrew-serif font-bold text-stone-900 text-sm leading-tight text-wrap"
                        title={person.fullName}
                      >
                        {person.fullName}
                      </div>

                      <div className="text-[11px] text-stone-500 font-mono mt-1 flex flex-wrap items-center gap-1">
                        {person.birthDate && (
                          <span>{formatDisplayDate(person.birthDate, person.isBirthApproximate)}</span>
                        )}
                        {person.birthDate && person.deathDate && <span>–</span>}
                        {person.deathDate && (
                          <span>{formatDisplayDate(person.deathDate, person.isDeathApproximate)}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bottom info & Quick action affordance */}
                  <div className="flex items-center justify-between pt-1 border-t border-stone-100 text-[10px] text-stone-500">
                    <span className="font-mono text-stone-400">דור {node.generation + 1}</span>

                    {/* Hover Quick Actions */}
                    <div className="hidden group-hover:flex items-center gap-1">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          onQuickAddSpouse(person.id);
                        }}
                        title="הוסף בן/בת זוג"
                        className="p-1 hover:bg-stone-100 rounded text-stone-600 hover:text-stone-900"
                      >
                        <Heart className="w-3 h-3" />
                      </button>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          onQuickAddChild(person.id);
                        }}
                        title="הוסף ילד/ה"
                        className="p-1 hover:bg-stone-100 rounded text-stone-600 hover:text-stone-900"
                      >
                        <UserPlus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Compact Vertical View Card */}
              {viewType === 'compact-vertical' && (
                <div className="h-full px-2.5 py-1.5 flex flex-col justify-center text-center">
                  <div className="font-medium text-xs text-stone-900 leading-snug truncate" title={person.fullName}>
                    {person.fullName}
                  </div>
                  {person.birthDate && (
                    <div className="text-[10px] text-stone-400 font-mono mt-0.5">
                      {person.birthDate.slice(0, 4)}
                      {person.deathDate ? ` - ${person.deathDate.slice(0, 4)}` : ''}
                    </div>
                  )}
                </div>
              )}

              {/* Compact Horizontal View Card */}
              {viewType === 'compact-horizontal' && (
                <div className="h-full px-3 py-1 flex items-center justify-between text-right">
                  <span className="font-medium text-xs text-stone-900 truncate flex-1" title={person.fullName}>
                    {person.fullName}
                  </span>
                  {person.birthDate && (
                    <span className="text-[10px] text-stone-400 font-mono mr-1.5 shrink-0">
                      {person.birthDate.slice(0, 4)}
                    </span>
                  )}
                </div>
              )}

              {/* Collapse/Expand Toggle Indicator */}
              {node.descendantCount !== undefined && node.descendantCount > 0 && (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    onToggleCollapse(node.id);
                  }}
                  title={node.isCollapsed ? `הצג ${node.descendantCount} צאצאים` : 'הסתר את כל הדורות מתחת'}
                  className={`absolute z-20 px-2.5 py-1 min-h-[32px] rounded-full text-xs font-mono font-medium border flex items-center justify-center gap-0 shadow-sm transition-all cursor-pointer touch-manipulation select-none active:scale-95 ${
                    viewType === 'compact-horizontal'
                      ? '-left-8 top-1/2 -translate-y-1/2'
                      : '-bottom-4 left-1/2 -translate-x-1/2'
                  } ${
                    node.isCollapsed
                      ? 'bg-amber-600 text-white border-amber-700 hover:bg-amber-700 ring-2 ring-amber-200'
                      : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100 hover:border-stone-400'
                  }`}
                >
                  {node.isCollapsed ? (
                    <>
                      <ChevronDown className="w-3.5 h-3.5" />
                      <span>+{node.descendantCount}</span>
                    </>
                  ) : (
                    <>
                      <ChevronUp className="w-3.5 h-3.5 text-stone-500" />
                      <span className="text-[11px] text-stone-600"></span>
                    </>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Floating Bottom Canvas Controls */}
      <div
        dir="rtl"
        className="absolute bottom-3 sm:bottom-6 left-1/2 -translate-x-1/2 sm:left-auto sm:right-6 sm:translate-x-0 z-20 flex flex-wrap sm:flex-nowrap items-center justify-center gap-1.5 sm:gap-2 max-w-[calc(100vw-1rem)] select-none pb-[env(safe-area-inset-bottom)] pointer-events-auto"
      >
        {/* Mobile View Switcher */}
        <div className="flex lg:hidden items-center gap-0.5 p-1 bg-white/95 backdrop-blur-md border border-stone-200/90 rounded-xl shadow-md">
          <button
            type="button"
            onClick={() => onViewChange('detailed-vertical')}
            className={`p-1.5 rounded-lg transition-colors ${viewType === 'detailed-vertical' ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'}`}
            title="מפורטת"
          >
            <Layers className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onViewChange('compact-vertical')}
            className={`p-1.5 rounded-lg transition-colors ${viewType === 'compact-vertical' ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'}`}
            title="מקוצרת לאורך"
          >
            <GitBranch className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onViewChange('compact-horizontal')}
            className={`p-1.5 rounded-lg transition-colors ${viewType === 'compact-horizontal' ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'}`}
            title="מקוצרת לרוחב"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>

        {/* Tree Branch Expand / Collapse Controls */}
        <div className="flex items-center gap-0.5 p-1 bg-white/95 backdrop-blur-md border border-stone-200/90 rounded-xl shadow-md">
          <button
            type="button"
            onClick={onExpandAll}
            title="הרחב את כל הענפים"
            className="flex items-center gap-1 p-1.5 sm:px-2 sm:py-1.5 text-xs text-stone-700 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
          >
            <FolderPlus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="hidden md:inline">הרחב הכול</span>
          </button>
          <button
            type="button"
            onClick={onCollapseBranches}
            title="כווץ ענפים משניים"
            className="flex items-center gap-1 p-1.5 sm:px-2 sm:py-1.5 text-xs text-stone-700 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
          >
            <FolderMinus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="hidden md:inline">כווץ ענפים</span>
          </button>
        </div>

        {/* Zoom Controls Bar */}
        <div className="flex items-center gap-0.5 p-1 bg-white/95 backdrop-blur-md border border-stone-200/90 rounded-xl shadow-md">
          <button
            type="button"
            onClick={zoomIn}
            title="הגדל (+)"
            className="p-1.5 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={resetZoom}
            title="לחץ לאיפוס ל-100%"
            className="px-1.5 text-xs font-mono font-medium text-stone-700 cursor-pointer hover:text-stone-900 select-none min-w-[38px] text-center"
          >
            {Math.round(scale * 100)}%
          </button>

          <button
            type="button"
            onClick={zoomOut}
            title="הקטן (-)"
            className="p-1.5 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <div className="w-[1px] h-4 bg-stone-200 mx-0.5" />

          <button
            type="button"
            onClick={() => fitToScreen(true)}
            title="מרכז והתאם למסך"
            className="p-1.5 text-stone-900 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
