import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Download,
  Printer,
  FileImage,
  FileText,
  Layers,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Maximize2
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { FamilyTreeData, ViewType, TreeLayout, LayoutNode } from '../types/family';
import { computeTreeLayout } from '../utils/treeLayout';
import { formatDisplayDate } from '../utils/familyGraph';

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
  const [exportType, setExportType] = useState<'png' | 'a4-single' | 'a4-multi'>('png');
  const [selectedView, setSelectedView] = useState<ViewType>(activeViewType);
  const [pngScale, setPngScale] = useState<number>(2); // 1x, 2x, 3x
  const [bgType, setBgType] = useState<'white' | 'transparent'>('white');
  const [a4Orientation, setA4Orientation] = useState<'auto' | 'portrait' | 'landscape'>('auto');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<string>('');

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // Compute layout with NO collapsed nodes for export (exports the whole complete tree)
  const fullLayout = computeTreeLayout(treeData, selectedView, new Set());

  // Render to canvas helper
  const renderTreeToCanvas = async (
    canvas: HTMLCanvasElement,
    layout: TreeLayout,
    scaleFactor: number,
    isTransparent = false,
    cropBounds?: { minX: number; minY: number; width: number; height: number }
  ) => {
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
      ctx.strokeStyle = '#e7e5e4';
      ctx.lineWidth = 1;

      // Rounded rectangle
      ctx.beginPath();
      ctx.roundRect(node.x, node.y, node.width, node.height, 10);
      ctx.fill();
      ctx.stroke();

      if (selectedView === 'detailed-vertical') {
        // Detailed Card Render
        // Avatar circle/rect
        const avatarSize = 40;
        const avatarX = node.x + node.width - avatarSize - 10;
        const avatarY = node.y + 10;

        ctx.fillStyle = '#f5f5f4';
        ctx.beginPath();
        ctx.roundRect(avatarX, avatarY, avatarSize, avatarSize, 8);
        ctx.fill();

        // If person has photo, draw image if loaded
        if (person.photoUrl) {
          try {
            const img = await loadImage(person.photoUrl);
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(avatarX, avatarY, avatarSize, avatarSize, 8);
            ctx.clip();
            ctx.drawImage(img, avatarX, avatarY, avatarSize, avatarSize);
            ctx.restore();
          } catch (e) {
            // fallback
          }
        }

        // Name text
        ctx.fillStyle = '#1c1917';
        ctx.font = 'bold 13px "Frank Ruhl Libre", "Rubik", Georgia, serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';

        // Word wrap name
        const maxTextWidth = node.width - avatarSize - 25;
        const words = person.fullName.split(' ');
        let line = '';
        let textY = node.y + 12;

        for (let n = 0; n < words.length; n++) {
          const testLine = line + words[n] + ' ';
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxTextWidth && n > 0) {
            ctx.fillText(line.trim(), avatarX - 8, textY);
            line = words[n] + ' ';
            textY += 16;
          } else {
            line = testLine;
          }
        }
        ctx.fillText(line.trim(), avatarX - 8, textY);

        // Dates
        textY += 18;
        ctx.fillStyle = '#78716c';
        ctx.font = '10px "Rubik", sans-serif';
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
        ctx.font = '9px "Rubik", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`דור ${node.generation + 1}`, node.x + 10, node.y + node.height - 15);
      } else {
        // Compact Views
        ctx.fillStyle = '#1c1917';
        ctx.font = '500 12px "Rubik", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.fillText(
          person.fullName,
          node.x + node.width / 2,
          node.y + (person.birthDate ? node.height / 2 - 6 : node.height / 2)
        );

        if (person.birthDate) {
          ctx.fillStyle = '#a8a29e';
          ctx.font = '10px "Rubik", sans-serif';
          ctx.fillText(
            person.birthDate.slice(0, 4),
            node.x + node.width / 2,
            node.y + node.height / 2 + 8
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
    if (!previewCanvasRef.current || fullLayout.nodes.length === 0) return;
    renderTreeToCanvas(previewCanvasRef.current, fullLayout, 0.5, bgType === 'transparent');
  }, [exportType, selectedView, bgType, fullLayout]);

  // Execute PNG Export
  const handleExportPNG = async () => {
    setIsGenerating(true);
    setGenerationProgress('מחשב פריסה מלאה ברזולוציה גבוהה...');

    try {
      const offscreenCanvas = document.createElement('canvas');
      const scale = pngScale;

      // Check max canvas dimensions (standard browsers support up to 16,384px)
      const targetW = fullLayout.bounds.width * scale;
      const targetH = fullLayout.bounds.height * scale;

      if (targetW > 16000 || targetH > 16000) {
        alert(
          `מימדי התמונה (${Math.round(targetW)}x${Math.round(targetH)}) חורגים ממגבלות הזיכרון של הדפדפן. הרזולוציה תותאם אוטומטית ל-1x.`
        );
        await renderTreeToCanvas(offscreenCanvas, fullLayout, 1, bgType === 'transparent');
      } else {
        await renderTreeToCanvas(offscreenCanvas, fullLayout, scale, bgType === 'transparent');
      }

      setGenerationProgress('יוצר קובץ להורדה...');
      const dataUrl = offscreenCanvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `ilan-yehuda-tree-${selectedView}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      alert('שגיאה בייצוא תמונה: ' + err.message);
    } finally {
      setIsGenerating(false);
      setGenerationProgress('');
    }
  };

  // Execute Single A4 Page Export (PDF)
  const handleExportSingleA4 = async () => {
    setIsGenerating(true);
    setGenerationProgress('מעבד דף A4 יחיד...');

    try {
      const { width: tw, height: th } = fullLayout.bounds;

      // Determine orientation: A4 is 297mm x 210mm
      let isLandscape = tw > th;
      if (a4Orientation === 'portrait') isLandscape = false;
      if (a4Orientation === 'landscape') isLandscape = true;

      const pdf = new jsPDF({
        orientation: isLandscape ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const availW = pageWidth - margin * 2;
      const availH = pageHeight - margin * 2;

      // Calculate scale to fit
      const scaleRatio = Math.min(availW / tw, availH / th);

      // Render tree to canvas
      const canvas = document.createElement('canvas');
      const renderScale = 2; // high-dpi
      await renderTreeToCanvas(canvas, fullLayout, renderScale, false);

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const imgW = tw * scaleRatio;
      const imgH = th * scaleRatio;
      const offsetX = margin + (availW - imgW) / 2;
      const offsetY = margin + (availH - imgH) / 2;

      pdf.addImage(imgData, 'JPEG', offsetX, offsetY, imgW, imgH);
      pdf.save('ilan-yehuda-single-a4.pdf');
    } catch (err: any) {
      alert('שגיאה בהפקת PDF: ' + err.message);
    } finally {
      setIsGenerating(false);
      setGenerationProgress('');
    }
  };

  // Execute Multi-Page A4 Width Export (רוחב A4 יחיד, אורך רב־עמודי)
  const handleExportMultiPageA4 = async () => {
    setIsGenerating(true);
    setGenerationProgress('מחשב חלוקת עמודים אנכית ללא חיתוך כרטיסים...');

    try {
      const isLandscape = a4Orientation === 'landscape';
      const pdf = new jsPDF({
        orientation: isLandscape ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const availW = pageWidth - margin * 2;
      const headerH = 15;
      const footerH = 10;
      const contentH = pageHeight - margin * 2 - headerH - footerH;

      // Scale strictly to match A4 available width
      const scaleToWidth = availW / fullLayout.bounds.width;
      const treeUnitHeight = fullLayout.bounds.height;
      const scaledTotalHeight = treeUnitHeight * scaleToWidth;

      // Page breaks calculation:
      // We must NEVER cut a person card horizontally!
      const pageCuts: number[] = [fullLayout.bounds.minY];
      let currentTop = fullLayout.bounds.minY;
      const sliceHeightInTreeUnits = contentH / scaleToWidth;

      while (currentTop < fullLayout.bounds.maxY) {
        let proposedBottom = currentTop + sliceHeightInTreeUnits;

        if (proposedBottom >= fullLayout.bounds.maxY) {
          pageCuts.push(fullLayout.bounds.maxY);
          break;
        }

        // Check if any card is cut by proposedBottom
        let safeCutY = proposedBottom;
        for (const node of fullLayout.nodes) {
          const nodeTop = node.y;
          const nodeBottom = node.y + node.height;

          // If card crosses proposedBottom
          if (nodeTop < proposedBottom && nodeBottom > proposedBottom) {
            // Push cut above this card
            safeCutY = Math.min(safeCutY, nodeTop - 15);
          }
        }

        // Avoid infinite loop if card is unusually tall
        if (safeCutY <= currentTop + 30) {
          safeCutY = proposedBottom;
        }

        pageCuts.push(safeCutY);
        currentTop = safeCutY;
      }

      const totalPages = pageCuts.length - 1;

      // Render each page slice
      for (let p = 0; p < totalPages; p++) {
        if (p > 0) pdf.addPage();

        setGenerationProgress(`מעבד עמוד ${p + 1} מתוך ${totalPages}...`);

        const sliceMinY = pageCuts[p];
        const sliceMaxY = pageCuts[p + 1];
        const sliceHeight = sliceMaxY - sliceMinY;

        const sliceCanvas = document.createElement('canvas');
        await renderTreeToCanvas(
          sliceCanvas,
          fullLayout,
          2, // High resolution
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
    } catch (err: any) {
      alert('שגיאה בהפקת PDF רב-עמודי: ' + err.message);
    } finally {
      setIsGenerating(false);
      setGenerationProgress('');
    }
  };

  // Browser Print trigger
  const handleBrowserPrint = () => {
    window.print();
  };

  // Readability factor score for single A4
  const singleA4ScaleFactor = Math.min(
    (297 - 20) / fullLayout.bounds.width,
    (210 - 20) / fullLayout.bounds.height
  );
  const isScaleTooSmall = singleA4ScaleFactor < 0.35 && fullLayout.nodes.length > 25;

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] shadow-2xl border border-stone-200 flex flex-col overflow-hidden animate-in fade-in duration-150">
        {/* Header */}
        <div className="p-5 border-b border-stone-200 flex items-center justify-between bg-stone-50">
          <div>
            <h2 className="font-hebrew-serif font-bold text-lg text-stone-900">
              ייצוא והדפסה של אילן היוחסין
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              ייצוא תמונה מלאה או הפקת מסמכי A4 מותאמים להדפסה
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

            {/* Tree View Selection */}
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

            {/* Format Specific Options */}
            {exportType === 'png' && (
              <div className="space-y-3 pt-1 border-t border-stone-100">
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    רזולוציית התמונה:
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => setPngScale(1)}
                      className={`py-1.5 text-xs rounded-lg border ${
                        pngScale === 1 ? 'bg-stone-900 text-white' : 'bg-white text-stone-700 border-stone-200'
                      }`}
                    >
                      1x (מסך)
                    </button>
                    <button
                      onClick={() => setPngScale(2)}
                      className={`py-1.5 text-xs rounded-lg border ${
                        pngScale === 2 ? 'bg-stone-900 text-white' : 'bg-white text-stone-700 border-stone-200'
                      }`}
                    >
                      2x (איכותי)
                    </button>
                    <button
                      onClick={() => setPngScale(3)}
                      className={`py-1.5 text-xs rounded-lg border ${
                        pngScale === 3 ? 'bg-stone-900 text-white' : 'bg-white text-stone-700 border-stone-200'
                      }`}
                    >
                      3x (דפוס מקצועי)
                    </button>
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

            {(exportType === 'a4-single' || exportType === 'a4-multi') && (
              <div className="space-y-3 pt-1 border-t border-stone-100">
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    כיוון הדף:
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => setA4Orientation('auto')}
                      className={`py-1.5 text-xs rounded-lg border ${
                        a4Orientation === 'auto' ? 'bg-stone-900 text-white' : 'bg-white text-stone-700 border-stone-200'
                      }`}
                    >
                      אוטומטי
                    </button>
                    <button
                      onClick={() => setA4Orientation('landscape')}
                      className={`py-1.5 text-xs rounded-lg border ${
                        a4Orientation === 'landscape' ? 'bg-stone-900 text-white' : 'bg-white text-stone-700 border-stone-200'
                      }`}
                    >
                      לרוחב
                    </button>
                    <button
                      onClick={() => setA4Orientation('portrait')}
                      className={`py-1.5 text-xs rounded-lg border ${
                        a4Orientation === 'portrait' ? 'bg-stone-900 text-white' : 'bg-white text-stone-700 border-stone-200'
                      }`}
                    >
                      לאורך
                    </button>
                  </div>
                </div>

                {/* Readability Notice for Single A4 */}
                {exportType === 'a4-single' && isScaleTooSmall && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold">
                      <AlertTriangle className="w-4 h-4 text-amber-700" />
                      <span>חיווי גודל טקסט: קנה מידה קטן</span>
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      העץ גדול והטקסט יוקטן משמעותית כדי להיכנס לדף A4 בודד ({Math.round(singleA4ScaleFactor * 100)}%).
                      מומלץ לשקול מעבר ל<strong>תצוגה מקוצרת (שמות בלבד)</strong> או ל<strong>הדפסה רב־עמודית</strong>.
                    </p>
                    <button
                      onClick={() => setSelectedView('compact-vertical')}
                      className="text-[11px] font-bold text-amber-800 underline hover:text-amber-950"
                    >
                      עבור לתצוגת שמות בלבד
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column (Live Preview): 7 cols */}
          <div className="md:col-span-7 bg-stone-100 rounded-xl p-4 flex flex-col items-center justify-center border border-stone-200 min-h-[300px]">
            <div className="text-[11px] text-stone-500 font-mono mb-2 self-start flex items-center justify-between w-full">
              <span>תצוגה מקדימה של הפריסה המלאה</span>
              <span>
                {fullLayout.nodes.length} אנשים | {Math.round(fullLayout.bounds.width)}x{Math.round(fullLayout.bounds.height)}px
              </span>
            </div>

            <div className="relative max-w-full max-h-[360px] overflow-auto bg-white p-2 rounded-lg shadow-inner border border-stone-200 flex items-center justify-center">
              <canvas
                ref={previewCanvasRef}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center justify-between">
          <div className="text-xs text-stone-500 font-mono">
            {isGenerating && <span className="text-amber-700 font-bold">{generationProgress}</span>}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs text-stone-600 hover:bg-stone-200 rounded-lg transition-colors"
            >
              סגור
            </button>

            {exportType === 'png' && (
              <button
                onClick={handleExportPNG}
                disabled={isGenerating}
                className="px-4 py-2 text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>הורד תמונת PNG מלאה</span>
              </button>
            )}

            {exportType === 'a4-single' && (
              <>
                <button
                  onClick={handleBrowserPrint}
                  className="px-3 py-2 text-xs font-medium text-stone-700 bg-white border border-stone-300 hover:bg-stone-100 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>הדפסה</span>
                </button>
                <button
                  onClick={handleExportSingleA4}
                  disabled={isGenerating}
                  className="px-4 py-2 text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>הורד PDF (עמוד A4 יחיד)</span>
                </button>
              </>
            )}

            {exportType === 'a4-multi' && (
              <>
                <button
                  onClick={handleBrowserPrint}
                  className="px-3 py-2 text-xs font-medium text-stone-700 bg-white border border-stone-300 hover:bg-stone-100 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>הדפסה</span>
                </button>
                <button
                  onClick={handleExportMultiPageA4}
                  disabled={isGenerating}
                  className="px-4 py-2 text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
                >
                  <Download className="w-3.5 h-3.5" />
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
