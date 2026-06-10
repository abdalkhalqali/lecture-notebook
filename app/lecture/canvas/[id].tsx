import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, PanResponder,
  Dimensions, Alert, Platform, TextInput, ScrollView, Modal,
  ActivityIndicator,
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
import { analyzeHandwriting, AI_PROVIDER_INFO } from '@/lib/ai';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

type DrawTool = 'pen' | 'pencil' | 'highlighter' | 'eraser';
type ToolMode = 'draw' | 'shape' | 'text';

const DRAW_COLORS = [
  '#F1F5F9','#000000','#1E293B','#4F8EF7','#60A5FA','#93C5FD',
  '#10B981','#34D399','#6EE7B7','#F59E0B','#FBBF24','#FDE68A',
  '#EF4444','#F87171','#8B5CF6','#EC4899',
];

const SHAPES: { type: ShapeType; icon: string; label: string }[] = [
  { type: 'rect',     icon: 'square-outline',        label: 'مربع' },
  { type: 'circle',   icon: 'ellipse-outline',        label: 'دائرة' },
  { type: 'line',     icon: 'remove-outline',         label: 'خط' },
  { type: 'arrow',    icon: 'arrow-forward-outline',  label: 'سهم' },
  { type: 'triangle', icon: 'triangle-outline',       label: 'مثلث' },
];

const TEMPLATES: { type: PageTemplate; label: string; icon: string }[] = [
  { type: 'blank',     label: 'فارغ',      icon: 'square-outline' },
  { type: 'grid',      label: 'شبكة',      icon: 'grid-outline' },
  { type: 'lined',     label: 'مسطّر',     icon: 'reorder-four-outline' },
  { type: 'cornell',   label: 'كورنيل',    icon: 'browsers-outline' },
  { type: 'math',      label: 'رياضيات',   icon: 'calculator-outline' },
  { type: 'dotted',    label: 'نقطي',      icon: 'ellipse-outline' },
  { type: 'isometric', label: 'إيزومتري',  icon: 'prism-outline' },
  { type: 'music',     label: 'موسيقى',    icon: 'musical-notes-outline' },
  { type: 'bullet',    label: 'قوائم',     icon: 'list-outline' },
  { type: 'weekly',    label: 'أسبوعي',    icon: 'calendar-outline' },
  { type: 'timeline',  label: 'جدول زمني', icon: 'time-outline' },
  { type: 'hexagonal', label: 'سداسي',     icon: 'shapes-outline' },
];

const CANVAS_BACKGROUNDS = [
  { key: 'navy',  color: '#0D1321', label: 'كحلي' },
  { key: 'black', color: '#050505', label: 'أسود' },
  { key: 'white', color: '#FFFFFF', label: 'أبيض' },
  { key: 'cream', color: '#FEFCE8', label: 'كريمي' },
  { key: 'chalk', color: '#1A3A2A', label: 'سبورة' },
  { key: 'teal',  color: '#00303F', label: 'فيروزي' },
  { key: 'gray',  color: '#1E1E1E', label: 'رمادي' },
  { key: 'paper', color: '#F5F0E8', label: 'ورق' },
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

function renderShapeSvg(shape: CanvasShape, isPreview = false) {
  const { x1, y1, x2, y2, color, strokeWidth } = shape;
  const op = isPreview ? 0.6 : 1;
  const x = Math.min(x1, x2), y = Math.min(y1, y2);
  const w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
  switch (shape.type) {
    case 'rect':
      return <Rect key={shape.id} x={x} y={y} width={w} height={h} stroke={color} strokeWidth={strokeWidth} fill="none" opacity={op} />;
    case 'circle':
      return <Ellipse key={shape.id} cx={(x1+x2)/2} cy={(y1+y2)/2} rx={w/2} ry={h/2} stroke={color} strokeWidth={strokeWidth} fill="none" opacity={op} />;
    case 'line':
      return <Line key={shape.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={strokeWidth} opacity={op} />;
    case 'arrow': {
      const angle = Math.atan2(y2-y1, x2-x1);
      const len = 14;
      return <Path key={shape.id} d={`M${x1} ${y1}L${x2} ${y2}M${x2-len*Math.cos(angle-Math.PI/6)} ${y2-len*Math.sin(angle-Math.PI/6)}L${x2} ${y2}L${x2-len*Math.cos(angle+Math.PI/6)} ${y2-len*Math.sin(angle+Math.PI/6)}`} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={op} />;
    }
    case 'triangle':
      return <Polygon key={shape.id} points={`${(x1+x2)/2},${y1} ${x2},${y2} ${x1},${y2}`} stroke={color} strokeWidth={strokeWidth} fill="none" opacity={op} />;
    default: return null;
  }
}

function renderTemplate(type: PageTemplate, w: number, h: number, fg: string) {
  switch (type) {
    case 'blank': return null;
    case 'grid': {
      const s = 30;
      return <G opacity={0.08}>{Array.from({length:Math.ceil(h/s)}).map((_,i)=><Line key={`gh${i}`} x1={0} y1={i*s} x2={w} y2={i*s} stroke={fg} strokeWidth={0.5}/>)}{Array.from({length:Math.ceil(w/s)}).map((_,i)=><Line key={`gv${i}`} x1={i*s} y1={0} x2={i*s} y2={h} stroke={fg} strokeWidth={0.5}/>)}</G>;
    }
    case 'lined': {
      const sp = 32;
      return <G opacity={0.13}>{Array.from({length:Math.ceil(h/sp)}).map((_,i)=>i>0&&<Line key={`l${i}`} x1={0} y1={i*sp} x2={w} y2={i*sp} stroke={fg} strokeWidth={0.7}/>)}<Line x1={w*0.88} y1={0} x2={w*0.88} y2={h} stroke="#EF4444" strokeWidth={0.8} opacity={0.4}/></G>;
    }
    case 'cornell': {
      const cx=w*0.28,sy=h*0.78,sp=30;
      return <G opacity={0.13}><Line x1={cx} y1={0} x2={cx} y2={sy} stroke={fg} strokeWidth={1}/><Line x1={0} y1={sy} x2={w} y2={sy} stroke={fg} strokeWidth={1}/>{Array.from({length:Math.ceil(sy/sp)}).map((_,i)=>i>0&&<Line key={`ch${i}`} x1={cx+2} y1={i*sp} x2={w} y2={i*sp} stroke={fg} strokeWidth={0.4} strokeDasharray="4,8"/>)}</G>;
    }
    case 'math': {
      const g=20;
      return <G opacity={0.1}>{Array.from({length:Math.ceil(h/g)}).map((_,i)=><Line key={`mh${i}`} x1={0} y1={i*g} x2={w} y2={i*g} stroke={fg} strokeWidth={i%5===0?0.8:0.4}/>)}{Array.from({length:Math.ceil(w/g)}).map((_,i)=><Line key={`mv${i}`} x1={i*g} y1={0} x2={i*g} y2={h} stroke={fg} strokeWidth={i%5===0?0.8:0.4}/>)}</G>;
    }
    case 'dotted': {
      const gap=28; const dots:any[]=[];
      for(let r=1;r<Math.ceil(h/gap);r++) for(let c=1;c<Math.ceil(w/gap);c++) dots.push(<Circle key={`d${r}-${c}`} cx={c*gap} cy={r*gap} r={1.3} fill={fg} opacity={0.25}/>);
      return <G>{dots}</G>;
    }
    case 'isometric': {
      const sz=32; const rows=Math.ceil(h/(sz*0.866))+2; const cols=Math.ceil(w/sz)+2; const lines:any[]=[];
      for(let i=0;i<rows;i++) lines.push(<Line key={`ih${i}`} x1={0} y1={i*sz*0.866} x2={w} y2={i*sz*0.866} stroke={fg} strokeWidth={0.4} opacity={0.1}/>);
      for(let i=-rows;i<cols+rows;i++){lines.push(<Line key={`ir${i}`} x1={i*sz} y1={0} x2={i*sz+rows*sz*0.5} y2={h} stroke={fg} strokeWidth={0.4} opacity={0.1}/>);lines.push(<Line key={`il${i}`} x1={i*sz} y1={0} x2={i*sz-rows*sz*0.5} y2={h} stroke={fg} strokeWidth={0.4} opacity={0.1}/>);}
      return <G>{lines}</G>;
    }
    case 'music': {
      const grpH=64; const groups=Math.floor(h/grpH); const lines:any[]=[];
      for(let g=0;g<groups;g++){const by=g*grpH+12;for(let l=0;l<5;l++) lines.push(<Line key={`ms${g}-${l}`} x1={12} y1={by+l*8} x2={w-12} y2={by+l*8} stroke={fg} strokeWidth={0.9} opacity={0.22}/>);}
      return <G>{lines}</G>;
    }
    case 'bullet': {
      const rh=36; const lines:any[]=[];
      for(let i=1;i<Math.ceil(h/rh);i++){const y=i*rh;lines.push(<Circle key={`bc${i}`} cx={20} cy={y} r={2.5} fill={fg} opacity={0.22}/>);lines.push(<Line key={`bl${i}`} x1={40} y1={y} x2={w-16} y2={y} stroke={fg} strokeWidth={0.5} opacity={0.1}/>);}
      return <G>{lines}</G>;
    }
    case 'weekly': {
      const cols=7; const cw=w/cols; const hh=28; const lines:any[]=[];
      for(let i=0;i<=cols;i++) lines.push(<Line key={`wv${i}`} x1={i*cw} y1={0} x2={i*cw} y2={h} stroke={fg} strokeWidth={0.6} opacity={0.15}/>);
      lines.push(<Line key="wh0" x1={0} y1={hh} x2={w} y2={hh} stroke={fg} strokeWidth={0.8} opacity={0.2}/>);
      const hs=(h-hh)/12;
      for(let i=1;i<=12;i++) lines.push(<Line key={`whr${i}`} x1={0} y1={hh+i*hs} x2={w} y2={hh+i*hs} stroke={fg} strokeWidth={0.4} opacity={0.08}/>);
      return <G>{lines}</G>;
    }
    case 'timeline': {
      const cx=w/2; const step=80; const lines:any[]=[];
      lines.push(<Line key="tlm" x1={cx} y1={20} x2={cx} y2={h-20} stroke={fg} strokeWidth={2} opacity={0.15}/>);
      for(let i=0;i<Math.floor(h/step);i++){const y=(i+1)*step;const il=i%2===0;lines.push(<Line key={`tl${i}`} x1={cx-26} y1={y} x2={cx+26} y2={y} stroke={fg} strokeWidth={1.5} opacity={0.2}/>);lines.push(<Line key={`ta${i}`} x1={il?cx-26:cx+26} y1={y} x2={il?18:w-18} y2={y} stroke={fg} strokeWidth={0.5} strokeDasharray="4,6" opacity={0.1}/>);}
      return <G>{lines}</G>;
    }
    case 'hexagonal': {
      const sz=22; const hw=sz*2; const hh2=Math.sqrt(3)*sz; const hexes:any[]=[];
      const rows=Math.ceil(h/hh2)+1; const cols2=Math.ceil(w/hw)+1;
      for(let r=0;r<rows;r++) for(let c=0;c<cols2;c++){const cx2=c*hw*0.75;const cy2=r*hh2+(c%2===0?0:hh2/2);const pts=Array.from({length:6}).map((_,i)=>{const a=(Math.PI/180)*(60*i-30);return`${cx2+sz*Math.cos(a)},${cy2+sz*Math.sin(a)}`;}).join(' ');hexes.push(<Polygon key={`hx${r}-${c}`} points={pts} stroke={fg} strokeWidth={0.5} fill="none" opacity={0.1}/>);}
      return <G>{hexes}</G>;
    }
    default: return null;
  }
}

// ── Types ──────────────────────────────────────────────────────────────
type UndoEntry =
  | { kind: 'stroke'; stroke: Stroke }
  | { kind: 'shape';  shape: CanvasShape }
  | { kind: 'tb_add'; tb: TextBox }
  | { kind: 'tb_del'; tb: TextBox };

// ── Main Component ─────────────────────────────────────────────────────
export default function CanvasScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  // ── State ──────────────────────────────────────────────────────────
  const [strokes,    setStrokes]    = useState<Stroke[]>([]);
  const [shapes,     setShapes]     = useState<CanvasShape[]>([]);
  const [textBoxes,  setTextBoxes]  = useState<TextBox[]>([]);
  const [template,   setTemplate]   = useState<PageTemplate>('grid');
  const [bgKey,      setBgKey]      = useState('navy');
  const [pageId,     setPageId]     = useState('');
  const [saved,      setSaved]      = useState(true);

  const [mode,       setMode]       = useState<ToolMode>('draw');
  const [drawTool,   setDrawTool]   = useState<DrawTool>('pen');
  const [shapeTool,  setShapeTool]  = useState<ShapeType>('rect');
  const [penColor,   setPenColor]   = useState(DRAW_COLORS[0]);
  const [penWidth,   setPenWidth]   = useState(2);

  const [showColors,    setShowColors]    = useState(false);
  const [showShapes,    setShowShapes]    = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  const [selTbId,  setSelTbId]  = useState<string | null>(null);
  const [editTbId, setEditTbId] = useState<string | null>(null);

  const [curPts,       setCurPts]       = useState<number[]>([]);
  const [shapePreview, setShapePreview] = useState<CanvasShape | null>(null);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiModal,   setAiModal]   = useState(false);
  const [aiResult,  setAiResult]  = useState('');

  // ── Refs (avoid stale closures in PanResponder) ────────────────────
  const modeRef      = useRef<ToolMode>('draw');
  const drawToolRef  = useRef<DrawTool>('pen');
  const shapeToolRef = useRef<ShapeType>('rect');
  const colorRef     = useRef(DRAW_COLORS[0]);
  const widthRef     = useRef(2);
  const strokesRef   = useRef<Stroke[]>([]);
  const shapesRef    = useRef<CanvasShape[]>([]);
  const tbRef        = useRef<TextBox[]>([]);
  const selTbIdRef   = useRef<string | null>(null);
  const editTbIdRef  = useRef<string | null>(null);
  const undoRef      = useRef<UndoEntry[]>([]);
  const shapeStart   = useRef<{x:number;y:number}|null>(null);
  const saveTimer    = useRef<ReturnType<typeof setTimeout>|null>(null);

  // TextInput refs — keyed by text box id
  const inputRefs = useRef<Record<string, TextInput | null>>({});

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { drawToolRef.current = drawTool; }, [drawTool]);
  useEffect(() => { shapeToolRef.current = shapeTool; }, [shapeTool]);
  useEffect(() => { colorRef.current = penColor; }, [penColor]);
  useEffect(() => { widthRef.current = penWidth; }, [penWidth]);
  useEffect(() => { selTbIdRef.current = selTbId; }, [selTbId]);
  useEffect(() => { editTbIdRef.current = editTbId; }, [editTbId]);

  // Auto-focus TextInput when editTbId changes
  useEffect(() => {
    if (editTbId) {
      const ref = inputRefs.current[editTbId];
      if (ref) setTimeout(() => ref.focus(), 50);
    }
  }, [editTbId]);

  // ── Load page ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    getLecture(id).then(l => {
      if (!l) return;
      const page = l.pages[0] as any;
      if (!page) return;
      setStrokes(page.strokes || []);
      setShapes(page.shapes || []);
      setTextBoxes(page.textBoxes || []);
      setTemplate(page.type || 'grid');
      setBgKey(page.canvasBgKey || 'navy');
      setPageId(page.id);
      strokesRef.current = page.strokes || [];
      shapesRef.current  = page.shapes  || [];
      tbRef.current      = page.textBoxes || [];
    });
  }, [id]);

  // ── Auto-save ──────────────────────────────────────────────────────
  const scheduleSave = useCallback(() => {
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (!id || !pageId) return;
      const l = await getLecture(id);
      if (!l) return;
      const pages = l.pages.map((p: LecturePage) =>
        p.id === pageId
          ? { ...p, strokes: strokesRef.current, shapes: shapesRef.current, textBoxes: tbRef.current }
          : p
      );
      await updateLecture(id, { pages });
      setSaved(true);
    }, 1500);
  }, [id, pageId]);

  const saveMeta = useCallback(async (tmpl: PageTemplate, bk: string) => {
    if (!id || !pageId) return;
    const l = await getLecture(id);
    if (!l) return;
    const pages = l.pages.map((p: LecturePage) =>
      p.id === pageId ? { ...p, type: tmpl, canvasBgKey: bk } : p
    );
    await updateLecture(id, { pages });
  }, [id, pageId]);

  // ── Canvas PanResponder ────────────────────────────────────────────
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => modeRef.current !== 'text',
    onMoveShouldSetPanResponder:  () => modeRef.current !== 'text',

    onPanResponderGrant: (e) => {
      const { locationX: x, locationY: y } = e.nativeEvent;
      if (modeRef.current === 'draw') {
        setCurPts([x, y]);
      } else if (modeRef.current === 'shape') {
        shapeStart.current = { x, y };
        setShapePreview(null);
      }
    },

    onPanResponderMove: (e) => {
      const { locationX: x, locationY: y } = e.nativeEvent;
      if (modeRef.current === 'draw') {
        setCurPts(prev => [...prev, x, y]);
      } else if (modeRef.current === 'shape' && shapeStart.current) {
        setShapePreview({
          id: 'preview', type: shapeToolRef.current,
          x1: shapeStart.current.x, y1: shapeStart.current.y, x2: x, y2: y,
          color: colorRef.current, strokeWidth: widthRef.current, filled: false,
        });
      }
    },

    onPanResponderRelease: (e) => {
      const { locationX: x, locationY: y } = e.nativeEvent;
      if (modeRef.current === 'draw') {
        setCurPts(prev => {
          if (prev.length < 4) return [];
          const tool = drawToolRef.current;
          if (tool === 'eraser') {
            strokesRef.current = strokesRef.current.slice(0, -1);
            setStrokes([...strokesRef.current]);
          } else {
            const stroke: Stroke = {
              id: uid(), points: prev,
              color: tool === 'highlighter' ? colorRef.current + '55' : colorRef.current,
              width: tool === 'highlighter' ? 14 : widthRef.current,
              tool,
            };
            strokesRef.current = [...strokesRef.current, stroke];
            setStrokes([...strokesRef.current]);
            undoRef.current.push({ kind: 'stroke', stroke });
          }
          scheduleSave();
          return [];
        });
      } else if (modeRef.current === 'shape' && shapeStart.current) {
        const s = shapeStart.current;
        if (Math.abs(x - s.x) > 5 || Math.abs(y - s.y) > 5) {
          const shape: CanvasShape = {
            id: uid(), type: shapeToolRef.current,
            x1: s.x, y1: s.y, x2: x, y2: y,
            color: colorRef.current, strokeWidth: widthRef.current, filled: false,
          };
          shapesRef.current = [...shapesRef.current, shape];
          setShapes([...shapesRef.current]);
          undoRef.current.push({ kind: 'shape', shape });
          scheduleSave();
        }
        shapeStart.current = null;
        setShapePreview(null);
      }
    },
  })).current;

  // ── Text-mode tap handler on canvas background ─────────────────────
  // This fires when user taps on EMPTY area of canvas in text mode
  const handleCanvasTextTap = useCallback((e: any) => {
    if (modeRef.current !== 'text') return;
    const { locationX: x, locationY: y } = e.nativeEvent;

    // If tapping empty area while something is selected → deselect
    if (selTbIdRef.current) {
      setSelTbId(null);
      setEditTbId(null);
      return;
    }

    // Create new text box
    const tb: TextBox = {
      id: uid(), text: '',
      x, y, width: 220, height: 44,
      fontSize: 16, color: colorRef.current,
    };
    tbRef.current = [...tbRef.current, tb];
    setTextBoxes([...tbRef.current]);
    undoRef.current.push({ kind: 'tb_add', tb });
    setSelTbId(tb.id);
    setEditTbId(tb.id);
    scheduleSave();
  }, [scheduleSave]);

  // ── Actions ────────────────────────────────────────────────────────
  const undo = () => {
    Haptics.selectionAsync();
    const entry = undoRef.current.pop();
    if (!entry) return;
    if (entry.kind === 'stroke') {
      strokesRef.current = strokesRef.current.filter(s => s.id !== entry.stroke.id);
      setStrokes([...strokesRef.current]);
    } else if (entry.kind === 'shape') {
      shapesRef.current = shapesRef.current.filter(s => s.id !== entry.shape.id);
      setShapes([...shapesRef.current]);
    } else if (entry.kind === 'tb_add') {
      tbRef.current = tbRef.current.filter(t => t.id !== entry.tb.id);
      setTextBoxes([...tbRef.current]);
      if (selTbId === entry.tb.id) { setSelTbId(null); setEditTbId(null); }
    } else if (entry.kind === 'tb_del') {
      tbRef.current = [...tbRef.current, entry.tb];
      setTextBoxes([...tbRef.current]);
    }
    scheduleSave();
  };

  const deleteTb = useCallback((tbId: string) => {
    const tb = tbRef.current.find(t => t.id === tbId);
    if (tb) undoRef.current.push({ kind: 'tb_del', tb });
    tbRef.current = tbRef.current.filter(t => t.id !== tbId);
    setTextBoxes([...tbRef.current]);
    setSelTbId(null);
    setEditTbId(null);
    scheduleSave();
    Haptics.selectionAsync();
  }, [scheduleSave]);

  const updateTbText = useCallback((tbId: string, text: string) => {
    tbRef.current = tbRef.current.map(t => t.id === tbId ? { ...t, text } : t);
    setTextBoxes([...tbRef.current]);
    scheduleSave();
  }, [scheduleSave]);

  const moveTb = useCallback((tbId: string, dx: number, dy: number) => {
    tbRef.current = tbRef.current.map(t => t.id === tbId ? { ...t, x: t.x+dx, y: t.y+dy } : t);
    setTextBoxes([...tbRef.current]);
    scheduleSave();
  }, [scheduleSave]);

  const clearAll = () => {
    Alert.alert('مسح الكل', 'هل تريد مسح جميع الرسومات والنصوص؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'مسح', style: 'destructive', onPress: async () => {
          strokesRef.current = []; shapesRef.current = []; tbRef.current = [];
          setStrokes([]); setShapes([]); setTextBoxes([]);
          setSelTbId(null); setEditTbId(null); undoRef.current = [];
          scheduleSave();
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        },
      },
    ]);
  };

  // ── AI canvas analysis ─────────────────────────────────────────────
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
          canvas.width = SCREEN_W; canvas.height = canvasH;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = activeBg;
            ctx.fillRect(0, 0, SCREEN_W, canvasH);
            await new Promise<void>(resolve => {
              const img = new window.Image();
              const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              img.onload = () => { ctx.drawImage(img, 0, 0); URL.revokeObjectURL(url); resolve(); };
              img.onerror = () => resolve();
              img.src = url;
            });
            const b64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
            if (b64) {
              const result = await analyzeHandwriting(b64);
              setAiResult(result); setAiLoading(false); return;
            }
          }
        }
      }
      setAiResult('ارسم شيئاً على اللوحة ثم اضغط تحليل.');
    } catch {
      setAiResult('تعذّر تحليل اللوحة. سيُجرى تلقائياً عبر Pollinations AI.');
    } finally { setAiLoading(false); }
  };

  const addToTranscript = async () => {
    if (!id || !aiResult) return;
    const l = await getLecture(id);
    if (!l) return;
    await updateLecture(id, { transcript: l.transcript ? `${l.transcript}\n\n${aiResult}` : aiResult });
    setAiModal(false);
    Alert.alert('تمّ ✓', 'تمت إضافة النص إلى المحاضرة');
  };

  // ── Derived ────────────────────────────────────────────────────────
  const activeBg     = CANVAS_BACKGROUNDS.find(b => b.key === bgKey)?.color ?? '#0D1321';
  const isDarkBg     = ['navy','black','chalk','teal','gray'].includes(bgKey);
  const templateFg   = isDarkBg ? '#FFFFFF' : '#000000';
  const canvasH      = SCREEN_H - insets.top - (Platform.OS === 'web' ? 168 : 148);

  return (
    <View style={[s.root, { paddingTop: insets.top, backgroundColor: colors.background }]}>

      {/* ── Header ── */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>لوحة الكتابة</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TouchableOpacity
            style={[s.iconBtn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
            onPress={() => setShowTemplates(true)}
          >
            <Ionicons name="grid-outline" size={18} color={colors.muted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.iconBtn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
            onPress={analyzeCanvas}
          >
            <Ionicons name="sparkles-outline" size={18} color={colors.accent} />
          </TouchableOpacity>
          {saved
            ? <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
            : <Text style={{ fontFamily: 'Tajawal_400Regular', fontSize: 11, color: colors.muted }}>حفظ...</Text>
          }
        </View>
      </View>

      {/* ── Toolbar ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={[s.toolbar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
        contentContainerStyle={s.toolbarContent}
      >
        {/* Draw tools */}
        {(['pen','pencil','highlighter','eraser'] as DrawTool[]).map(t => (
          <TouchableOpacity key={t}
            style={[s.tbBtn, { backgroundColor: colors.card, borderColor: colors.border },
              mode==='draw' && drawTool===t && { borderColor: colors.primary, backgroundColor: colors.primary+'20' }]}
            onPress={() => { setMode('draw'); setDrawTool(t); setShowShapes(false); Haptics.selectionAsync(); }}
          >
            <Ionicons
              name={t==='pen'?'create':t==='pencil'?'pencil':t==='highlighter'?'brush':'square'}
              size={17}
              color={mode==='draw' && drawTool===t ? colors.primary : colors.mutedForeground}
            />
          </TouchableOpacity>
        ))}

        <View style={[s.sep, { backgroundColor: colors.border }]} />

        {/* Shape mode */}
        <TouchableOpacity
          style={[s.tbBtn, { backgroundColor: colors.card, borderColor: colors.border },
            mode==='shape' && { borderColor: colors.primary, backgroundColor: colors.primary+'20' }]}
          onPress={() => { setMode('shape'); setShowShapes(!showShapes); setShowColors(false); Haptics.selectionAsync(); }}
        >
          <Ionicons name="shapes-outline" size={17} color={mode==='shape' ? colors.primary : colors.mutedForeground} />
        </TouchableOpacity>

        {/* Text mode */}
        <TouchableOpacity
          style={[s.tbBtn, { backgroundColor: colors.card, borderColor: colors.border },
            mode==='text' && { borderColor: colors.accent, backgroundColor: colors.accent+'20' }]}
          onPress={() => { setMode('text'); setShowShapes(false); setShowColors(false); Haptics.selectionAsync(); }}
        >
          <Ionicons name="text" size={17} color={mode==='text' ? colors.accent : colors.mutedForeground} />
        </TouchableOpacity>

        <View style={[s.sep, { backgroundColor: colors.border }]} />

        {/* Color swatch */}
        <TouchableOpacity
          onPress={() => { setShowColors(!showColors); setShowShapes(false); }}
          style={{ marginHorizontal: 2 }}
        >
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: penColor, borderWidth: 2.5, borderColor: colors.surfaceElevated }} />
        </TouchableOpacity>

        {/* Widths */}
        {[1.5, 2.5, 4].map(w => (
          <TouchableOpacity key={w}
            style={[s.tbBtn, { backgroundColor: colors.card, borderColor: penWidth===w ? colors.primary : colors.border },
              penWidth===w && { backgroundColor: colors.primary+'15' }]}
            onPress={() => { setPenWidth(w); Haptics.selectionAsync(); }}
          >
            <View style={{ width: w*3.5, height: w*3.5, borderRadius: w*3.5, backgroundColor: colors.foreground }} />
          </TouchableOpacity>
        ))}

        <View style={[s.sep, { backgroundColor: colors.border }]} />

        {/* Undo */}
        <TouchableOpacity
          style={[s.tbBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={undo}
        >
          <Ionicons name="arrow-undo" size={17} color={colors.mutedForeground} />
        </TouchableOpacity>

        {/* Clear all */}
        <TouchableOpacity
          style={[s.tbBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={clearAll}
        >
          <Ionicons name="trash-outline" size={17} color={colors.accentDanger} />
        </TouchableOpacity>

        {/* Delete selected text box */}
        {selTbId && (
          <>
            <View style={[s.sep, { backgroundColor: colors.border }]} />
            <TouchableOpacity
              style={[s.tbBtn, { backgroundColor: colors.accentDanger+'20', borderColor: colors.accentDanger }]}
              onPress={() => deleteTb(selTbId)}
            >
              <Ionicons name="trash" size={17} color={colors.accentDanger} />
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* ── Colour palette ── */}
      {showColors && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={[s.palette, { backgroundColor: colors.surfaceElevated, borderBottomColor: colors.border }]}
          contentContainerStyle={s.paletteContent}
        >
          {DRAW_COLORS.map(c => (
            <TouchableOpacity key={c} onPress={() => { setPenColor(c); setShowColors(false); }}>
              <View style={[s.dot, { backgroundColor: c }, penColor===c && { borderWidth: 3, borderColor: colors.primary }]} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* ── Shape selector ── */}
      {showShapes && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={[s.palette, { backgroundColor: colors.surfaceElevated, borderBottomColor: colors.border }]}
          contentContainerStyle={s.paletteContent}
        >
          {SHAPES.map(sh => (
            <TouchableOpacity key={sh.type}
              style={[s.shapeBtn, { backgroundColor: colors.card, borderColor: shapeTool===sh.type ? colors.primary : colors.border },
                shapeTool===sh.type && { backgroundColor: colors.primary+'15' }]}
              onPress={() => { setShapeTool(sh.type); setShowShapes(false); Haptics.selectionAsync(); }}
            >
              <Ionicons name={sh.icon as any} size={20} color={shapeTool===sh.type ? colors.primary : colors.mutedForeground} />
              <Text style={{ fontFamily: 'Tajawal_400Regular', fontSize: 10, color: shapeTool===sh.type ? colors.primary : colors.mutedForeground }}>{sh.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* ── Mode hint ── */}
      {mode === 'text' && (
        <View style={[s.hint, { backgroundColor: colors.accent+'14' }]}>
          <Ionicons name="information-circle-outline" size={14} color={colors.accent} />
          <Text style={[s.hintText, { color: colors.accent }]}>
            {selTbId
              ? 'مربع محدد — اضغط داخله للتعديل، أو ✕ في الشريط للحذف'
              : 'اضغط على اللوحة لإنشاء مربع نص'}
          </Text>
        </View>
      )}
      {mode === 'shape' && (
        <View style={[s.hint, { backgroundColor: colors.primary+'12' }]}>
          <Ionicons name="information-circle-outline" size={14} color={colors.primary} />
          <Text style={[s.hintText, { color: colors.primary }]}>
            اسحب لرسم {SHAPES.find(sh=>sh.type===shapeTool)?.label}
          </Text>
        </View>
      )}

      {/* ── Canvas area ── */}
      <View style={{ height: canvasH, position: 'relative' }}>

        {/* Drawing layer — handles PanResponder for draw/shape modes */}
        <View
          style={[s.canvas, { height: canvasH, backgroundColor: activeBg }]}
          {...(mode !== 'text' ? panResponder.panHandlers : {})}
          onStartShouldSetResponder={() => mode === 'text'}
          onResponderGrant={handleCanvasTextTap}
        >
          <Svg
            style={StyleSheet.absoluteFill}
            width={SCREEN_W}
            height={canvasH}
            {...(Platform.OS === 'web' ? { 'data-canvas-svg': 'true' } as any : {})}
          >
            {renderTemplate(template, SCREEN_W, canvasH, templateFg)}

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

            {curPts.length >= 4 && (
              <Path
                d={pointsToPath(curPts)}
                stroke={drawTool === 'highlighter' ? penColor + '55' : penColor}
                strokeWidth={drawTool === 'highlighter' ? 14 : penWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            )}

            {shapes.map(sh => renderShapeSvg(sh))}
            {shapePreview && renderShapeSvg(shapePreview, true)}
          </Svg>
        </View>

        {/* ── Text-boxes overlay — COMPLETELY OUTSIDE PanResponder ── */}
        <View style={[StyleSheet.absoluteFill, { pointerEvents: 'box-none' } as any]}>
          {textBoxes.map(tb => (
            <TextBoxOverlay
              key={tb.id}
              tb={tb}
              isSelected={selTbId === tb.id}
              isEditing={editTbId === tb.id}
              mode={mode}
              colors={colors}
              inputRef={(r) => { inputRefs.current[tb.id] = r; }}
              onSelect={() => {
                setSelTbId(tb.id);
                setEditTbId(null);
              }}
              onEdit={() => {
                setSelTbId(tb.id);
                setEditTbId(tb.id);
              }}
              onBlur={() => setEditTbId(null)}
              onChange={(text) => updateTbText(tb.id, text)}
              onDelete={() => deleteTb(tb.id)}
              onMove={(dx, dy) => moveTb(tb.id, dx, dy)}
            />
          ))}
        </View>

      </View>

      {/* ── Template / Background Modal ── */}
      <Modal visible={showTemplates} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.sheet, { backgroundColor: colors.surfaceElevated, borderTopColor: colors.border }]}>
            <View style={s.sheetHeader}>
              <Text style={[s.sheetTitle, { color: colors.foreground }]}>نموذج الصفحة</Text>
              <TouchableOpacity onPress={() => setShowTemplates(false)}>
                <Ionicons name="close" size={22} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <Text style={[s.secLabel, { color: colors.muted }]}>خلفية اللوحة</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 4 }}>
              {CANVAS_BACKGROUNDS.map(bg => (
                <TouchableOpacity key={bg.key} onPress={() => { setBgKey(bg.key); saveMeta(template, bg.key); Haptics.selectionAsync(); }} style={{ alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: bg.color, borderWidth: bgKey===bg.key ? 3 : 1.5, borderColor: bgKey===bg.key ? colors.primary : colors.border }} />
                  <Text style={{ fontFamily: 'Tajawal_400Regular', fontSize: 10, color: colors.muted }}>{bg.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[s.secLabel, { color: colors.muted, marginTop: 10 }]}>نمط الخطوط</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 240 }}>
              <View style={s.tmplGrid}>
                {TEMPLATES.map(t => (
                  <TouchableOpacity key={t.type}
                    style={[s.tmplBtn, { backgroundColor: colors.card, borderColor: template===t.type ? colors.primary : colors.border },
                      template===t.type && { backgroundColor: colors.primary+'12' }]}
                    onPress={() => { setTemplate(t.type); saveMeta(t.type, bgKey); Haptics.selectionAsync(); }}
                  >
                    <Ionicons name={t.icon as any} size={26} color={template===t.type ? colors.primary : colors.muted} />
                    <Text style={{ fontFamily: 'Tajawal_500Medium', fontSize: 11, color: template===t.type ? colors.primary : colors.muted }}>{t.label}</Text>
                    {template===t.type && <Ionicons name="checkmark-circle" size={13} color={colors.primary} style={{ position: 'absolute', top: 4, right: 4 }} />}
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── AI Modal ── */}
      <Modal visible={aiModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.sheet, { backgroundColor: colors.surfaceElevated, borderTopColor: colors.border }]}>
            <View style={s.sheetHeader}>
              <View>
                <Text style={[s.sheetTitle, { color: colors.foreground }]}>تحليل اللوحة</Text>
                <Text style={{ fontFamily: 'Tajawal_400Regular', fontSize: 11, color: colors.muted }}>{AI_PROVIDER_INFO.label()}</Text>
              </View>
              <TouchableOpacity onPress={() => setAiModal(false)}>
                <Ionicons name="close" size={22} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            {aiLoading ? (
              <View style={{ alignItems: 'center', padding: 30, gap: 12 }}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ fontFamily: 'Tajawal_400Regular', fontSize: 14, color: colors.muted }}>يحلّل اللوحة...</Text>
              </View>
            ) : (
              <>
                <ScrollView style={{ maxHeight: 260 }}>
                  <Text style={{ fontFamily: 'Tajawal_400Regular', fontSize: 14, color: colors.foreground, lineHeight: 24, textAlign: 'right' }}>{aiResult}</Text>
                </ScrollView>
                {!!aiResult && (
                  <TouchableOpacity
                    style={[s.actionBtn, { backgroundColor: colors.primary }]}
                    onPress={addToTranscript}
                  >
                    <Ionicons name="add-circle-outline" size={18} color="#fff" />
                    <Text style={{ fontFamily: 'Tajawal_700Bold', fontSize: 15, color: '#fff' }}>إضافة إلى نص المحاضرة</Text>
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

// ── TextBoxOverlay ─────────────────────────────────────────────────────
// Lives in a separate layer OUTSIDE PanResponder — no event conflicts
interface TBProps {
  tb: TextBox;
  isSelected: boolean;
  isEditing: boolean;
  mode: ToolMode;
  colors: any;
  inputRef: (r: TextInput | null) => void;
  onSelect: () => void;
  onEdit: () => void;
  onBlur: () => void;
  onChange: (text: string) => void;
  onDelete: () => void;
  onMove: (dx: number, dy: number) => void;
}

function TextBoxOverlay({ tb, isSelected, isEditing, mode, colors, inputRef, onSelect, onEdit, onBlur, onChange, onDelete, onMove }: TBProps) {
  const lastPos = useRef<{x:number;y:number}|null>(null);

  const dragPR = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      lastPos.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
    },
    onPanResponderMove: (e) => {
      if (!lastPos.current) return;
      onMove(e.nativeEvent.pageX - lastPos.current.x, e.nativeEvent.pageY - lastPos.current.y);
      lastPos.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
    },
    onPanResponderRelease: () => { lastPos.current = null; },
  })).current;

  // In draw/shape mode → show content only, no interaction
  if (mode !== 'text') {
    return (
      <View
        pointerEvents="none"
        style={{
          position: 'absolute', left: tb.x, top: tb.y,
          width: tb.width, minHeight: tb.height,
          padding: 6,
        }}
      >
        <Text style={{ fontFamily: 'Tajawal_400Regular', fontSize: tb.fontSize, color: tb.color, textAlign: 'right' }}>
          {tb.text}
        </Text>
      </View>
    );
  }

  // Text mode
  return (
    <View
      style={{
        position: 'absolute',
        left: tb.x,
        top: tb.y,
        width: tb.width,
        minHeight: tb.height,
        borderWidth: isSelected ? 2 : 1,
        borderColor: isSelected ? colors.primary : colors.primary + '50',
        borderRadius: 8,
        borderStyle: isSelected ? 'solid' : 'dashed',
        backgroundColor: isSelected ? colors.surface + 'F0' : colors.surface + '30',
        overflow: 'visible',
      }}
    >
      {/* Controls row — visible when selected */}
      {isSelected && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 5, paddingTop: 3, gap: 4 }}>
          {/* Move handle */}
          <View {...dragPR.panHandlers} style={{ padding: 5, borderRadius: 6, backgroundColor: colors.surfaceElevated }}>
            <Ionicons name="move-outline" size={13} color={colors.muted} />
          </View>
          {/* Edit button */}
          <TouchableOpacity
            onPress={onEdit}
            style={{ flex: 1, alignItems: 'center', padding: 4, borderRadius: 6, backgroundColor: colors.primary + '20' }}
          >
            <Text style={{ fontFamily: 'Tajawal_400Regular', fontSize: 10, color: colors.primary }}>
              {isEditing ? '✓ تعديل' : 'اضغط للتعديل'}
            </Text>
          </TouchableOpacity>
          {/* Delete */}
          <TouchableOpacity
            onPress={onDelete}
            style={{ padding: 5, borderRadius: 6, backgroundColor: colors.accentDanger + '25' }}
          >
            <Ionicons name="trash-outline" size={13} color={colors.accentDanger} />
          </TouchableOpacity>
        </View>
      )}

      {/* Tap-to-select overlay (when not selected) */}
      {!isSelected && (
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={onSelect}
          activeOpacity={0.7}
        />
      )}

      {/* Quick-delete badge (always visible in text mode) */}
      {!isSelected && (
        <TouchableOpacity
          onPress={onDelete}
          style={{
            position: 'absolute', top: -10, right: -10,
            width: 20, height: 20, borderRadius: 10,
            backgroundColor: colors.accentDanger,
            alignItems: 'center', justifyContent: 'center',
            zIndex: 10,
          }}
        >
          <Ionicons name="close" size={12} color="#fff" />
        </TouchableOpacity>
      )}

      {/* TextInput */}
      <TextInput
        ref={inputRef}
        value={tb.text}
        onChangeText={onChange}
        onFocus={onEdit}
        onBlur={onBlur}
        multiline
        placeholder={isSelected ? 'اكتب هنا...' : ''}
        placeholderTextColor={colors.mutedForeground}
        editable={isEditing}
        style={{
          fontFamily: 'Tajawal_400Regular',
          fontSize: tb.fontSize,
          color: tb.color,
          padding: 6,
          minHeight: 32,
          textAlign: 'right',
          opacity: isEditing || tb.text ? 1 : 0.5,
        }}
        pointerEvents={isEditing ? 'auto' : 'none'}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  headerTitle: { flex: 1, fontFamily: 'Tajawal_700Bold', fontSize: 18 },
  iconBtn: { padding: 6, borderRadius: 9 },
  toolbar: { maxHeight: 54, borderBottomWidth: 1 },
  toolbarContent: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8 },
  tbBtn: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  sep: { width: 1, height: 24, marginHorizontal: 2 },
  palette: { maxHeight: 50, borderBottomWidth: 1 },
  paletteContent: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  dot: { width: 28, height: 28, borderRadius: 14 },
  shapeBtn: { alignItems: 'center', gap: 2, padding: 8, borderRadius: 10, borderWidth: 1, minWidth: 54 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 5 },
  hintText: { fontFamily: 'Tajawal_400Regular', fontSize: 12 },
  canvas: { flex: 1, overflow: 'hidden' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 14, borderTopWidth: 1 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { fontFamily: 'Tajawal_700Bold', fontSize: 17 },
  secLabel: { fontFamily: 'Tajawal_500Medium', fontSize: 12 },
  tmplGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tmplBtn: { width: 80, alignItems: 'center', gap: 5, padding: 10, borderRadius: 12, borderWidth: 1 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, padding: 14, justifyContent: 'center', marginTop: 6 },
});
