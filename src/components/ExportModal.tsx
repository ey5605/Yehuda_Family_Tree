import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  X,
  Download,
  Printer,
  FileImage,
  FileText,
  FileCode,
  Layers,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Maximize2,
  Copy,
  Check,
  Code2,
  Loader2
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { FamilyTreeData, ViewType, TreeLayout, LayoutNode } from '../types/family';
import { computeTreeLayout } from '../utils/treeLayout';
import { formatDisplayDate } from '../utils/familyGraph';
import { exportStandardJson, exportHumanReadableJson } from '../utils/universalTreeImporter';

interface ExportModalProps {
  treeData: FamilyTreeData;
  activeViewType: ViewType;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  treeData,
  activeViewType,
  onClose,
}) => {
  const [exportType, setExportType] = useState<'png' | 'a4-single' | 'a4-multi' | 'json'>('png');
  const [jsonFormat, setJsonFormat] = useState<'standard' | 'readable'>('standard');
  const [isCopied, setIsCopied] = useState(false);

  const [selectedView, setSelectedView] = useState<ViewType>(activeViewType);
  const [pngScale, setPngScale] = useState<number>(2); // 1x, 2x, 3x
  const [bgType, setBgType] = useState<'white' | 'transparent'>('white');
  const [a4Orientation, setA4Orientation] = useState<'auto' | 'portrait' | 'landscape'>('auto');
  const [isGenerating, setIsGenerating] = useState(false);
  const [exportStatus, setExportStatus] = useState<'idle' | 'generating' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const statusTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) {
        clearTimeout(statusTimerRef.current);
      }
    };
  }, []);

  // Reset completion messages if user switches options
  useEffect(() => {
    if (exportStatus === 'success' || exportStatus === 'error') {
      setExportStatus('idle');
      setStatusMessage('');
    }
  }, [exportType, selectedView, pngScale, a4Orientation]);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // Compute layout with NO collapsed nodes for export (exports the whole complete tree)
  const fullLayout = computeTreeLayout(treeData, selectedView, new Set());

  // JSON string computation
  const jsonOutputString = useMemo(() => {
    if (jsonFormat === 'readable') {
      return exportHumanReadableJson(treeData);
    }
    return exportStandardJson(treeData);
  }, [treeData, jsonFormat]);

  const handleCopyJson = () => {
    navigator.clipboard.writeText(jsonOutputString);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleDownloadJson = () => {
    const filename = jsonFormat === 'standard' ? 'ilan-yehuda-backup.json' : 'ilan-yehuda-people.json';
    const blob = new Blob([jsonOutputString], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setExportStatus('success');
    setStatusMessage('קובץ ירד בהצלחה');
    statusTimerRef.current = setTimeout(() => {
      setExportStatus('idle');
      setStatusMessage('');
    }, 6000);
  };

  // Render to canvas helper
  const renderTreeToCanvas = async (
    canvas: HTMLCanvasElement,
    layout: TreeLayout,
    scaleFactor: number,
    isTransparent = false,
    cropBounds?: { minX: number; minY: number; width: number; height: number }
  ) => {
    // Ensure all web fonts (such as Rubik) are loaded before measuring and rendering on canvas
    if (document.fonts?.ready) {
      try {
        await document.fonts.ready;
      } catch {}
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const b = cropBounds || layout.bounds;
    canvas.width = Math.ceil(b.width * scaleFactor);
    canvas.height = Math.ceil(b.height * scaleFactor);

    ctx.save();
    ctx.scale(scaleFactor, scaleFactor);
    ctx.translate(-b.minX, -b.minY);

    // Background
    if (!isTransparent) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(b.minX, b.minY, b.width, b.height);
    } else {
      ctx.clearRect(b.minX, b.minY, b.width, b.height);
    }

    // Connectors
    ctx.strokeStyle = '#78716c';
    ctx.lineWidth = 1.75;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const conn of layout.connectors) {
      if (conn.type === 'cross-branch') {
        ctx.strokeStyle = '#d97706';
        ctx.setLineDash([5, 5]);
      } else {
        ctx.strokeStyle = '#78716c';
        ctx.setLineDash([]);
      }

      const path2d = new Path2D(conn.path);
      ctx.stroke(path2d);
    }
    ctx.setLineDash([]);

    // Nodes
    for (const node of layout.nodes) {
      const { person } = node;

      // Card Box
      ctx.fillStyle = '#ffffff';
      if (person.gender === 'male') {
        ctx.strokeStyle = '#3b82f6'; // Blue
        ctx.lineWidth = 2;
      } else if (person.gender === 'female') {
        ctx.strokeStyle = '#f472b6'; // Pink
        ctx.lineWidth = 2;
      } else {
        ctx.strokeStyle = '#292524'; // Regular dark / stone
        ctx.lineWidth = 1.2;
      }

      // Rounded rectangle
      ctx.beginPath();
      const r = 10;
      ctx.roundRect(node.x, node.y, node.width, node.height, [r]);
      ctx.fill();
      ctx.stroke();

      if (selectedView === 'detailed-vertical') {
        // Detailed View: Avatar + Name + Dates
        const avatarSize = 64;
        const avatarX = node.x + node.width - avatarSize - 10;
        const avatarY = node.y + 10;

        // Draw Avatar background
        ctx.fillStyle = '#f5f5f4';
        ctx.beginPath();
        ctx.roundRect(avatarX, avatarY, avatarSize, avatarSize, [12]);
        ctx.fill();

        // Photo if available
        if (person.photoUrl) {
          try {
            const img = await loadImage(person.photoUrl);
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(avatarX, avatarY, avatarSize, avatarSize, [12]);
            ctx.clip();
            ctx.drawImage(img, avatarX, avatarY, avatarSize, avatarSize);
            ctx.restore();
          } catch {
            // Draw initial if image fails
            ctx.fillStyle = '#a8a29e';
            ctx.font = 'bold 22px "Rubik", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(person.fullName.charAt(0), avatarX + avatarSize / 2, avatarY + avatarSize / 2);
          }
        } else {
          ctx.fillStyle = '#a8a29e';
          ctx.font = 'bold 22px "Rubik", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(person.fullName.charAt(0), avatarX + avatarSize / 2, avatarY + avatarSize / 2);
        }

        // Full Name text (Right to left, large font matching UI)
        ctx.fillStyle = '#1c1917';
        ctx.font = 'bold 28px "Rubik", "Heebo", sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';

        // Word wrapping for long names
        const maxWidth = node.width - avatarSize - 26;
        const words = person.fullName.split(' ');
        let line = '';
        let textY = node.y + 12;

        for (let n = 0; n < words.length; n++) {
          const testLine = line + words[n] + ' ';
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxWidth && n > 0) {
            ctx.fillText(line.trim(), avatarX - 8, textY);
            line = words[n] + ' ';
            textY += 32;
          } else {
            line = testLine;
          }
        }
        ctx.fillText(line.trim(), avatarX - 8, textY);

        // Dates
        textY += 34;
        ctx.fillStyle = '#57534e';
        ctx.font = '18px "Rubik", monospace, sans-serif';
        const dateText = [
          formatDisplayDate(person.birthDate, person.isBirthApproximate),
          formatDisplayDate(person.deathDate, person.isDeathApproximate),
        ]
          .filter(Boolean)
          .join(' – ');

        if (dateText) {
          ctx.fillText(dateText, avatarX - 8, textY);
        }

        // Generation label
        ctx.fillStyle = '#a8a29e';
        ctx.font = '13px "Rubik", monospace, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`דור ${node.generation + 1}`, node.x + 12, node.y + node.height - 16);
      } else if (selectedView === 'compact-horizontal') {
        // Compact Horizontal View (RTL: Name on Right with large 24px bold font, Dates Badge on Left)
        const hasDates = Boolean(person.birthDate || person.deathDate);
        let badgeWidth = 0;
        const badgeX = node.x + 8;

        if (hasDates) {
          const datesStr = [
            formatDisplayDate(person.birthDate, person.isBirthApproximate),
            formatDisplayDate(person.deathDate, person.isDeathApproximate),
          ]
            .filter(Boolean)
            .join(' – ');

          ctx.font = '500 12px "Rubik", monospace, sans-serif';
          const dateMetrics = ctx.measureText(datesStr);
          badgeWidth = Math.ceil(dateMetrics.width + 12);
          const badgeHeight = 22;
          const badgeY = node.y + (node.height - badgeHeight) / 2;

          // Draw small rounded badge background & border matching TreeCanvas
          ctx.fillStyle = '#f5f5f4'; // stone-50
          ctx.strokeStyle = '#e7e5e4'; // stone-200
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, [4]);
          ctx.fill();
          ctx.stroke();

          // Draw dates text centered in badge
          ctx.fillStyle = '#78716c'; // stone-500
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(datesStr, badgeX + badgeWidth / 2, badgeY + badgeHeight / 2 + 0.5);
        }

        // Full Name text (Right aligned, large 24px bold font matching request)
        ctx.fillStyle = '#1c1917'; // stone-900
        ctx.font = 'bold 24px "Rubik", "Heebo", sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        const nameRightX = node.x + node.width - 10;
        const nameLeftLimit = hasDates ? (badgeX + badgeWidth + 6) : (node.x + 8);
        const maxNameWidth = Math.max(30, nameRightX - nameLeftLimit);

        // Word wrapping for up to 2 lines
        const words = person.fullName.split(' ');
        let line1 = '';
        let line2 = '';

        if (ctx.measureText(person.fullName).width <= maxNameWidth || words.length <= 1) {
          line1 = person.fullName;
          // Truncate if single long word overflows
          if (ctx.measureText(line1).width > maxNameWidth) {
            let truncated = line1;
            while (truncated.length > 1 && ctx.measureText(truncated + '…').width > maxNameWidth) {
              truncated = truncated.slice(0, -1);
            }
            line1 = truncated + '…';
          }
        } else {
          for (let w = 0; w < words.length; w++) {
            const test = (line1 ? line1 + ' ' : '') + words[w];
            if (ctx.measureText(test).width <= maxNameWidth || !line1) {
              line1 = test;
            } else {
              line2 = words.slice(w).join(' ');
              break;
            }
          }

          // If line 2 exceeds width, truncate with ellipsis
          if (line2 && ctx.measureText(line2).width > maxNameWidth) {
            let truncated = line2;
            while (truncated.length > 1 && ctx.measureText(truncated + '…').width > maxNameWidth) {
              truncated = truncated.slice(0, -1);
            }
            line2 = truncated + '…';
          }
        }

        if (line2) {
          ctx.fillText(line1, nameRightX, node.y + node.height / 2 - 13);
          ctx.fillText(line2, nameRightX, node.y + node.height / 2 + 13);
        } else {
          ctx.fillText(line1, nameRightX, node.y + node.height / 2);
        }
      } else {
        // Compact Vertical View (Center aligned, large 24px bold font matching request)
        ctx.fillStyle = '#1c1917';
        ctx.font = 'bold 24px "Rubik", "Heebo", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const hasDates = Boolean(person.birthDate || person.deathDate);
        const maxTextWidth = node.width - 12;

        let displayName = person.fullName;
        if (ctx.measureText(displayName).width > maxTextWidth) {
          let truncated = displayName;
          while (truncated.length > 1 && ctx.measureText(truncated + '…').width > maxTextWidth) {
            truncated = truncated.slice(0, -1);
          }
          displayName = truncated + '…';
        }

        ctx.fillText(
          displayName,
          node.x + node.width / 2,
          node.y + (hasDates ? node.height / 2 - 12 : node.height / 2)
        );

        if (hasDates) {
          ctx.fillStyle = '#78716c';
          ctx.font = '13px "Rubik", monospace, sans-serif';
          const datesStr = [
            formatDisplayDate(person.birthDate, person.isBirthApproximate),
            formatDisplayDate(person.deathDate, person.isDeathApproximate),
          ]
            .filter(Boolean)
            .join(' – ');

          ctx.fillText(
            datesStr,
            node.x + node.width / 2,
            node.y + node.height / 2 + 15
          );
        }
      }
    }

    ctx.restore();
  };

  // Helper to load image
  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  };

  // Update Live Preview when options change
  useEffect(() => {
    if (exportType === 'json' || !previewCanvasRef.current || fullLayout.nodes.length === 0) return;
    renderTreeToCanvas(previewCanvasRef.current, fullLayout, 0.5, bgType === 'transparent');
  }, [exportType, selectedView, bgType, fullLayout]);

  // Calculate safe effective scale factor within browser canvas limits (32,767px dimension, 125MP total buffer)
  const getSafePngScale = (requestedScale: number): number => {
    const MAX_DIMENSION = 32767;
    const MAX_TOTAL_PIXELS = 125000000;

    const w = fullLayout.bounds.width;
    const h = fullLayout.bounds.height;
    if (w <= 0 || h <= 0) return requestedScale;

    const reqW = w * requestedScale;
    const reqH = h * requestedScale;
    const reqArea = reqW * reqH;

    if (reqW > MAX_DIMENSION || reqH > MAX_DIMENSION || reqArea > MAX_TOTAL_PIXELS) {
      const dimScale = Math.min(MAX_DIMENSION / w, MAX_DIMENSION / h);
      const areaScale = Math.sqrt(MAX_TOTAL_PIXELS / (w * h));
      const safeScale = Math.min(requestedScale, dimScale, areaScale);
      return Math.round(safeScale * 100) / 100;
    }
    return requestedScale;
  };

  // Execute PNG Export
  const handleExportPNG = async () => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setIsGenerating(true);
    setExportStatus('generating');
    setStatusMessage('הקובץ בהפקה...');

    try {
      const offscreenCanvas = document.createElement('canvas');
      const safeScale = getSafePngScale(pngScale);

      await renderTreeToCanvas(offscreenCanvas, fullLayout, safeScale, bgType === 'transparent');

      // Use Blob to stream image directly to file download with zero memory overload
      const blob = await new Promise<Blob | null>((resolve) => offscreenCanvas.toBlob(resolve, 'image/png'));
      if (!blob) {
        throw new Error('הדפדפן לא הצליח להקצות זיכרון להפקת קובץ ה-PNG. נסה לבחור רזולוציה מעט נמוכה יותר.');
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ilan-yehuda-tree-${selectedView}-${pngScale}x.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 20000);

      setExportStatus('success');
      setStatusMessage('קובץ ירד בהצלחה');
      statusTimerRef.current = setTimeout(() => {
        setExportStatus('idle');
        setStatusMessage('');
      }, 6000);
    } catch (err: any) {
      setExportStatus('error');
      setStatusMessage('שגיאה בייצוא תמונה');
      alert('שגיאה בייצוא תמונה: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // Execute Single A4 PDF Export
  const handleExportSingleA4 = async () => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setIsGenerating(true);
    setExportStatus('generating');
    setStatusMessage('הקובץ בהפקה...');

    try {
      const isLandscape =
        a4Orientation === 'landscape' ||
        (a4Orientation === 'auto' && fullLayout.bounds.width >= fullLayout.bounds.height);

      const orientation = isLandscape ? 'landscape' : 'portrait';
      const pdf = new jsPDF({
        orientation,
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = isLandscape ? 297 : 210;
      const pageHeight = isLandscape ? 210 : 297;
      const margin = 10;
      const headerHeight = 15;

      const availWidth = pageWidth - margin * 2;
      const availHeight = pageHeight - margin * 2 - headerHeight;

      // Calculate uniform scale factor to fit
      const scaleX = availWidth / fullLayout.bounds.width;
      const scaleY = availHeight / fullLayout.bounds.height;
      const fitScale = Math.min(scaleX, scaleY);

      // Render tree to canvas at 2x print density
      const printScaleFactor = fitScale * 3.78 * 2;
      const offscreenCanvas = document.createElement('canvas');
      await renderTreeToCanvas(offscreenCanvas, fullLayout, printScaleFactor, false);

      const imgData = offscreenCanvas.toDataURL('image/jpeg', 0.95);

      // Center image in page
      const renderW = fullLayout.bounds.width * fitScale;
      const renderH = fullLayout.bounds.height * fitScale;
      const posX = margin + (availWidth - renderW) / 2;
      const posY = margin + headerHeight + (availHeight - renderH) / 2;

      // Header title
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.text('The Yehuda Family Tree', pageWidth / 2, margin + 8, { align: 'center' });

      // Add image
      pdf.addImage(imgData, 'JPEG', posX, posY, renderW, renderH);

      pdf.save('ilan-yehuda-a4.pdf');

      setExportStatus('success');
      setStatusMessage('קובץ ירד בהצלחה');
      statusTimerRef.current = setTimeout(() => {
        setExportStatus('idle');
        setStatusMessage('');
      }, 6000);
    } catch (err: any) {
      setExportStatus('error');
      setStatusMessage('שגיאה בהפקת PDF');
      alert('שגיאה בהפקת PDF: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // Execute Multi-Page A4 PDF Export
  const handleExportMultiPageA4 = async () => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setIsGenerating(true);
    setExportStatus('generating');
    setStatusMessage('הקובץ בהפקה...');

    try {
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 12;
      const headerH = 12;
      const footerH = 10;

      const availW = pageWidth - margin * 2;
      const availH = pageHeight - margin * 2 - headerH - footerH;

      // Width fits on A4 page
      const scaleToWidth = availW / fullLayout.bounds.width;
      const naturalHeightMm = fullLayout.bounds.height * scaleToWidth;

      // Determine number of vertical pages
      const totalPages = Math.max(1, Math.ceil(naturalHeightMm / availH));

      for (let p = 0; p < totalPages; p++) {
        if (p > 0) pdf.addPage('a4', 'portrait');

        const sliceMinY = fullLayout.bounds.minY + (p * (fullLayout.bounds.height / totalPages));
        const sliceHeight = fullLayout.bounds.height / totalPages;

        const sliceCanvas = document.createElement('canvas');
        await renderTreeToCanvas(
          sliceCanvas,
          fullLayout,
          scaleToWidth * 3.78 * 2,
          false,
          {
            minX: fullLayout.bounds.minX,
            minY: sliceMinY,
            width: fullLayout.bounds.width,
            height: sliceHeight,
          }
        );

        const imgData = sliceCanvas.toDataURL('image/jpeg', 0.95);
        const renderHeightMm = sliceHeight * scaleToWidth;

        // Header on every page
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10);
        pdf.text('The Yehuda Family Tree - Family Lineage', pageWidth / 2, margin + 5, { align: 'center' });

        // Add page slice image
        pdf.addImage(imgData, 'JPEG', margin, margin + headerH, availW, renderHeightMm);

        // Continuation markers
        pdf.setFontSize(8);
        if (p > 0) {
          pdf.text(`[Continued from page ${p} ^]`, pageWidth - margin, margin + headerH - 2, { align: 'right' });
        }
        if (p < totalPages - 1) {
          pdf.text(`[Continues to page ${p + 2} v]`, pageWidth - margin, margin + headerH + renderHeightMm + 4, { align: 'right' });
        }

        // Footer Page Number
        pdf.text(`Page ${p + 1} of ${totalPages}`, pageWidth / 2, pageHeight - margin, { align: 'center' });
      }

      pdf.save('ilan-yehuda-multipage-a4.pdf');

      setExportStatus('success');
      setStatusMessage('קובץ ירד בהצלחה');
      statusTimerRef.current = setTimeout(() => {
        setExportStatus('idle');
        setStatusMessage('');
      }, 6000);
    } catch (err: any) {
      setExportStatus('error');
      setStatusMessage('שגיאה בהפקת PDF');
      alert('שגיאה בהפקת PDF רב-עמודי: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // Browser Print trigger
  const handleBrowserPrint = () => {
    window.print();
  };

  const personsCount = Object.keys(treeData.persons).length;
  const relsCount = treeData.relationships.length;
  const spousesCount = treeData.relationships.filter(r => r.type === 'spouse').length;
  const parentChildCount = treeData.relationships.filter(r => r.type === 'parent-child').length;

  return (
    <div
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-stone-900/50 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 cursor-pointer"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] sm:max-h-[90vh] shadow-2xl border border-stone-200 flex flex-col overflow-hidden animate-in fade-in duration-150 cursor-default"
      >
        {/* Header */}
        <div className="p-5 border-b border-stone-200 flex items-center justify-between bg-stone-50">
          <div>
            <h2 className="font-hebrew-serif font-bold text-lg text-stone-900">
              ייצוא והדפסה של אילן היוחסין
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              ייצוא קובץ נתונים JSON, תמונת PNG מלאה או הפקת מסמכי A4 מותאמים להדפסה
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Controls & Live Preview */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Left Column (Options): 5 cols */}
          <div className="md:col-span-5 space-y-5">
            {/* Format Selector */}
            <div>
              <label className="block text-xs font-semibold text-stone-800 mb-2">
                פורמט ייצוא:
              </label>
              <div className="space-y-2">
                {/* JSON Data Export Option */}
                <button
                  onClick={() => setExportType('json')}
                  className={`w-full text-right p-3 rounded-xl border text-xs transition-colors flex items-start gap-2.5 ${
                    exportType === 'json'
                      ? 'border-stone-900 bg-stone-50 font-medium'
                      : 'border-stone-200 hover:bg-stone-50'
                  }`}
                >
                  <FileCode className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-stone-900">קובץ נתוני JSON (ייצוא וגיבוי)</div>
                    <div className="text-[11px] text-stone-500">
                      ייצוא כל הנתונים, האנשים והקשרים (כולל ריבוי בני זוג) כקובץ JSON
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setExportType('png')}
                  className={`w-full text-right p-3 rounded-xl border text-xs transition-colors flex items-start gap-2.5 ${
                    exportType === 'png'
                      ? 'border-stone-900 bg-stone-50 font-medium'
                      : 'border-stone-200 hover:bg-stone-50'
                  }`}
                >
                  <FileImage className="w-4 h-4 text-stone-700 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-stone-900">תמונת PNG של כל העץ</div>
                    <div className="text-[11px] text-stone-500">
                      תמונה רחבה אחת של כל העץ (כולל כל הדורות) ברזולוציה גבוהה
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setExportType('a4-single')}
                  className={`w-full text-right p-3 rounded-xl border text-xs transition-colors flex items-start gap-2.5 ${
                    exportType === 'a4-single'
                      ? 'border-stone-900 bg-stone-50 font-medium'
                      : 'border-stone-200 hover:bg-stone-50'
                  }`}
                >
                  <FileText className="w-4 h-4 text-stone-700 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-stone-900">דף A4 יחיד (התאמה מלאה)</div>
                    <div className="text-[11px] text-stone-500">
                      סדר את כל העץ באופן אוטומטי כך שייכנס לעמוד A4 אחד בדיוק
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setExportType('a4-multi')}
                  className={`w-full text-right p-3 rounded-xl border text-xs transition-colors flex items-start gap-2.5 ${
                    exportType === 'a4-multi'
                      ? 'border-stone-900 bg-stone-50 font-medium'
                      : 'border-stone-200 hover:bg-stone-50'
                  }`}
                >
                  <Layers className="w-4 h-4 text-stone-700 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-stone-900">רוחב A4 יחיד, אורך רב־עמודי</div>
                    <div className="text-[11px] text-stone-500">
                      רוחב של עמוד אחד, נמשך כלפי מטה ללא חיתוך כרטיסים ועם סימני המשך
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Options for JSON Export */}
            {exportType === 'json' && (
              <div className="space-y-3 pt-2 border-t border-stone-100">
                <label className="block text-xs font-semibold text-stone-800">
                  מבנה קובץ ה-JSON:
                </label>
                <div className="space-y-2">
                  <label
                    onClick={() => setJsonFormat('standard')}
                    className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 cursor-pointer transition-colors ${
                      jsonFormat === 'standard' ? 'border-amber-600 bg-amber-50/50' : 'border-stone-200 hover:bg-stone-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="jsonFormat"
                      checked={jsonFormat === 'standard'}
                      onChange={() => setJsonFormat('standard')}
                      className="mt-0.5 text-amber-600"
                    />
                    <div>
                      <div className="font-bold text-stone-900">פורמט גיבוי מלא (תואם שחזור 100%)</div>
                      <div className="text-[11px] text-stone-500 mt-0.5">
                        כולל מזהים ייחודיים, קשרי משפחה מלאים, תמונות והגדרות מטא-דאטה.
                      </div>
                    </div>
                  </label>

                  <label
                    onClick={() => setJsonFormat('readable')}
                    className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 cursor-pointer transition-colors ${
                      jsonFormat === 'readable' ? 'border-amber-600 bg-amber-50/50' : 'border-stone-200 hover:bg-stone-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="jsonFormat"
                      checked={jsonFormat === 'readable'}
                      onChange={() => setJsonFormat('readable')}
                      className="mt-0.5 text-amber-600"
                    />
                    <div>
                      <div className="font-bold text-stone-900">פורמט קריא ומובנה (רשימת אנשים וקשרים)</div>
                      <div className="text-[11px] text-stone-500 mt-0.5">
                        מערך קריא של אנשים עם רשימת בני/בנות זוג, ילדים, והורים בשמות ברורים.
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* Tree View Selection (for visual exports) */}
            {exportType !== 'json' && (
              <div>
                <label className="block text-xs font-semibold text-stone-800 mb-1.5">
                  תצוגת העץ לייצוא:
                </label>
                <select
                  value={selectedView}
                  onChange={e => setSelectedView(e.target.value as ViewType)}
                  className="w-full px-3 py-2 text-xs bg-white border border-stone-300 rounded-lg focus:outline-none"
                >
                  <option value="detailed-vertical">תצוגה מלאה ומפורטת (עם תמונות ותאריכים)</option>
                  <option value="compact-vertical">תצוגה מקוצרת לאורך (שמות בלבד)</option>
                  <option value="compact-horizontal">תצוגה מקוצרת לרוחב RTL (שמות בלבד)</option>
                </select>
              </div>
            )}

            {/* Format Specific Options for PNG */}
            {exportType === 'png' && (
              <div className="space-y-3 pt-1 border-t border-stone-100">
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    רזולוציית התמונה:
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setPngScale(1)}
                      className={`py-1.5 text-xs rounded-lg border cursor-pointer font-medium transition-colors ${
                        pngScale === 1 ? 'bg-stone-900 text-white' : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
                      }`}
                    >
                      1x (מסך)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPngScale(2)}
                      className={`py-1.5 text-xs rounded-lg border cursor-pointer font-medium transition-colors ${
                        pngScale === 2 ? 'bg-stone-900 text-white' : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
                      }`}
                    >
                      2x (איכותי)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPngScale(3)}
                      className={`py-1.5 text-xs rounded-lg border cursor-pointer font-medium transition-colors ${
                        pngScale === 3 ? 'bg-stone-900 text-white' : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
                      }`}
                    >
                      3x (דפוס מקצועי)
                    </button>
                  </div>
                  <div className="mt-1.5 text-[11px] text-stone-600 font-mono text-center bg-stone-50 py-1 px-2 rounded border border-stone-200">
                    מימדי התמונה: {Math.round(fullLayout.bounds.width * getSafePngScale(pngScale)).toLocaleString()} × {Math.round(fullLayout.bounds.height * getSafePngScale(pngScale)).toLocaleString()} פיקסלים
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    רקע:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setBgType('white')}
                      className={`py-1.5 text-xs rounded-lg border ${
                        bgType === 'white' ? 'bg-stone-900 text-white' : 'bg-white text-stone-700 border-stone-200'
                      }`}
                    >
                      לבן
                    </button>
                    <button
                      onClick={() => setBgType('transparent')}
                      className={`py-1.5 text-xs rounded-lg border ${
                        bgType === 'transparent' ? 'bg-stone-900 text-white' : 'bg-white text-stone-700 border-stone-200'
                      }`}
                    >
                      שקוף
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Live Preview / JSON Code viewer (7 cols) */}
          <div className="md:col-span-7 bg-stone-100 rounded-xl p-4 flex flex-col items-center justify-center border border-stone-200 min-h-[320px]">
            {exportType === 'json' ? (
              <div className="w-full h-full flex flex-col">
                <div className="text-[11px] text-stone-600 font-mono mb-2 flex items-center justify-between">
                  <span className="font-bold flex items-center gap-1.5">
                    <Code2 className="w-3.5 h-3.5 text-amber-700" />
                    <span>תצוגת קוד JSON ({personsCount} אנשים | {relsCount} קשרים)</span>
                  </span>
                  <button
                    onClick={handleCopyJson}
                    className="px-2.5 py-1 bg-white hover:bg-stone-50 border border-stone-300 rounded text-stone-700 text-[11px] flex items-center gap-1 transition-colors"
                  >
                    {isCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{isCopied ? 'הועתק!' : 'העתק JSON'}</span>
                  </button>
                </div>

                <div className="relative flex-1 w-full max-h-[340px] bg-stone-900 rounded-lg p-3 overflow-auto border border-stone-800 shadow-inner">
                  <pre className="text-xs font-mono text-emerald-400 text-left whitespace-pre" dir="ltr">
                    {jsonOutputString}
                  </pre>
                </div>
              </div>
            ) : (
              <>
                <div className="text-[11px] text-stone-500 font-mono mb-2 self-start flex items-center justify-between w-full">
                  <span>תצוגה מקדימה של הפריסה המלאה</span>
                  <span>
                    {fullLayout.nodes.length} אנשים | {Math.round(fullLayout.bounds.width)}x{Math.round(fullLayout.bounds.height)}px
                  </span>
                </div>

                <div className="relative max-w-full max-h-[340px] overflow-auto bg-white p-2 rounded-lg shadow-inner border border-stone-200 flex items-center justify-center">
                  <canvas
                    ref={previewCanvasRef}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-3 py-2.5 sm:px-4 sm:py-3.5 border-t border-stone-200 bg-stone-50 flex items-center justify-between gap-1.5 sm:gap-2.5 overflow-x-auto whitespace-nowrap select-none">
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="px-2.5 py-1.5 sm:px-4 sm:py-2 text-[11px] sm:text-xs text-stone-600 hover:bg-stone-200 disabled:opacity-50 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0"
          >
            סגור
          </button>

          <div className="flex items-center flex-nowrap gap-1.5 sm:gap-2.5 shrink-0">
            {exportType === 'json' && (
              <>
                <button
                  onClick={handleCopyJson}
                  className="px-2.5 py-1.5 sm:px-3.5 sm:py-2 text-[11px] sm:text-xs font-medium text-stone-800 bg-white border border-stone-300 hover:bg-stone-100 rounded-lg transition-colors flex items-center gap-1 sm:gap-1.5 cursor-pointer shrink-0"
                >
                  {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <Copy className="w-3.5 h-3.5 shrink-0" />}
                  <span>{isCopied ? 'הועתק!' : 'העתק JSON'}</span>
                </button>

                {exportStatus === 'success' && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] sm:text-xs font-semibold shadow-xs animate-in fade-in shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-white" />
                    <span>קובץ ירד בהצלחה</span>
                  </span>
                )}

                <button
                  onClick={handleDownloadJson}
                  className="px-2.5 py-1.5 sm:px-4 sm:py-2 text-[11px] sm:text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg transition-colors flex items-center gap-1 sm:gap-1.5 shadow-xs cursor-pointer shrink-0"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span>הורד JSON</span>
                </button>
              </>
            )}

            {exportType === 'png' && (
              <>
                {/* Status message right beside the download button */}
                {exportStatus === 'generating' && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-amber-500 text-white text-[11px] sm:text-xs font-semibold shadow-xs animate-pulse shrink-0">
                    <Loader2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin shrink-0 text-white" />
                    <span>הקובץ בהפקה...</span>
                  </span>
                )}

                {exportStatus === 'success' && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] sm:text-xs font-semibold shadow-xs animate-in fade-in shrink-0">
                    <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 text-white" />
                    <span>קובץ ירד בהצלחה</span>
                  </span>
                )}

                {exportStatus === 'error' && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-rose-600 text-white text-[11px] sm:text-xs font-semibold shadow-xs shrink-0">
                    <AlertTriangle className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 text-white" />
                    <span>{statusMessage || 'שגיאה בהפקה'}</span>
                  </span>
                )}

                <button
                  onClick={handleExportPNG}
                  disabled={isGenerating}
                  className="px-2.5 py-1.5 sm:px-4 sm:py-2 text-[11px] sm:text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1 sm:gap-1.5 shadow-xs cursor-pointer disabled:cursor-not-allowed shrink-0"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span>תוריד תמונת PNG</span>
                </button>
              </>
            )}

            {exportType === 'a4-single' && (
              <>
                <button
                  onClick={handleBrowserPrint}
                  disabled={isGenerating}
                  className="px-2 py-1.5 sm:px-3 sm:py-2 text-[11px] sm:text-xs font-medium text-stone-700 bg-white border border-stone-300 hover:bg-stone-100 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed shrink-0"
                >
                  <Printer className="w-3.5 h-3.5 shrink-0" />
                  <span>הדפסה</span>
                </button>

                {/* Status message right beside the download button */}
                {exportStatus === 'generating' && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-amber-500 text-white text-[11px] sm:text-xs font-semibold shadow-xs animate-pulse shrink-0">
                    <Loader2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin shrink-0 text-white" />
                    <span>הקובץ בהפקה...</span>
                  </span>
                )}

                {exportStatus === 'success' && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] sm:text-xs font-semibold shadow-xs animate-in fade-in shrink-0">
                    <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 text-white" />
                    <span>קובץ ירד בהצלחה</span>
                  </span>
                )}

                {exportStatus === 'error' && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-rose-600 text-white text-[11px] sm:text-xs font-semibold shadow-xs shrink-0">
                    <AlertTriangle className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 text-white" />
                    <span>{statusMessage || 'שגיאה בהפקה'}</span>
                  </span>
                )}

                <button
                  onClick={handleExportSingleA4}
                  disabled={isGenerating}
                  className="px-2.5 py-1.5 sm:px-4 sm:py-2 text-[11px] sm:text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1 sm:gap-1.5 shadow-xs cursor-pointer disabled:cursor-not-allowed shrink-0"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span>הורד PDF (עמוד A4 יחיד)</span>
                </button>
              </>
            )}

            {exportType === 'a4-multi' && (
              <>
                <button
                  onClick={handleBrowserPrint}
                  disabled={isGenerating}
                  className="px-2 py-1.5 sm:px-3 sm:py-2 text-[11px] sm:text-xs font-medium text-stone-700 bg-white border border-stone-300 hover:bg-stone-100 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed shrink-0"
                >
                  <Printer className="w-3.5 h-3.5 shrink-0" />
                  <span>הדפסה</span>
                </button>

                {/* Status message right beside the download button */}
                {exportStatus === 'generating' && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-amber-500 text-white text-[11px] sm:text-xs font-semibold shadow-xs animate-pulse shrink-0">
                    <Loader2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin shrink-0 text-white" />
                    <span>הקובץ בהפקה...</span>
                  </span>
                )}

                {exportStatus === 'success' && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] sm:text-xs font-semibold shadow-xs animate-in fade-in shrink-0">
                    <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 text-white" />
                    <span>קובץ ירד בהצלחה</span>
                  </span>
                )}

                {exportStatus === 'error' && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-rose-600 text-white text-[11px] sm:text-xs font-semibold shadow-xs shrink-0">
                    <AlertTriangle className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 text-white" />
                    <span>{statusMessage || 'שגיאה בהפקה'}</span>
                  </span>
                )}

                <button
                  onClick={handleExportMultiPageA4}
                  disabled={isGenerating}
                  className="px-2.5 py-1.5 sm:px-4 sm:py-2 text-[11px] sm:text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1 sm:gap-1.5 shadow-xs cursor-pointer disabled:cursor-not-allowed shrink-0"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span>הורד PDF רב-עמודי</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
