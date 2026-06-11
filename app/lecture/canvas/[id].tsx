import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, PanResponder,
  Dimensions, Alert, Platform, TextInput, ScrollView, Modal,
  ActivityIndicator, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, G, Rect, Ellipse, Line, Polygon, Circle } from 'react-native-svg';
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

const DRAW_COLORS = [
  '#F1F5F9', '#000000', '#4F8EF7', '#60A5FA', '#10B981', '#34D399',
  '#F59E0B', '#FBBF24', '#EF4444', '#F87171', '#8B5CF6', '#A78BFA',
  '#EC4899', '#F472B6', '#06B6D4', '#67E8F9',
];

const SHAPES: { type: ShapeType; icon: string; label: string }[] = [
  { type: 'rect', icon: 'square-outline', label: 'مربع' },
  { type: 'circle', icon: 'ellipse-outline', label: 'دائرة' },
  { type: 'line', icon: 'remove-outline', label: 'خط' },
  { type: 'arrow', icon: 'arrow-forward-outline', label: 'سهم' },
  { type: 'triangle', icon: 'triangle-outline', label: 'مثلث' },
];

const TEMPLATES: { type: PageTemplate; label: string; icon: string }[] = [
  { type: 'blank',      label: 'فارغ',       icon: 'square-outline' },
  { type: 'grid',       label: 'شبكة',       icon: 'grid-outline' },
  { type: 'lined',      label: 'مسطّر',      icon: 'reorder-four-outline' },
  { type: 'cornell',    label: 'كورنيل',     icon: 'browsers-outline' },
  { type: 'math',       label: 'رياضيات',    icon: 'calculator-outline' },
  { type: 'dotted',     label: 'نقطي',       icon: 'ellipse-outline' },
  { type: 'isometric',  label: 'إيزومتري',   icon: 'prism-outline' },
  { type: 'music',      label: 'موسيقى',     icon: 'musical-notes-outline' },
  { type: 'bullet',     label: 'قوائم',      icon: 'list-outline' },
  { type: 'weekly',     label: 'أسبوعي',     icon: 'calendar-outline' },
  { type: 'timeline',   label: 'جدول زمني',  icon: 'time-outline' },
  { type: 'hexagonal',  label: 'سداسي',      icon: 'shapes-outline' },
];

const CANVAS_BACKGROUNDS = [
  { key: 'navy',    color: '#0D1321', label: 'كحلي' },
  { key: 'black',   color: '#050505', label: 'أسود' },
  { key: 'white',   color: '#FFFFFF', label: 'أبيض' },
  { key: 'cream',   color: '#FEFCE8', label: 'كريمي' },
  { key: 'chalk',   color: '#1A3A2A', label: 'سبورة' },
  { key: 'teal',    color: '#00303F', label: 'فيروزي' },
  { key: 'gray',    color: '#1E1E1E', label: 'رمادي' },
  { key: 'paper',   color: '#F5F0E8', label: 'ورق' },
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
  const x = Math.min(x1, x2), y = Math.min(y1, y2);
  const w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
  const key = shape.id;
  switch (shape.type) {
    case 'rect':
      return <Rect key={key} x={x} y={y} width={w} height={h} stroke={color} strokeWidth={strokeWidth} fill="none" opacity={opacity} />;
    case 'circle':
      return <Ellipse key={key} cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} rx={w / 2} ry={h / 2} stroke={color} strokeWidth={strokeWidth} fill="none" opacity={opacity} />;
    case 'line':
      return <Line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={strokeWidth} opacity={opacity} />;
    case 'arrow': {
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const len = 14;
      const ax1 = x2 - len * Math.cos(angle - Math.PI / 6);
      const ay1 = y2 - len * Math.sin(angle - Math.PI / 6);
      const ax2 = x2 - len * Math.cos(angle + Math.PI / 6);
      const ay2 = y2 - len * Math.sin(angle + Math.PI / 6);
      return <Path key={key} d={`M ${x1} ${y1} L ${x2} ${y2} M ${ax1} ${ay1} L ${x2} ${y2} L ${ax2} ${ay2}`} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={opacity} />;
    }
    case 'triangle': {
      return <Polygon key={key} points={`${(x1 + x2) / 2},${y1} ${x2},${y2} ${x1},${y2}`} stroke={color} strokeWidth={strokeWidth} fill="none" opacity={opacity} />;
    }
    default: return null;
  }
}

function renderTemplate(type: PageTemplate, w: number, h: number, fgColor: string) {
  switch (type) {
    case 'blank':
      return null;

    case 'grid': {
      const step = 30;
      return (
        <G opacity={0.08}>
          {Array.from({ length: Math.ceil(h / step) }).map((_, i) => (
            <Line key={`h${i}`} x1={0} y1={i * step} x2={w} y2={i * step} stroke={fgColor} strokeWidth={0.5} />
          ))}
          {Array.from({ length: Math.ceil(w / step) }).map((_, i) => (
            <Line key={`v${i}`} x1={i * step} y1={0} x2={i * step} y2={h} stroke={fgColor} strokeWidth={0.5} />
          ))}
        </G>
      );
    }

    case 'lined': {
      const spacing = 32;
      return (
        <G opacity={0.12}>
          {Array.from({ length: Math.ceil(h / spacing) }).map((_, i) => (
            i > 0 && <Line key={`l${i}`} x1={0} y1={i * spacing} x2={w} y2={i * spacing} stroke={fgColor} strokeWidth={0.7} />
          ))}
          <Line x1={w * 0.88} y1={0} x2={w * 0.88} y2={h} stroke="#EF4444" strokeWidth={0.8} opacity={0.35} />
        </G>
      );
    }

    case 'cornell': {
      const cueX = w * 0.28;
      const summaryY = h * 0.78;
      const spacing = 30;
      return (
        <G opacity={0.12}>
          <Line x1={cueX} y1={0} x2={cueX} y2={summaryY} stroke={fgColor} strokeWidth={1} />
          <Line x1={0} y1={summaryY} x2={w} y2={summaryY} stroke={fgColor} strokeWidth={1} />
          {Array.from({ length: Math.ceil(summaryY / spacing) }).map((_, i) => (
            i > 0 && <Line key={`h${i}`} x1={cueX + 2} y1={i * spacing} x2={w} y2={i * spacing} stroke={fgColor} strokeWidth={0.4} strokeDasharray="4,8" />
          ))}
        </G>
      );
    }

    case 'math': {
      const grid = 20;
      return (
        <G opacity={0.1}>
          {Array.from({ length: Math.ceil(h / grid) }).map((_, i) => (
            <Line key={`mh${i}`} x1={0} y1={i * grid} x2={w} y2={i * grid} stroke={fgColor} strokeWidth={i % 5 === 0 ? 0.8 : 0.4} />
          ))}
          {Array.from({ length: Math.ceil(w / grid) }).map((_, i) => (
            <Line key={`mv${i}`} x1={i * grid} y1={0} x2={i * grid} y2={h} stroke={fgColor} strokeWidth={i % 5 === 0 ? 0.8 : 0.4} />
          ))}
        </G>
      );
    }

    case 'dotted': {
      const gap = 28;
      const dots = [];
      for (let row = 1; row < Math.ceil(h / gap); row++) {
        for (let col = 1; col < Math.ceil(w / gap); col++) {
          dots.push(<Circle key={`d${row}-${col}`} cx={col * gap} cy={row * gap} r={1.2} fill={fgColor} opacity={0.25} />);
        }
      }
      return <G>{dots}</G>;
    }

    case 'isometric': {
      const size = 30;
      const rows = Math.ceil(h / (size * 0.866)) + 1;
      const cols = Math.ceil(w / size) + 1;
      const lines = [];
      for (let i = 0; i < rows; i++) {
        const y0 = i * size * 0.866;
        lines.push(<Line key={`iso-h${i}`} x1={0} y1={y0} x2={w} y2={y0} stroke={fgColor} strokeWidth={0.4} opacity={0.1} />);
      }
      for (let i = -rows; i < cols + rows; i++) {
        const x0 = i * size;
        lines.push(<Line key={`iso-r${i}`} x1={x0} y1={0} x2={x0 + rows * size * 0.5} y2={h} stroke={fgColor} strokeWidth={0.4} opacity={0.1} />);
        lines.push(<Line key={`iso-l${i}`} x1={x0} y1={0} x2={x0 - rows * size * 0.5} y2={h} stroke={fgColor} strokeWidth={0.4} opacity={0.1} />);
      }
      return <G>{lines}</G>;
    }

    case 'music': {
      const staffSpacing = 8;
      const groupHeight = 60;
      const groups = Math.floor(h / groupHeight);
      const lines: any[] = [];
      for (let g = 0; g < groups; g++) {
        const baseY = g * groupHeight + 16;
        for (let l = 0; l < 5; l++) {
          lines.push(<Line key={`m${g}-${l}`} x1={10} y1={baseY + l * staffSpacing} x2={w - 10} y2={baseY + l * staffSpacing} stroke={fgColor} strokeWidth={0.8} opacity={0.2} />);
        }
      }
      return <G>{lines}</G>;
    }

    case 'bullet': {
      const rowH = 36;
      const bulletX = 20;
      const lineX = 40;
      const lines: any[] = [];
      for (let i = 1; i < Math.ceil(h / rowH); i++) {
        const y = i * rowH;
        lines.push(<Circle key={`b${i}`} cx={bulletX} cy={y} r={2.5} fill={fgColor} opacity={0.2} />);
        lines.push(<Line key={`bl${i}`} x1={lineX} y1={y} x2={w - 16} y2={y} stroke={fgColor} strokeWidth={0.5} opacity={0.1} />);
      }
      return <G>{lines}</G>;
    }

    case 'weekly': {
      const cols = 7;
      const colW = w / cols;
      const days = ['ن', 'ث', 'ع', 'خ', 'ج', 'س', 'أ'];
      const headerH = 28;
      const lines: any[] = [];
      for (let i = 0; i <= cols; i++) {
        lines.push(<Line key={`wv${i}`} x1={i * colW} y1={0} x2={i * colW} y2={h} stroke={fgColor} strokeWidth={0.6} opacity={0.15} />);
      }
      lines.push(<Line key="wh0" x1={0} y1={headerH} x2={w} y2={headerH} stroke={fgColor} strokeWidth={0.8} opacity={0.2} />);
      const hourStep = (h - headerH) / 12;
      for (let i = 1; i <= 12; i++) {
        lines.push(<Line key={`whr${i}`} x1={0} y1={headerH + i * hourStep} x2={w} y2={headerH + i * hourStep} stroke={fgColor} strokeWidth={0.4} opacity={0.08} />);
      }
      return <G>{lines}</G>;
    }

    case 'timeline': {
      const cx = w / 2;
      const step = 80;
      const lines: any[] = [];
      lines.push(<Line key="tl-main" x1={cx} y1={20} x2={cx} y2={h - 20} stroke={fgColor} strokeWidth={2} opacity={0.15} />);
      for (let i = 0; i < Math.floor(h / step); i++) {
        const y = (i + 1) * step;
        const isLeft = i % 2 === 0;
        lines.push(<Line key={`tl${i}`} x1={cx - 24} y1={y} x2={cx + 24} y2={y} stroke={fgColor} strokeWidth={1.5} opacity={0.18} />);
        lines.push(<Line key={`tla${i}`} x1={isLeft ? cx - 24 : cx + 24} y1={y} x2={isLeft ? 20 : w - 20} y2={y} stroke={fgColor} strokeWidth={0.5} strokeDasharray="4,6" opacity={0.1} />);
      }
      return <G>{lines}</G>;
    }

    case 'hexagonal': {
      const size = 22;
      const hexW = size * 2;
      const hexH = Math.sqrt(3) * size;
      const hexes: any[] = [];
      const rows = Math.ceil(h / hexH) + 1;
      const cols = Math.ceil(w / hexW) + 1;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cx = c * hexW * 0.75;
          const cy = r * hexH + (c % 2 === 0 ? 0 : hexH / 2);
          const pts = Array.from({ length: 6 }).map((_, i) => {
            const angle = (Math.PI / 180) * (60 * i - 30);
            return `${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`;
          }).join(' ');
          hexes.push(<Polygon key={`hex${r}-${c}`} points={pts} stroke={fgColor} strokeWidth={0.5} fill="none" opacity={0.1} />);
        }
      }
      return <G>{hexes}</G>;
    }

    default:
      return null;
  }
}

export default function CanvasScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [shapes, setShapes] = useState<CanvasShape[]>([]);
  const [textBoxes, setTextBoxes] = useState<TextBox[]>([]);
  const [template, setTemplate] = useState<PageTemplate>('grid');
  const [canvasBgKey, setCanvasBgKey] = useState('navy');
  const [pageId, setPageId] = useState('');
  const [saved, setSaved] = useState(true);

  const [mode, setMode] = useState<ToolMode>('draw');
  const [drawTool, setDrawTool] = useState<DrawTool>('pen');
  const [shapeTool, setShapeTool] = useState<ShapeType>('rect');
  const [penColor, setPenColor] = useState(DRAW_COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(2);

  const [showColors, setShowColors] = useState(false);
  const [showShapes, setShowShapes] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  const [currentPoints, setCurrentPoints] = useState<number[]>([]);
  const [shapePreview, setShapePreview] = useState<CanvasShape | null>(null);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiModal, setAiModal] = useState(false);
  const [aiResult, setAiResult] = useState('');

  // Undo history: { type, data }
  type UndoEntry =
    | { type: 'stroke'; stroke: Stroke }
    | { type: 'shape'; shape: CanvasShape }
    | { type: 'textbox_add'; tb: TextBox }
    | { type: 'textbox_del'; tb: TextBox };
  const undoHistoryRef = useRef<UndoEntry[]>([]);

  const modeRef = useRef<ToolMode>('draw');
  const drawToolRef = useRef<DrawTool>('pen');
  const shapeToolRef = useRef<ShapeType>('rect');
  const penColorRef = useRef<string>(DRAW_COLORS[0]);
  const strokeWidthRef = useRef<number>(2);
  const strokesRef = useRef<Stroke[]>([]);
  const shapesRef = useRef<CanvasShape[]>([]);
  const textBoxesRef = useRef<TextBox[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedTextIdRef = useRef<string | null>(null);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { drawToolRef.current = drawTool; }, [drawTool]);
  useEffect(() => { shapeToolRef.current = shapeTool; }, [shapeTool]);
  useEffect(() => { penColorRef.current = penColor; }, [penColor]);
  useEffect(() => { strokeWidthRef.current = strokeWidth; }, [strokeWidth]);
  useEffect(() => { selectedTextIdRef.current = selectedTextId; }, [selectedTextId]);

  useEffect(() => {
    if (!id) return;
    getLecture(id).then(l => {
      if (!l) return;
      const page = l.pages[0];
      if (page) {
        setStrokes(page.strokes || []);
        setShapes(page.shapes || []);
        setTextBoxes(page.textBoxes || []);
        setTemplate((page as any).type || 'grid');
        setCanvasBgKey((page as any).canvasBgKey || 'navy');
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

  const saveTemplate = useCallback(async (tmpl: PageTemplate, bgKey: string) => {
    if (!id || !pageId) return;
    const l = await getLecture(id);
    if (!l) return;
    const pages = l.pages.map((p: LecturePage) =>
      p.id === pageId ? { ...p, type: tmpl, canvasBgKey: bgKey } : p
    );
    await updateLecture(id, { pages });
  }, [id, pageId]);

  // ── PanResponder ────────────────────────────────────────────────────
  const shapeStartRef = useRef<{ x: number; y: number } | null>(null);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (e) => {
        if (modeRef.current === 'text') {
          return !selectedTextIdRef.current;
        }
        return true;
      },
      onMoveShouldSetPanResponder: () => modeRef.current !== 'text',

      onPanResponderGrant: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        const m = modeRef.current;
        if (m === 'draw') {
          setCurrentPoints([x, y]);
        } else if (m === 'shape') {
          shapeStartRef.current = { x, y };
          setShapePreview(null);
        } else if (m === 'text') {
          if (selectedTextIdRef.current) {
            setSelectedTextId(null);
            return;
          }
          const tb: TextBox = {
            id: uid(), text: '',
            x, y, width: 200, height: 44,
            fontSize: 15, color: penColorRef.current,
          };
          textBoxesRef.current = [...textBoxesRef.current, tb];
          setTextBoxes([...textBoxesRef.current]);
          setSelectedTextId(tb.id);
          setEditingTextId(tb.id);
          undoHistoryRef.current.push({ type: 'textbox_add', tb });
          scheduleAutoSave();
        }
      },

      onPanResponderMove: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        const m = modeRef.current;
        if (m === 'draw') {
          setCurrentPoints(prev => [...prev, x, y]);
        } else if (m === 'shape' && shapeStartRef.current) {
          setShapePreview({
            id: 'preview', type: shapeToolRef.current,
            x1: shapeStartRef.current.x, y1: shapeStartRef.current.y, x2: x, y2: y,
            color: penColorRef.current, strokeWidth: strokeWidthRef.current, filled: false,
          });
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
            if (tool === 'eraser') {
              strokesRef.current = strokesRef.current.slice(0, -1);
              setStrokes([...strokesRef.current]);
            } else {
              const stroke: Stroke = {
                id: uid(), points: prev,
                color: tool === 'highlighter' ? color + '55' : color,
                width: tool === 'highlighter' ? 14 : strokeWidthRef.current,
                tool,
              };
              strokesRef.current = [...strokesRef.current, stroke];
              setStrokes([...strokesRef.current]);
              undoHistoryRef.current.push({ type: 'stroke', stroke });
            }
            scheduleAutoSave();
            return [];
          });
        } else if (m === 'shape' && shapeStartRef.current) {
          const start = shapeStartRef.current;
          if (Math.abs(x - start.x) > 5 || Math.abs(y - start.y) > 5) {
            const shape: CanvasShape = {
              id: uid(), type: shapeToolRef.current,
              x1: start.x, y1: start.y, x2: x, y2: y,
              color: penColorRef.current, strokeWidth: strokeWidthRef.current, filled: false,
            };
            shapesRef.current = [...shapesRef.current, shape];
            setShapes([...shapesRef.current]);
            undoHistoryRef.current.push({ type: 'shape', shape });
            scheduleAutoSave();
          }
          shapeStartRef.current = null;
          setShapePreview(null);
        }
      },
    })
  ).current;

  // ── Actions ─────────────────────────────────────────────────────────
  const undo = () => {
    Haptics.selectionAsync();
    const entry = undoHistoryRef.current.pop();
    if (!entry) return;
    if (entry.type === 'stroke') {
      strokesRef.current = strokesRef.current.filter(s => s.id !== entry.stroke.id);
      setStrokes([...strokesRef.current]);
    } else if (entry.type === 'shape') {
      shapesRef.current = shapesRef.current.filter(s => s.id !== entry.shape.id);
      setShapes([...shapesRef.current]);
    } else if (entry.type === 'textbox_add') {
      textBoxesRef.current = textBoxesRef.current.filter(t => t.id !== entry.tb.id);
      setTextBoxes([...textBoxesRef.current]);
      if (selectedTextId === entry.tb.id) setSelectedTextId(null);
      if (editingTextId === entry.tb.id) setEditingTextId(null);
    } else if (entry.type === 'textbox_del') {
      textBoxesRef.current = [...textBoxesRef.current, entry.tb];
      setTextBoxes([...textBoxesRef.current]);
    }
    scheduleAutoSave();
  };

  const deleteSelectedText = () => {
    if (!selectedTextId) return;
    const tb = textBoxesRef.current.find(t => t.id === selectedTextId);
    if (tb) undoHistoryRef.current.push({ type: 'textbox_del', tb });
    textBoxesRef.current = textBoxesRef.current.filter(t => t.id !== selectedTextId);
    setTextBoxes([...textBoxesRef.current]);
    setSelectedTextId(null);
    setEditingTextId(null);
    scheduleAutoSave();
    Haptics.selectionAsync();
  };

  const clearAll = () => {
    Alert.alert('مسح الكل', 'هل تريد مسح جميع الرسومات؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'مسح', style: 'destructive', onPress: async () => {
          strokesRef.current = [];
          shapesRef.current = [];
          textBoxesRef.current = [];
          setStrokes([]); setShapes([]); setTextBoxes([]);
          setSelectedTextId(null); setEditingTextId(null);
          undoHistoryRef.current = [];
          scheduleAutoSave();
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        },
      },
    ]);
  };

  const changeTemplate = (tmpl: PageTemplate) => {
    setTemplate(tmpl);
    saveTemplate(tmpl, canvasBgKey);
    Haptics.selectionAsync();
  };

  const changeBg = (key: string) => {
    setCanvasBgKey(key);
    saveTemplate(template, key);
    Haptics.selectionAsync();
  };

  // ── AI: Canvas to text ───────────────────────────────────────────────
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
            ctx.fillStyle = activeBg;
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
      setAiResult('تحليل اللوحة متاح على المتصفح. التقط صورة من شاشة المحاضرة للتحليل.');
    } catch {
      setAiResult('تعذّر تحليل اللوحة. تأكد من إعداد مفتاح الذكاء الاصطناعي.');
    } finally {
      setAiLoading(false);
    }
  };

  const addResultToTranscript = async () => {
    if (!id || !aiResult) return;
    const l = await getLecture(id);
    if (!l) return;
    await updateLecture(id, { transcript: l.transcript ? `${l.transcript}\n\n${aiResult}` : aiResult });
    setAiModal(false);
    Alert.alert('تمّ', 'تمت إضافة النص إلى المحاضرة');
  };

  const activeBg = CANVAS_BACKGROUNDS.find(b => b.key === canvasBgKey)?.color ?? '#0D1321';
  const templateColor = ['white', 'cream', 'paper'].includes(canvasBgKey) ? '#000000' : '#FFFFFF';
  const canvasH = SCREEN_H - insets.top - (Platform.OS === 'web' ? 160 : 140);

  return (
    <View style={[s.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>لوحة الكتابة</Text>
        <View style={s.headerRight}>
          <TouchableOpacity style={[s.headerBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => setShowTemplates(true)}>
            <Ionicons name="grid" size={18} color={colors.muted} />
          </TouchableOpacity>
          <TouchableOpacity style={[s.headerBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={analyzeCanvas}>
            <Ionicons name="sparkles" size={18} color={colors.accent} />
          </TouchableOpacity>
          {!saved
            ? <Text style={[s.savingText, { color: colors.muted }]}>حفظ...</Text>
            : <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
          }
        </View>
      </View>

      {/* Toolbar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={[s.toolbar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
        contentContainerStyle={s.toolbarContent}
      >
        {/* Draw tools */}
        <View style={s.toolGroup}>
          {(['pen', 'pencil', 'highlighter', 'eraser'] as DrawTool[]).map(t => (
            <TouchableOpacity
              key={t}
              style={[s.toolBtn, { backgroundColor: colors.card, borderColor: colors.border }, mode === 'draw' && drawTool === t && { borderColor: colors.primary, backgroundColor: colors.primary + '20' }]}
              onPress={() => { setMode('draw'); setDrawTool(t); setShowShapes(false); setSelectedTextId(null); Haptics.selectionAsync(); }}
            >
              <Ionicons
                name={t === 'pen' ? 'create' : t === 'pencil' ? 'pencil' : t === 'highlighter' ? 'brush' : 'square'}
                size={18}
                color={mode === 'draw' && drawTool === t ? colors.primary : colors.mutedForeground}
              />
            </TouchableOpacity>
          ))}
        </View>

        <View style={[s.divider, { backgroundColor: colors.border }]} />

        {/* Shape mode */}
        <TouchableOpacity
          style={[s.toolBtn, { backgroundColor: colors.card, borderColor: colors.border }, mode === 'shape' && { borderColor: colors.primary, backgroundColor: colors.primary + '20' }]}
          onPress={() => { setMode('shape'); setShowShapes(!showShapes); setShowColors(false); setSelectedTextId(null); Haptics.selectionAsync(); }}
        >
          <Ionicons name="shapes-outline" size={18} color={mode === 'shape' ? colors.primary : colors.mutedForeground} />
        </TouchableOpacity>

        {/* Text mode */}
        <TouchableOpacity
          style={[s.toolBtn, { backgroundColor: colors.card, borderColor: colors.border }, mode === 'text' && { borderColor: colors.accent, backgroundColor: colors.accent + '20' }]}
          onPress={() => { setMode('text'); setShowShapes(false); setShowColors(false); Haptics.selectionAsync(); }}
        >
          <Ionicons name="text" size={18} color={mode === 'text' ? colors.accent : colors.mutedForeground} />
        </TouchableOpacity>

        <View style={[s.divider, { backgroundColor: colors.border }]} />

        {/* Color picker */}
        <TouchableOpacity
          style={[s.colorBtn, { borderColor: colors.surface }]}
          onPress={() => { setShowColors(!showColors); setShowShapes(false); }}
        >
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: penColor, borderWidth: 2, borderColor: colors.surface }} />
        </TouchableOpacity>

        {/* Widths */}
        {[1.5, 2.5, 4].map(w => (
          <TouchableOpacity
            key={w}
            style={[s.widthBtn, { backgroundColor: colors.card, borderColor: strokeWidth === w ? colors.primary : colors.border }, strokeWidth === w && { backgroundColor: colors.primary + '15' }]}
            onPress={() => { setStrokeWidth(w); Haptics.selectionAsync(); }}
          >
            <View style={{ width: w * 3.5, height: w * 3.5, borderRadius: w * 3.5, backgroundColor: colors.foreground }} />
          </TouchableOpacity>
        ))}

        <View style={[s.divider, { backgroundColor: colors.border }]} />

        {/* Undo / Clear */}
        <TouchableOpacity style={[s.toolBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={undo}>
          <Ionicons name="arrow-undo" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
        <TouchableOpacity style={[s.toolBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={clearAll}>
          <Ionicons name="trash" size={18} color={colors.accentDanger} />
        </TouchableOpacity>

        {/* Delete selected text box */}
        {selectedTextId && (
          <>
            <View style={[s.divider, { backgroundColor: colors.border }]} />
            <TouchableOpacity
              style={[s.toolBtn, { backgroundColor: colors.accentDanger + '20', borderColor: colors.accentDanger }]}
              onPress={deleteSelectedText}
            >
              <Ionicons name="trash" size={18} color={colors.accentDanger} />
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Color palette */}
      {showColors && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={[s.paletteBar, { backgroundColor: colors.surfaceElevated, borderBottomColor: colors.border }]}
          contentContainerStyle={s.paletteContent}
        >
          {DRAW_COLORS.map(c => (
            <TouchableOpacity
              key={c}
              onPress={() => { setPenColor(c); setShowColors(false); }}
              style={[s.paletteDot, { backgroundColor: c }, penColor === c && { borderWidth: 3, borderColor: colors.primary }]}
            />
          ))}
        </ScrollView>
      )}

      {/* Shape selector */}
      {showShapes && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={[s.paletteBar, { backgroundColor: colors.surfaceElevated, borderBottomColor: colors.border }]}
          contentContainerStyle={s.paletteContent}
        >
          {SHAPES.map(sh => (
            <TouchableOpacity
              key={sh.type}
              style={[s.shapeBtn, { backgroundColor: colors.card, borderColor: shapeTool === sh.type ? colors.primary : colors.border }, shapeTool === sh.type && { backgroundColor: colors.primary + '15' }]}
              onPress={() => { setShapeTool(sh.type); setShowShapes(false); Haptics.selectionAsync(); }}
            >
              <Ionicons name={sh.icon as any} size={20} color={shapeTool === sh.type ? colors.primary : colors.mutedForeground} />
              <Text style={{ fontFamily: 'Tajawal_400Regular', fontSize: 10, color: shapeTool === sh.type ? colors.primary : colors.mutedForeground }}>{sh.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Mode hints */}
      {mode === 'text' && (
        <View style={[s.modeHint, { backgroundColor: colors.accent + '15' }]}>
          <Ionicons name="information-circle" size={14} color={colors.accent} />
          <Text style={[s.modeHintText, { color: colors.accent }]}>
            {selectedTextId ? 'مربع محدد — اضغط ✕ في الشريط للحذف' : 'اضغط على اللوحة لإضافة مربع نص'}
          </Text>
        </View>
      )}
      {mode === 'shape' && (
        <View style={[s.modeHint, { backgroundColor: colors.primary + '12' }]}>
          <Ionicons name="information-circle" size={14} color={colors.primary} />
          <Text style={[s.modeHintText, { color: colors.primary }]}>اسحب لرسم {SHAPES.find(s => s.type === shapeTool)?.label}</Text>
        </View>
      )}

      {/* Canvas */}
      <View
        style={[s.canvas, { height: canvasH, backgroundColor: activeBg }]}
        {...panResponder.panHandlers}
      >
        <Svg
          style={StyleSheet.absoluteFill}
          width={SCREEN_W}
          height={canvasH}
          {...(Platform.OS === 'web' ? { 'data-canvas-svg': 'true' } : {})}
        >
          {renderTemplate(template, SCREEN_W, canvasH, templateColor)}

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

          {currentPoints.length >= 4 && (
            <Path
              d={pointsToPath(currentPoints)}
              stroke={drawTool === 'highlighter' ? penColor + '55' : penColor}
              strokeWidth={drawTool === 'highlighter' ? 14 : strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          )}

          {shapes.map(shape => renderShape(shape))}
          {shapePreview && renderShape(shapePreview, true)}
        </Svg>

        {/* Text boxes overlay */}
        {textBoxes.map(tb => (
          <TextBoxView
            key={tb.id}
            tb={tb}
            isSelected={selectedTextId === tb.id}
            isEditing={editingTextId === tb.id}
            mode={mode}
            colors={colors}
            onSelect={() => { setSelectedTextId(tb.id); setEditingTextId(null); }}
            onFocus={() => { setSelectedTextId(tb.id); setEditingTextId(tb.id); }}
            onBlur={() => setEditingTextId(null)}
            onChange={(text) => {
              textBoxesRef.current = textBoxesRef.current.map(t => t.id === tb.id ? { ...t, text } : t);
              setTextBoxes([...textBoxesRef.current]);
              scheduleAutoSave();
            }}
            onDelete={() => {
              undoHistoryRef.current.push({ type: 'textbox_del', tb });
              textBoxesRef.current = textBoxesRef.current.filter(t => t.id !== tb.id);
              setTextBoxes([...textBoxesRef.current]);
              setSelectedTextId(null);
              setEditingTextId(null);
              scheduleAutoSave();
            }}
            onMove={(dx, dy) => {
              textBoxesRef.current = textBoxesRef.current.map(t => t.id === tb.id ? { ...t, x: t.x + dx, y: t.y + dy } : t);
              setTextBoxes([...textBoxesRef.current]);
              scheduleAutoSave();
            }}
          />
        ))}
      </View>

      {/* Template + Background Modal */}
      <Modal visible={showTemplates} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: colors.surfaceElevated, borderTopColor: colors.border }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.foreground }]}>نموذج الصفحة</Text>
              <TouchableOpacity onPress={() => setShowTemplates(false)}>
                <Ionicons name="close" size={22} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <Text style={[s.sectionLabel, { color: colors.muted }]}>خلفية اللوحة</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 4 }}>
              {CANVAS_BACKGROUNDS.map(bg => (
                <TouchableOpacity key={bg.key} onPress={() => changeBg(bg.key)} style={{ alignItems: 'center', gap: 4 }}>
                  <View style={{
                    width: 40, height: 40, borderRadius: 10, backgroundColor: bg.color,
                    borderWidth: canvasBgKey === bg.key ? 3 : 1,
                    borderColor: canvasBgKey === bg.key ? colors.primary : colors.border,
                  }} />
                  <Text style={{ fontFamily: 'Tajawal_400Regular', fontSize: 10, color: colors.muted }}>{bg.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[s.sectionLabel, { color: colors.muted, marginTop: 8 }]}>نمط الخطوط</Text>
            <View style={s.templateGrid}>
              {TEMPLATES.map(t => (
                <TouchableOpacity
                  key={t.type}
                  style={[s.templateBtn, { backgroundColor: colors.card, borderColor: template === t.type ? colors.primary : colors.border }, template === t.type && { backgroundColor: colors.primary + '12' }]}
                  onPress={() => changeTemplate(t.type)}
                >
                  <Ionicons name={t.icon as any} size={26} color={template === t.type ? colors.primary : colors.muted} />
                  <Text style={{ fontFamily: 'Tajawal_500Medium', fontSize: 11, color: template === t.type ? colors.primary : colors.muted }}>{t.label}</Text>
                  {template === t.type && (
                    <Ionicons name="checkmark-circle" size={14} color={colors.primary} style={{ position: 'absolute', top: 4, right: 4 }} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* AI Modal */}
      <Modal visible={aiModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: colors.surfaceElevated, borderTopColor: colors.border }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.foreground }]}>تحليل الكتابة</Text>
              <TouchableOpacity onPress={() => setAiModal(false)}>
                <Ionicons name="close" size={22} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            {aiLoading ? (
              <View style={{ alignItems: 'center', padding: 30, gap: 10 }}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ fontFamily: 'Tajawal_400Regular', fontSize: 13, color: colors.muted }}>يحلّل الكتابة...</Text>
              </View>
            ) : (
              <>
                <ScrollView style={{ maxHeight: 240 }}>
                  <Text style={{ fontFamily: 'Tajawal_400Regular', fontSize: 14, color: colors.foreground, lineHeight: 22, textAlign: 'right' }}>{aiResult}</Text>
                </ScrollView>
                {!!aiResult && !aiResult.startsWith('تحليل') && (
                  <TouchableOpacity
                    style={[s.modalAction, { backgroundColor: colors.primary }]}
                    onPress={addResultToTranscript}
                  >
                    <Ionicons name="add-circle" size={18} color="#fff" />
                    <Text style={{ fontFamily: 'Tajawal_700Bold', fontSize: 14, color: '#fff' }}>إضافة إلى نص المحاضرة</Text>
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

// ── TextBoxView ────────────────────────────────────────────────────────
interface TextBoxViewProps {
  tb: TextBox;
  isSelected: boolean;
  isEditing: boolean;
  mode: ToolMode;
  colors: any;
  onSelect: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onChange: (text: string) => void;
  onDelete: () => void;
  onMove: (dx: number, dy: number) => void;
}

function TextBoxView({ tb, isSelected, isEditing, mode, colors, onSelect, onFocus, onBlur, onChange, onDelete, onMove }: TextBoxViewProps) {
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

  const showControls = isSelected || isEditing;

  return (
    <TouchableOpacity
      activeOpacity={0.95}
      onPress={() => { if (!isSelected) onSelect(); }}
      style={{
        position: 'absolute',
        left: tb.x,
        top: tb.y,
        width: tb.width,
        minHeight: tb.height,
        borderWidth: showControls ? 1.5 : (mode === 'text' ? 1 : 0),
        borderColor: showControls ? colors.primary : colors.primary + '40',
        borderRadius: 6,
        borderStyle: showControls ? 'solid' : 'dashed',
        backgroundColor: showControls ? colors.surface + 'E0' : 'transparent',
      }}
    >
      {/* Controls bar */}
      {showControls && (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 4, paddingHorizontal: 4, paddingTop: 2 }}>
          <TouchableOpacity
            {...dragResponder.panHandlers}
            style={{ padding: 5, backgroundColor: colors.surfaceElevated, borderRadius: 5 }}
          >
            <Ionicons name="move" size={13} color={colors.muted} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onDelete}
            style={{ padding: 5, backgroundColor: colors.accentDanger + '25', borderRadius: 5 }}
          >
            <Ionicons name="trash-outline" size={13} color={colors.accentDanger} />
          </TouchableOpacity>
        </View>
      )}

      {/* Small indicator when in text mode but not selected */}
      {!showControls && mode === 'text' && (
        <TouchableOpacity
          onPress={onSelect}
          style={{ position: 'absolute', top: -10, right: -10, backgroundColor: colors.accentDanger, borderRadius: 8, width: 18, height: 18, alignItems: 'center', justifyContent: 'center', zIndex: 10 }}
        >
          <Ionicons name="close" size={11} color="#fff" />
        </TouchableOpacity>
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
          padding: 6,
          minHeight: 30,
          textAlign: 'right',
        }}
      />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  backBtn: { padding: 4, marginRight: 6 },
  headerTitle: { flex: 1, fontFamily: 'Tajawal_700Bold', fontSize: 18 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerBtn: { padding: 7, borderRadius: 9, borderWidth: 1 },
  savingText: { fontFamily: 'Tajawal_400Regular', fontSize: 12 },
  toolbar: { maxHeight: 56, borderBottomWidth: 1 },
  toolbarContent: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 9 },
  toolGroup: { flexDirection: 'row', gap: 3 },
  toolBtn: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  divider: { width: 1, height: 26, marginHorizontal: 3 },
  colorBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  widthBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  paletteBar: { maxHeight: 52, borderBottomWidth: 1 },
  paletteContent: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  paletteDot: { width: 28, height: 28, borderRadius: 14 },
  shapeBtn: { alignItems: 'center', gap: 2, padding: 8, borderRadius: 10, borderWidth: 1, minWidth: 56 },
  modeHint: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 5 },
  modeHintText: { fontFamily: 'Tajawal_400Regular', fontSize: 12 },
  canvas: { flex: 1, overflow: 'hidden' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 14, borderTopWidth: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontFamily: 'Tajawal_700Bold', fontSize: 16 },
  modalAction: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 12, justifyContent: 'center' },
  sectionLabel: { fontFamily: 'Tajawal_500Medium', fontSize: 12 },
  templateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-start', paddingBottom: 8 },
  templateBtn: { width: 82, alignItems: 'center', gap: 5, padding: 10, borderRadius: 12, borderWidth: 1 },
});
