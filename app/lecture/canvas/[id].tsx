import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, PanResponder,
  Dimensions, Alert, Platform, TextInput, ScrollView, Modal,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, G, Rect, Ellipse, Line, Polygon } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from '@/lib/haptics';
import { useColors } from '@/hooks/useColors';
import {
  getLecture, updateLecture, Stroke, LecturePage,
  CanvasShape, TextBox, PageTemplate, ShapeType,
} from '@/lib/storage';
import { analyzeHandwriting } from '@/lib/ai';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

type DrawTool = 'pen' | 'pencil' | 'highlighter' | 'eraser';
type ToolMode = 'draw' | 'shape' | 'text';

const COLORS = ['#F1F5F9', '#4F8EF7', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4'];
const DRAW_WIDTHS: Record<DrawTool, number> = { pen: 2, pencil: 1.5, highlighter: 12, eraser: 20 };
const SHAPES: { type: ShapeType; icon: string; label: string }[] = [
  { type: 'rect', icon: 'square-outline', label: 'مربع' },
  { type: 'circle', icon: 'ellipse-outline', label: 'دائرة' },
  { type: 'line', icon: 'remove-outline', label: 'خط' },
  { type: 'arrow', icon: 'arrow-forward-outline', label: 'سهم' },
  { type: 'triangle', icon: 'triangle-outline', label: 'مثلث' },
];
const TEMPLATES: { type: PageTemplate; label: string; icon: string }[] = [
  { type: 'blank', label: 'فارغ', icon: 'square-outline' },
  { type: 'cornell', label: 'كورنيل', icon: 'grid-outline' },
  { type: 'math', label: 'رياضيات', icon: 'calculator-outline' },
  { type: 'lined', label: 'مسطّر', icon: 'reorder-four-outline' },
  { type: 'timeline', label: 'جدول زمني', icon: 'time-outline' },
];

function uid() { return Date.now().toString() + Math.random().toString(36).substr(2, 9); }

function pointsToPath(points: number[]): string {
  if (points.length < 4) return '';
  let d = `M ${points[0]} ${points[1]}`;
  for (let i = 2; i < points.length - 2; i += 2) {
    const mx = (points[i] + points[i + 2]) / 2;
    const my = (points[i + 1] + points[i + 3]) / 2;
    d += ` Q ${points[i]} ${points[i + 1]} ${mx} ${my}`;
  }
  return d;
}

function renderShape(shape: CanvasShape, isPreview = false) {
  const { x1, y1, x2, y2, color, strokeWidth } = shape;
  const opacity = isPreview ? 0.6 : 1;
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);
  const key = shape.id;

  switch (shape.type) {
    case 'rect':
      return <Rect key={key} x={x} y={y} width={w} height={h}
        stroke={color} strokeWidth={strokeWidth} fill="none" opacity={opacity} />;
    case 'circle':
      return <Ellipse key={key} cx={(x1 + x2) / 2} cy={(y1 + y2) / 2}
        rx={w / 2} ry={h / 2}
        stroke={color} strokeWidth={strokeWidth} fill="none" opacity={opacity} />;
    case 'line':
      return <Line key={key} x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={color} strokeWidth={strokeWidth} opacity={opacity} />;
    case 'arrow': {
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const len = 12;
      const ax1 = x2 - len * Math.cos(angle - Math.PI / 6);
      const ay1 = y2 - len * Math.sin(angle - Math.PI / 6);
      const ax2 = x2 - len * Math.cos(angle + Math.PI / 6);
      const ay2 = y2 - len * Math.sin(angle + Math.PI / 6);
      const d = `M ${x1} ${y1} L ${x2} ${y2} M ${ax1} ${ay1} L ${x2} ${y2} L ${ax2} ${ay2}`;
      return <Path key={key} d={d} stroke={color} strokeWidth={strokeWidth}
        strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={opacity} />;
    }
    case 'triangle': {
      const pts = `${(x1 + x2) / 2},${y1} ${x2},${y2} ${x1},${y2}`;
      return <Polygon key={key} points={pts} stroke={color} strokeWidth={strokeWidth}
        fill="none" opacity={opacity} />;
    }
    default:
      return null;
  }
}

function renderTemplate(type: PageTemplate, w: number, h: number, fgColor: string) {
  switch (type) {
    case 'blank':
      return null;

    case 'cornell': {
      const cueX = w * 0.28;
      const summaryY = h * 0.78;
      return (
        <G opacity={0.12}>
          <Line x1={cueX} y1={0} x2={cueX} y2={summaryY} stroke={fgColor} strokeWidth={1} />
          <Line x1={0} y1={summaryY} x2={w} y2={summaryY} stroke={fgColor} strokeWidth={1} />
          {Array.from({ length: Math.ceil(summaryY / 30) }).map((_, i) => (
            i > 0 && <Line key={`h${i}`} x1={cueX + 2} y1={i * 30} x2={w} y2={i * 30}
              stroke={fgColor} strokeWidth={0.5} strokeDasharray="4,8" />
          ))}
        </G>
      );
    }

    case 'math': {
      const grid = 20;
      return (
        <G opacity={0.1}>
          {Array.from({ length: Math.ceil(h / grid) }).map((_, i) => (
            <Line key={`mh${i}`} x1={0} y1={i * grid} x2={w} y2={i * grid}
              stroke={fgColor} strokeWidth={0.5} />
          ))}
          {Array.from({ length: Math.ceil(w / grid) }).map((_, i) => (
            <Line key={`mv${i}`} x1={i * grid} y1={0} x2={i * grid} y2={h}
              stroke={fgColor} strokeWidth={0.5} />
          ))}
          {Array.from({ length: Math.ceil(h / 100) }).map((_, i) =>
            Array.from({ length: Math.ceil(w / 100) }).map((_, j) => (
              <Line key={`mH${i}-${j}`}
                x1={j * 100} y1={i * 100} x2={(j + 1) * 100} y2={i * 100}
                stroke={fgColor} strokeWidth={1} />
            ))
          )}
        </G>
      );
    }

    case 'lined': {
      const spacing = 32;
      return (
        <G opacity={0.1}>
          {Array.from({ length: Math.ceil(h / spacing) }).map((_, i) => (
            i > 0 && <Line key={`l${i}`} x1={0} y1={i * spacing} x2={w} y2={i * spacing}
              stroke={fgColor} strokeWidth={0.8} />
          ))}
          <Line x1={w * 0.88} y1={0} x2={w * 0.88} y2={h}
            stroke="#EF4444" strokeWidth={0.8} opacity={0.4} />
        </G>
      );
    }

    case 'timeline': {
      const cx = w / 2;
      const step = 80;
      return (
        <G opacity={0.12}>
          <Line x1={cx} y1={20} x2={cx} y2={h - 20} stroke={fgColor} strokeWidth={2} />
          {Array.from({ length: Math.floor(h / step) }).map((_, i) => (
            <G key={`t${i}`}>
              <Line x1={cx - 20} y1={(i + 1) * step} x2={cx + 20} y2={(i + 1) * step}
                stroke={fgColor} strokeWidth={1.5} />
            </G>
          ))}
        </G>
      );
    }

    default:
      return null;
  }
}

export default function CanvasScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  // Canvas data
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [shapes, setShapes] = useState<CanvasShape[]>([]);
  const [textBoxes, setTextBoxes] = useState<TextBox[]>([]);
  const [template, setTemplate] = useState<PageTemplate>('blank');
  const [pageId, setPageId] = useState('');
  const [saved, setSaved] = useState(true);

  // Tool state
  const [mode, setMode] = useState<ToolMode>('draw');
  const [drawTool, setDrawTool] = useState<DrawTool>('pen');
  const [shapeTool, setShapeTool] = useState<ShapeType>('rect');
  const [penColor, setPenColor] = useState(COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(2);

  // UI state
  const [showColors, setShowColors] = useState(false);
  const [showShapes, setShowShapes] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  // Shape preview
  const [currentPoints, setCurrentPoints] = useState<number[]>([]);
  const [shapePreview, setShapePreview] = useState<CanvasShape | null>(null);

  // AI
  const [aiLoading, setAiLoading] = useState(false);
  const [aiModal, setAiModal] = useState(false);
  const [aiResult, setAiResult] = useState('');

  // Refs for stale closure avoidance
  const modeRef = useRef<ToolMode>('draw');
  const drawToolRef = useRef<DrawTool>('pen');
  const shapeToolRef = useRef<ShapeType>('rect');
  const penColorRef = useRef<string>(COLORS[0]);
  const strokeWidthRef = useRef<number>(2);
  const strokesRef = useRef<Stroke[]>([]);
  const shapesRef = useRef<CanvasShape[]>([]);
  const textBoxesRef = useRef<TextBox[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { drawToolRef.current = drawTool; }, [drawTool]);
  useEffect(() => { shapeToolRef.current = shapeTool; }, [shapeTool]);
  useEffect(() => { penColorRef.current = penColor; }, [penColor]);
  useEffect(() => { strokeWidthRef.current = strokeWidth; }, [strokeWidth]);

  useEffect(() => {
    if (!id) return;
    getLecture(id).then(l => {
      if (!l) return;
      const page = l.pages[0];
      if (page) {
        setStrokes(page.strokes || []);
        setShapes(page.shapes || []);
        setTextBoxes(page.textBoxes || []);
        setTemplate(page.type || 'blank');
        strokesRef.current = page.strokes || [];
        shapesRef.current = page.shapes || [];
        textBoxesRef.current = page.textBoxes || [];
        setPageId(page.id);
      }
    });
  }, [id]);

  const scheduleAutoSave = useCallback(() => {
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (!id || !pageId) return;
      const l = await getLecture(id);
      if (!l) return;
      const pages = l.pages.map((p: LecturePage) =>
        p.id === pageId
          ? { ...p, strokes: strokesRef.current, shapes: shapesRef.current, textBoxes: textBoxesRef.current }
          : p
      );
      await updateLecture(id, { pages });
      setSaved(true);
    }, 1500);
  }, [id, pageId]);

  const saveTemplate = useCallback(async (tmpl: PageTemplate) => {
    if (!id || !pageId) return;
    const l = await getLecture(id);
    if (!l) return;
    const pages = l.pages.map((p: LecturePage) =>
      p.id === pageId ? { ...p, type: tmpl } : p
    );
    await updateLecture(id, { pages });
  }, [id, pageId]);

  // ── PanResponder ───────────────────────────────────────────────────
  const shapeStartRef = useRef<{ x: number; y: number } | null>(null);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        const m = modeRef.current;
        if (m === 'draw') {
          setCurrentPoints([x, y]);
        } else if (m === 'shape') {
          shapeStartRef.current = { x, y };
          setShapePreview(null);
        } else if (m === 'text') {
          // Create text box on tap
          const tb: TextBox = {
            id: uid(), text: '',
            x, y, width: 180, height: 44,
            fontSize: 15, color: penColorRef.current,
          };
          textBoxesRef.current = [...textBoxesRef.current, tb];
          setTextBoxes([...textBoxesRef.current]);
          setEditingTextId(tb.id);
          scheduleAutoSave();
        }
      },

      onPanResponderMove: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        const m = modeRef.current;
        if (m === 'draw') {
          setCurrentPoints(prev => [...prev, x, y]);
        } else if (m === 'shape' && shapeStartRef.current) {
          const preview: CanvasShape = {
            id: 'preview',
            type: shapeToolRef.current,
            x1: shapeStartRef.current.x, y1: shapeStartRef.current.y,
            x2: x, y2: y,
            color: penColorRef.current,
            strokeWidth: strokeWidthRef.current,
            filled: false,
          };
          setShapePreview(preview);
        }
      },

      onPanResponderRelease: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        const m = modeRef.current;

        if (m === 'draw') {
          setCurrentPoints(prev => {
            if (prev.length < 4) return [];
            const tool = drawToolRef.current;
            const color = penColorRef.current;
            const width = tool === 'highlighter' ? 12 : strokeWidthRef.current;
            if (tool === 'eraser') {
              strokesRef.current = strokesRef.current.slice(0, -1);
              setStrokes([...strokesRef.current]);
            } else {
              const stroke: Stroke = {
                id: uid(), points: prev,
                color: tool === 'highlighter' ? color + '55' : color,
                width, tool,
              };
              strokesRef.current = [...strokesRef.current, stroke];
              setStrokes([...strokesRef.current]);
            }
            scheduleAutoSave();
            return [];
          });
        } else if (m === 'shape' && shapeStartRef.current) {
          const start = shapeStartRef.current;
          const dx = Math.abs(x - start.x);
          const dy = Math.abs(y - start.y);
          if (dx > 5 || dy > 5) {
            const shape: CanvasShape = {
              id: uid(),
              type: shapeToolRef.current,
              x1: start.x, y1: start.y, x2: x, y2: y,
              color: penColorRef.current,
              strokeWidth: strokeWidthRef.current,
              filled: false,
            };
            shapesRef.current = [...shapesRef.current, shape];
            setShapes([...shapesRef.current]);
            scheduleAutoSave();
          }
          shapeStartRef.current = null;
          setShapePreview(null);
        }
      },
    })
  ).current;

  // ── Actions ────────────────────────────────────────────────────────
  const undo = async () => {
    await Haptics.selectionAsync();
    if (modeRef.current === 'shape' && shapesRef.current.length > 0) {
      shapesRef.current = shapesRef.current.slice(0, -1);
      setShapes([...shapesRef.current]);
    } else if (strokesRef.current.length > 0) {
      strokesRef.current = strokesRef.current.slice(0, -1);
      setStrokes([...strokesRef.current]);
    }
    scheduleAutoSave();
  };

  const clearAll = () => {
    Alert.alert('مسح الكل', 'هل تريد مسح جميع الرسومات؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'مسح', style: 'destructive', onPress: async () => {
          strokesRef.current = [];
          shapesRef.current = [];
          textBoxesRef.current = [];
          setStrokes([]);
          setShapes([]);
          setTextBoxes([]);
          scheduleAutoSave();
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        },
      },
    ]);
  };

  const changeTemplate = (tmpl: PageTemplate) => {
    setTemplate(tmpl);
    setShowTemplates(false);
    saveTemplate(tmpl);
    Haptics.selectionAsync();
  };

  // ── AI: Canvas to text ─────────────────────────────────────────────
  const analyzeCanvas = async () => {
    setAiModal(true);
    setAiResult('');
    setAiLoading(true);
    try {
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const svgEl = document.querySelector('[data-canvas-svg]') as SVGSVGElement | null;
        if (svgEl) {
          const svgData = new XMLSerializer().serializeToString(svgEl);
          const canvas = document.createElement('canvas');
          canvas.width = SCREEN_W;
          canvas.height = canvasH;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#0D1321';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await new Promise<void>((resolve) => {
              const img = new window.Image();
              const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              img.onload = () => { ctx.drawImage(img, 0, 0); URL.revokeObjectURL(url); resolve(); };
              img.onerror = () => resolve();
              img.src = url;
            });
            const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
            if (base64) {
              const result = await analyzeHandwriting(base64);
              setAiResult(result);
              setAiLoading(false);
              return;
            }
          }
        }
      }
      setAiResult('تحليل اللوحة متاح فقط على المتصفح. للاستخدام على الجهاز، التقط صورة للكتابة واستخدم التحليل من شاشة المحاضرة.');
    } catch {
      setAiResult('تعذّر تحليل اللوحة. تأكد من وجود كتابة وإعداد مفتاح الذكاء الاصطناعي.');
    } finally {
      setAiLoading(false);
    }
  };

  const addResultToTranscript = async () => {
    if (!id || !aiResult) return;
    const l = await getLecture(id);
    if (!l) return;
    const current = l.transcript ?? '';
    await updateLecture(id, {
      transcript: current ? `${current}\n\n${aiResult}` : aiResult,
    });
    setAiModal(false);
    Alert.alert('تمّ', 'تمت إضافة النص إلى نص المحاضرة');
  };

  const canvasH = SCREEN_H - insets.top - (Platform.OS === 'web' ? 160 : 140);
  const s = styles(colors);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>لوحة الكتابة</Text>
        <View style={s.headerRight}>
          <TouchableOpacity style={s.headerBtn} onPress={() => setShowTemplates(true)}>
            <Ionicons name="grid" size={18} color={colors.muted} />
          </TouchableOpacity>
          <TouchableOpacity style={s.headerBtn} onPress={analyzeCanvas}>
            <Ionicons name="sparkles" size={18} color={colors.accent} />
          </TouchableOpacity>
          {!saved
            ? <Text style={s.savingText}>حفظ...</Text>
            : <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
          }
        </View>
      </View>

      {/* Toolbar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.toolbar}
        contentContainerStyle={s.toolbarContent}
      >
        {/* Mode: Draw */}
        <View style={s.toolGroup}>
          {(['pen', 'pencil', 'highlighter', 'eraser'] as DrawTool[]).map(t => (
            <TouchableOpacity
              key={t}
              style={[s.toolBtn, mode === 'draw' && drawTool === t && s.toolActive]}
              onPress={() => { setMode('draw'); setDrawTool(t); setShowShapes(false); Haptics.selectionAsync(); }}
            >
              <Ionicons
                name={t === 'pen' ? 'create' : t === 'pencil' ? 'pencil' : t === 'highlighter' ? 'brush' : 'square'}
                size={18}
                color={mode === 'draw' && drawTool === t ? colors.primary : colors.mutedForeground}
              />
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.divider} />

        {/* Mode: Shapes */}
        <TouchableOpacity
          style={[s.toolBtn, mode === 'shape' && s.toolActive]}
          onPress={() => {
            setMode('shape');
            setShowShapes(!showShapes);
            setShowColors(false);
            Haptics.selectionAsync();
          }}
        >
          <Ionicons
            name="shapes-outline"
            size={18}
            color={mode === 'shape' ? colors.primary : colors.mutedForeground}
          />
        </TouchableOpacity>

        {/* Mode: Text */}
        <TouchableOpacity
          style={[s.toolBtn, mode === 'text' && s.toolActive]}
          onPress={() => { setMode('text'); setShowShapes(false); Haptics.selectionAsync(); }}
        >
          <Ionicons
            name="text"
            size={18}
            color={mode === 'text' ? colors.primary : colors.mutedForeground}
          />
        </TouchableOpacity>

        <View style={s.divider} />

        {/* Color */}
        <TouchableOpacity
          style={[s.colorBtn, { backgroundColor: penColor }]}
          onPress={() => { setShowColors(!showColors); setShowShapes(false); }}
        />

        {/* Width */}
        {[1.5, 2.5, 4].map(w => (
          <TouchableOpacity
            key={w}
            style={[s.widthBtn, strokeWidth === w && s.widthBtnActive]}
            onPress={() => { setStrokeWidth(w); Haptics.selectionAsync(); }}
          >
            <View style={[s.widthDot, { width: w * 3, height: w * 3, borderRadius: w * 3 }]} />
          </TouchableOpacity>
        ))}

        <View style={s.divider} />

        {/* Undo / Clear */}
        <TouchableOpacity style={s.toolBtn} onPress={undo}>
          <Ionicons name="arrow-undo" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
        <TouchableOpacity style={s.toolBtn} onPress={clearAll}>
          <Ionicons name="trash" size={18} color={colors.accentDanger} />
        </TouchableOpacity>
      </ScrollView>

      {/* Color palette */}
      {showColors && (
        <View style={s.palette}>
          {COLORS.map(c => (
            <TouchableOpacity
              key={c}
              onPress={() => { setPenColor(c); setShowColors(false); }}
              style={[s.paletteDot, { backgroundColor: c }, penColor === c && s.paletteDotActive]}
            />
          ))}
        </View>
      )}

      {/* Shape selector */}
      {showShapes && (
        <View style={s.palette}>
          {SHAPES.map(sh => (
            <TouchableOpacity
              key={sh.type}
              style={[s.shapeBtn, shapeTool === sh.type && s.shapeBtnActive]}
              onPress={() => { setShapeTool(sh.type); setShowShapes(false); Haptics.selectionAsync(); }}
            >
              <Ionicons
                name={sh.icon as any}
                size={20}
                color={shapeTool === sh.type ? colors.primary : colors.mutedForeground}
              />
              <Text style={[s.shapeBtnText, shapeTool === sh.type && { color: colors.primary }]}>
                {sh.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Mode indicator */}
      {mode === 'text' && (
        <View style={s.modeHint}>
          <Ionicons name="information-circle" size={14} color={colors.primary} />
          <Text style={s.modeHintText}>اضغط على اللوحة لإضافة مربع نص</Text>
        </View>
      )}
      {mode === 'shape' && (
        <View style={s.modeHint}>
          <Ionicons name="information-circle" size={14} color={colors.accent} />
          <Text style={[s.modeHintText, { color: colors.accent }]}>
            اسحب لرسم {SHAPES.find(s => s.type === shapeTool)?.label}
          </Text>
        </View>
      )}

      {/* Canvas */}
      <View style={[s.canvas, { height: canvasH }]} {...panResponder.panHandlers}>
        <Svg
          style={StyleSheet.absoluteFill}
          width={SCREEN_W}
          height={canvasH}
          {...(Platform.OS === 'web' ? { 'data-canvas-svg': 'true' } : {})}
        >
          {/* Template background */}
          {renderTemplate(template, SCREEN_W, canvasH, colors.foreground)}

          {/* Default grid for blank */}
          {template === 'blank' && (
            <G opacity={0.06}>
              {Array.from({ length: Math.ceil(canvasH / 30) }).map((_, i) => (
                <Path key={`h${i}`} d={`M 0 ${i * 30} L ${SCREEN_W} ${i * 30}`}
                  stroke={colors.foreground} strokeWidth={0.5} />
              ))}
              {Array.from({ length: Math.ceil(SCREEN_W / 30) }).map((_, i) => (
                <Path key={`v${i}`} d={`M ${i * 30} 0 L ${i * 30} ${canvasH}`}
                  stroke={colors.foreground} strokeWidth={0.5} />
              ))}
            </G>
          )}

          {/* Saved strokes */}
          {strokes.map(stroke => (
            <Path
              key={stroke.id}
              d={pointsToPath(stroke.points)}
              stroke={stroke.color}
              strokeWidth={stroke.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}

          {/* Current stroke */}
          {currentPoints.length >= 4 && (
            <Path
              d={pointsToPath(currentPoints)}
              stroke={drawTool === 'highlighter' ? penColor + '55' : penColor}
              strokeWidth={drawTool === 'highlighter' ? 12 : strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          )}

          {/* Saved shapes */}
          {shapes.map(shape => renderShape(shape))}

          {/* Shape preview */}
          {shapePreview && renderShape(shapePreview, true)}
        </Svg>

        {/* Text boxes overlay */}
        {textBoxes.map(tb => (
          <TextBoxView
            key={tb.id}
            tb={tb}
            isEditing={editingTextId === tb.id}
            colors={colors}
            onFocus={() => setEditingTextId(tb.id)}
            onBlur={() => setEditingTextId(null)}
            onChange={(text) => {
              textBoxesRef.current = textBoxesRef.current.map(t =>
                t.id === tb.id ? { ...t, text } : t
              );
              setTextBoxes([...textBoxesRef.current]);
              scheduleAutoSave();
            }}
            onDelete={() => {
              textBoxesRef.current = textBoxesRef.current.filter(t => t.id !== tb.id);
              setTextBoxes([...textBoxesRef.current]);
              setEditingTextId(null);
              scheduleAutoSave();
            }}
            onMove={(dx, dy) => {
              textBoxesRef.current = textBoxesRef.current.map(t =>
                t.id === tb.id ? { ...t, x: t.x + dx, y: t.y + dy } : t
              );
              setTextBoxes([...textBoxesRef.current]);
              scheduleAutoSave();
            }}
          />
        ))}
      </View>

      {/* Template Modal */}
      <Modal visible={showTemplates} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>قالب الصفحة</Text>
              <TouchableOpacity onPress={() => setShowTemplates(false)}>
                <Ionicons name="close" size={22} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            <View style={s.templateGrid}>
              {TEMPLATES.map(t => (
                <TouchableOpacity
                  key={t.type}
                  style={[s.templateBtn, template === t.type && s.templateBtnActive]}
                  onPress={() => changeTemplate(t.type)}
                >
                  <Ionicons
                    name={t.icon as any}
                    size={28}
                    color={template === t.type ? colors.primary : colors.muted}
                  />
                  <Text style={[s.templateLabel, template === t.type && { color: colors.primary }]}>
                    {t.label}
                  </Text>
                  {template === t.type && (
                    <Ionicons name="checkmark-circle" size={16} color={colors.primary} style={s.templateCheck} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* AI Result Modal */}
      <Modal visible={aiModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>تحليل الكتابة بالذكاء الاصطناعي</Text>
              <TouchableOpacity onPress={() => setAiModal(false)}>
                <Ionicons name="close" size={22} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            {aiLoading ? (
              <View style={{ alignItems: 'center', padding: 30, gap: 10 }}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={s.modalHint}>يحلّل الكتابة...</Text>
              </View>
            ) : (
              <>
                <ScrollView style={{ maxHeight: 260 }}>
                  <Text style={s.modalText}>{aiResult}</Text>
                </ScrollView>
                {!!aiResult && !aiResult.startsWith('تحليل اللوحة متاح') && (
                  <TouchableOpacity style={s.modalAction} onPress={addResultToTranscript}>
                    <Ionicons name="add-circle" size={18} color="#fff" />
                    <Text style={s.modalActionText}>إضافة إلى نص المحاضرة</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── TextBox Component ──────────────────────────────────────────────────
interface TextBoxViewProps {
  tb: TextBox;
  isEditing: boolean;
  colors: any;
  onFocus: () => void;
  onBlur: () => void;
  onChange: (text: string) => void;
  onDelete: () => void;
  onMove: (dx: number, dy: number) => void;
}

function TextBoxView({ tb, isEditing, colors, onFocus, onBlur, onChange, onDelete, onMove }: TextBoxViewProps) {
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const dragResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        lastPos.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
      },
      onPanResponderMove: (e) => {
        if (!lastPos.current) return;
        const dx = e.nativeEvent.pageX - lastPos.current.x;
        const dy = e.nativeEvent.pageY - lastPos.current.y;
        lastPos.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
        onMove(dx, dy);
      },
      onPanResponderRelease: () => { lastPos.current = null; },
    })
  ).current;

  return (
    <View
      style={{
        position: 'absolute',
        left: tb.x,
        top: tb.y,
        width: tb.width,
        minHeight: tb.height,
        borderWidth: isEditing ? 1 : 0,
        borderColor: colors.primary + '80',
        borderRadius: 6,
        backgroundColor: isEditing ? colors.surface + 'CC' : 'transparent',
      }}
    >
      {isEditing && (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <TouchableOpacity
            {...dragResponder.panHandlers}
            style={{ padding: 4, backgroundColor: colors.surfaceElevated, borderRadius: 4 }}
          >
            <Ionicons name="move" size={12} color={colors.muted} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onDelete}
            style={{ padding: 4, backgroundColor: colors.surfaceElevated, borderRadius: 4, marginLeft: 2 }}
          >
            <Ionicons name="close" size={12} color={colors.accentDanger} />
          </TouchableOpacity>
        </View>
      )}
      <TextInput
        value={tb.text}
        onChangeText={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        multiline
        placeholder="نص..."
        placeholderTextColor={colors.mutedForeground}
        style={{
          fontFamily: 'Tajawal_400Regular',
          fontSize: tb.fontSize,
          color: tb.color,
          padding: 4,
          minHeight: 30,
          textAlign: 'right',
        }}
      />
    </View>
  );
}

const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: c.border,
  },
  backBtn: { padding: 4, marginRight: 6 },
  headerTitle: { flex: 1, fontFamily: 'Tajawal_700Bold', fontSize: 18, color: c.foreground },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerBtn: {
    padding: 7, backgroundColor: c.surface, borderRadius: 9,
    borderWidth: 1, borderColor: c.border,
  },
  savingText: { fontFamily: 'Tajawal_400Regular', fontSize: 12, color: c.muted },
  toolbar: {
    maxHeight: 54, backgroundColor: c.surface,
    borderBottomWidth: 1, borderBottomColor: c.border,
  },
  toolbarContent: {
    flexDirection: 'row', alignItems: 'center',
    gap: 4, paddingHorizontal: 10, paddingVertical: 8,
  },
  toolGroup: { flexDirection: 'row', gap: 3 },
  toolBtn: {
    width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
  },
  toolActive: { borderColor: c.primary, backgroundColor: c.primary + '15' },
  divider: { width: 1, height: 28, backgroundColor: c.border, marginHorizontal: 4 },
  colorBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#fff' },
  widthBtn: {
    width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
  },
  widthBtnActive: { borderColor: c.primary, backgroundColor: c.primary + '15' },
  widthDot: { backgroundColor: '#fff' },
  palette: {
    flexDirection: 'row', gap: 8, padding: 10,
    backgroundColor: c.surfaceElevated,
    borderBottomWidth: 1, borderBottomColor: c.border,
    justifyContent: 'center', flexWrap: 'wrap',
  },
  paletteDot: { width: 28, height: 28, borderRadius: 14 },
  paletteDotActive: { borderWidth: 3, borderColor: '#fff' },
  shapeBtn: {
    alignItems: 'center', gap: 2, padding: 8, borderRadius: 10,
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border, minWidth: 56,
  },
  shapeBtnActive: { borderColor: c.primary, backgroundColor: c.primary + '15' },
  shapeBtnText: { fontFamily: 'Tajawal_400Regular', fontSize: 10, color: c.mutedForeground },
  modeHint: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 5,
    backgroundColor: c.primary + '10',
  },
  modeHintText: { fontFamily: 'Tajawal_400Regular', fontSize: 12, color: c.primary },
  canvas: { flex: 1, backgroundColor: '#0D1321', overflow: 'hidden' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: c.surfaceElevated, borderTopLeftRadius: 20,
    borderTopRightRadius: 20, padding: 20, gap: 16,
    borderTopWidth: 1, borderTopColor: c.border,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontFamily: 'Tajawal_700Bold', fontSize: 16, color: c.foreground },
  modalHint: { fontFamily: 'Tajawal_400Regular', fontSize: 13, color: c.muted },
  modalText: {
    fontFamily: 'Tajawal_400Regular', fontSize: 14, color: c.foreground,
    lineHeight: 22, textAlign: 'right',
  },
  modalAction: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: c.primary, borderRadius: 12, padding: 12, justifyContent: 'center',
  },
  modalActionText: { fontFamily: 'Tajawal_700Bold', fontSize: 14, color: '#fff' },
  templateGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center',
    paddingBottom: 10,
  },
  templateBtn: {
    width: 90, alignItems: 'center', gap: 6, padding: 12, borderRadius: 12,
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
  },
  templateBtnActive: { borderColor: c.primary, backgroundColor: c.primary + '10' },
  templateLabel: { fontFamily: 'Tajawal_500Medium', fontSize: 12, color: c.muted },
  templateCheck: { position: 'absolute', top: 4, right: 4 },
});
