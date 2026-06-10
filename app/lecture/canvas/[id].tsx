import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, PanResponder,
  Dimensions, Alert, Platform, TextInput, ScrollView, Modal, ActivityIndicator,
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

const { width: SCR_W, height: SCR_H } = Dimensions.get('window');

type DrawTool = 'pen' | 'pencil' | 'highlighter' | 'eraser';
type Mode = 'draw' | 'shape' | 'text';

const COLORS = [
  '#FFFFFF','#E2E8F0','#94A3B8','#000000',
  '#4F8EF7','#60A5FA','#10B981','#34D399',
  '#F59E0B','#FBBF24','#EF4444','#F87171',
  '#8B5CF6','#A78BFA','#EC4899','#F472B6',
];

const SHAPES: { t: ShapeType; icon: string; label: string }[] = [
  { t: 'rect',     icon: 'square-outline',        label: 'مربع'   },
  { t: 'circle',   icon: 'ellipse-outline',        label: 'دائرة'  },
  { t: 'line',     icon: 'remove-outline',         label: 'خط'     },
  { t: 'arrow',    icon: 'arrow-forward-outline',  label: 'سهم'    },
  { t: 'triangle', icon: 'triangle-outline',       label: 'مثلث'   },
];

const TEMPLATES: { t: PageTemplate; label: string; icon: string }[] = [
  { t: 'blank',     label: 'فارغ',      icon: 'square-outline'        },
  { t: 'grid',      label: 'شبكة',      icon: 'grid-outline'          },
  { t: 'lined',     label: 'مسطّر',     icon: 'reorder-four-outline'  },
  { t: 'cornell',   label: 'كورنيل',    icon: 'browsers-outline'      },
  { t: 'math',      label: 'رياضيات',   icon: 'calculator-outline'    },
  { t: 'dotted',    label: 'نقطي',      icon: 'ellipse-outline'       },
  { t: 'isometric', label: 'إيزومتري',  icon: 'prism-outline'         },
  { t: 'music',     label: 'موسيقى',    icon: 'musical-notes-outline' },
  { t: 'bullet',    label: 'قوائم',     icon: 'list-outline'          },
  { t: 'weekly',    label: 'أسبوعي',    icon: 'calendar-outline'      },
  { t: 'timeline',  label: 'جدول زمني', icon: 'time-outline'          },
  { t: 'hexagonal', label: 'سداسي',     icon: 'shapes-outline'        },
];

const BACKGROUNDS = [
  { key: 'navy',  color: '#0D1321', label: 'كحلي'   },
  { key: 'black', color: '#050505', label: 'أسود'   },
  { key: 'white', color: '#FFFFFF', label: 'أبيض'   },
  { key: 'cream', color: '#FEFCE8', label: 'كريمي'  },
  { key: 'chalk', color: '#1A3A2A', label: 'سبورة'  },
  { key: 'teal',  color: '#00303F', label: 'فيروزي' },
  { key: 'gray',  color: '#1E1E1E', label: 'رمادي'  },
  { key: 'paper', color: '#F5F0E8', label: 'ورق'    },
];

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function toPath(pts: number[]) {
  if (pts.length < 4) return '';
  let d = `M${pts[0]} ${pts[1]}`;
  for (let i = 2; i < pts.length - 2; i += 2) {
    const mx = (pts[i] + pts[i+2]) / 2, my = (pts[i+1] + pts[i+3]) / 2;
    d += ` Q${pts[i]} ${pts[i+1]} ${mx} ${my}`;
  }
  return d;
}

function ShapeSvg({ s, preview }: { s: CanvasShape; preview?: boolean }) {
  const op = preview ? 0.55 : 1;
  const { x1,y1,x2,y2,color,strokeWidth:sw } = s;
  const x = Math.min(x1,x2), y = Math.min(y1,y2), w = Math.abs(x2-x1), h = Math.abs(y2-y1);
  if (s.type === 'rect')
    return <Rect x={x} y={y} width={w} height={h} stroke={color} strokeWidth={sw} fill="none" opacity={op}/>;
  if (s.type === 'circle')
    return <Ellipse cx={(x1+x2)/2} cy={(y1+y2)/2} rx={w/2} ry={h/2} stroke={color} strokeWidth={sw} fill="none" opacity={op}/>;
  if (s.type === 'line')
    return <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={sw} opacity={op}/>;
  if (s.type === 'arrow') {
    const a = Math.atan2(y2-y1,x2-x1), len=14;
    return <Path d={`M${x1} ${y1}L${x2} ${y2}M${x2-len*Math.cos(a-Math.PI/6)} ${y2-len*Math.sin(a-Math.PI/6)}L${x2} ${y2}L${x2-len*Math.cos(a+Math.PI/6)} ${y2-len*Math.sin(a+Math.PI/6)}`} stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={op}/>;
  }
  if (s.type === 'triangle')
    return <Polygon points={`${(x1+x2)/2},${y1} ${x2},${y2} ${x1},${y2}`} stroke={color} strokeWidth={sw} fill="none" opacity={op}/>;
  return null;
}

function Template({ type, w, h, fg }: { type: PageTemplate; w: number; h: number; fg: string }) {
  if (type === 'blank') return null;
  if (type === 'grid') {
    const s=30;
    return <G opacity={0.09}>{Array.from({length:Math.ceil(h/s)+1},(_,i)=><Line key={`h${i}`} x1={0} y1={i*s} x2={w} y2={i*s} stroke={fg} strokeWidth={0.5}/>)}{Array.from({length:Math.ceil(w/s)+1},(_,i)=><Line key={`v${i}`} x1={i*s} y1={0} x2={i*s} y2={h} stroke={fg} strokeWidth={0.5}/>)}</G>;
  }
  if (type === 'lined') {
    const sp=32;
    return <G opacity={0.14}>{Array.from({length:Math.ceil(h/sp)},(_,i)=>i>0&&<Line key={`l${i}`} x1={0} y1={i*sp} x2={w} y2={i*sp} stroke={fg} strokeWidth={0.7}/>)}<Line x1={w*.88} y1={0} x2={w*.88} y2={h} stroke="#EF4444" strokeWidth={0.8} opacity={0.4}/></G>;
  }
  if (type === 'cornell') {
    const cx=w*.28, sy=h*.78, sp=30;
    return <G opacity={0.14}><Line x1={cx} y1={0} x2={cx} y2={sy} stroke={fg} strokeWidth={1}/><Line x1={0} y1={sy} x2={w} y2={sy} stroke={fg} strokeWidth={1}/>{Array.from({length:Math.ceil(sy/sp)},(_,i)=>i>0&&<Line key={`h${i}`} x1={cx+2} y1={i*sp} x2={w} y2={i*sp} stroke={fg} strokeWidth={0.4} strokeDasharray="4,8"/>)}</G>;
  }
  if (type === 'math') {
    const g=20;
    return <G opacity={0.1}>{Array.from({length:Math.ceil(h/g)+1},(_,i)=><Line key={`mh${i}`} x1={0} y1={i*g} x2={w} y2={i*g} stroke={fg} strokeWidth={i%5===0?.8:.4}/>)}{Array.from({length:Math.ceil(w/g)+1},(_,i)=><Line key={`mv${i}`} x1={i*g} y1={0} x2={i*g} y2={h} stroke={fg} strokeWidth={i%5===0?.8:.4}/>)}</G>;
  }
  if (type === 'dotted') {
    const gap=28; const d:any[]=[];
    for(let r=1;r<Math.ceil(h/gap);r++) for(let c=1;c<Math.ceil(w/gap);c++) d.push(<Circle key={`${r}-${c}`} cx={c*gap} cy={r*gap} r={1.3} fill={fg} opacity={0.28}/>);
    return <G>{d}</G>;
  }
  if (type === 'isometric') {
    const sz=32,rows=Math.ceil(h/(sz*.866))+2,cols=Math.ceil(w/sz)+2; const ls:any[]=[];
    for(let i=0;i<rows;i++) ls.push(<Line key={`ih${i}`} x1={0} y1={i*sz*.866} x2={w} y2={i*sz*.866} stroke={fg} strokeWidth={0.4} opacity={0.1}/>);
    for(let i=-rows;i<cols+rows;i++){ls.push(<Line key={`ir${i}`} x1={i*sz} y1={0} x2={i*sz+rows*sz*.5} y2={h} stroke={fg} strokeWidth={0.4} opacity={0.1}/>);ls.push(<Line key={`il${i}`} x1={i*sz} y1={0} x2={i*sz-rows*sz*.5} y2={h} stroke={fg} strokeWidth={0.4} opacity={0.1}/>);}
    return <G>{ls}</G>;
  }
  if (type === 'music') {
    const ls:any[]=[];
    for(let g=0;g<Math.floor(h/64);g++){const by=g*64+12;for(let l=0;l<5;l++) ls.push(<Line key={`${g}-${l}`} x1={12} y1={by+l*8} x2={w-12} y2={by+l*8} stroke={fg} strokeWidth={0.9} opacity={0.23}/>);}
    return <G>{ls}</G>;
  }
  if (type === 'bullet') {
    const ls:any[]=[];
    for(let i=1;i<Math.ceil(h/36);i++){ls.push(<Circle key={`c${i}`} cx={20} cy={i*36} r={2.5} fill={fg} opacity={0.23}/>);ls.push(<Line key={`l${i}`} x1={40} y1={i*36} x2={w-16} y2={i*36} stroke={fg} strokeWidth={0.5} opacity={0.1}/>);}
    return <G>{ls}</G>;
  }
  if (type === 'weekly') {
    const cw=w/7, hh=28, hs=(h-hh)/12; const ls:any[]=[];
    for(let i=0;i<=7;i++) ls.push(<Line key={`v${i}`} x1={i*cw} y1={0} x2={i*cw} y2={h} stroke={fg} strokeWidth={0.6} opacity={0.15}/>);
    ls.push(<Line key="hh" x1={0} y1={hh} x2={w} y2={hh} stroke={fg} strokeWidth={0.8} opacity={0.2}/>);
    for(let i=1;i<=12;i++) ls.push(<Line key={`hr${i}`} x1={0} y1={hh+i*hs} x2={w} y2={hh+i*hs} stroke={fg} strokeWidth={0.4} opacity={0.08}/>);
    return <G>{ls}</G>;
  }
  if (type === 'timeline') {
    const cx=w/2,step=80; const ls:any[]=[];
    ls.push(<Line key="m" x1={cx} y1={20} x2={cx} y2={h-20} stroke={fg} strokeWidth={2} opacity={0.15}/>);
    for(let i=0;i<Math.floor(h/step);i++){const y=(i+1)*step;const il=i%2===0;ls.push(<Line key={`t${i}`} x1={cx-26} y1={y} x2={cx+26} y2={y} stroke={fg} strokeWidth={1.5} opacity={0.2}/>);ls.push(<Line key={`a${i}`} x1={il?cx-26:cx+26} y1={y} x2={il?18:w-18} y2={y} stroke={fg} strokeWidth={0.5} strokeDasharray="4,6" opacity={0.1}/>);}
    return <G>{ls}</G>;
  }
  if (type === 'hexagonal') {
    const sz=22,hw=sz*2,hh2=Math.sqrt(3)*sz; const hs:any[]=[];
    for(let r=0;r<Math.ceil(h/hh2)+1;r++) for(let c=0;c<Math.ceil(w/hw)+1;c++){const cx2=c*hw*.75,cy2=r*hh2+(c%2===0?0:hh2/2);const pts=Array.from({length:6},(_,i)=>{const a=Math.PI/180*(60*i-30);return`${cx2+sz*Math.cos(a)},${cy2+sz*Math.sin(a)}`;}).join(' ');hs.push(<Polygon key={`${r}-${c}`} points={pts} stroke={fg} strokeWidth={0.5} fill="none" opacity={0.1}/>);}
    return <G>{hs}</G>;
  }
  return null;
}

type UndoEntry =
  | { k: 'stroke'; s: Stroke }
  | { k: 'shape';  s: CanvasShape }
  | { k: 'tb_add'; tb: TextBox }
  | { k: 'tb_del'; tb: TextBox };

// ─────────────────────────────────────────────────────────────────────────────
export default function CanvasScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [strokes,  setStrokes]  = useState<Stroke[]>([]);
  const [shapes,   setShapes]   = useState<CanvasShape[]>([]);
  const [tbs,      setTbs]      = useState<TextBox[]>([]);
  const [tmpl,     setTmpl]     = useState<PageTemplate>('grid');
  const [bgKey,    setBgKey]    = useState('navy');
  const [pageId,   setPageId]   = useState('');
  const [saved,    setSaved]    = useState(true);

  const [mode,     setMode]     = useState<Mode>('draw');
  const [dtool,    setDtool]    = useState<DrawTool>('pen');
  const [stool,    setStool]    = useState<ShapeType>('rect');
  const [color,    setColor]    = useState(COLORS[0]);
  const [width,    setWidth]    = useState(2);

  const [showClr,  setShowClr]  = useState(false);
  const [showSh,   setShowSh]   = useState(false);
  const [showTmpl, setShowTmpl] = useState(false);

  const [selTb,    setSelTb]    = useState<string | null>(null);
  const [editTb,   setEditTb]   = useState<string | null>(null);

  const [curPts,   setCurPts]   = useState<number[]>([]);
  const [preview,  setPreview]  = useState<CanvasShape | null>(null);

  const [aiLoad,   setAiLoad]   = useState(false);
  const [aiOpen,   setAiOpen]   = useState(false);
  const [aiText,   setAiText]   = useState('');

  // refs
  const mR   = useRef<Mode>('draw');
  const dtR  = useRef<DrawTool>('pen');
  const stR  = useRef<ShapeType>('rect');
  const clR  = useRef(COLORS[0]);
  const wdR  = useRef(2);
  const ssR  = useRef<Stroke[]>([]);
  const shR  = useRef<CanvasShape[]>([]);
  const tbR  = useRef<TextBox[]>([]);
  const selR = useRef<string|null>(null);
  const edR  = useRef<string|null>(null);
  const undo = useRef<UndoEntry[]>([]);
  const ss0  = useRef<{x:number;y:number}|null>(null);
  const tmr  = useRef<ReturnType<typeof setTimeout>|null>(null);
  // TextInput refs
  const inpR = useRef<Record<string, TextInput|null>>({});

  useEffect(() => { mR.current  = mode;  }, [mode]);
  useEffect(() => { dtR.current = dtool; }, [dtool]);
  useEffect(() => { stR.current = stool; }, [stool]);
  useEffect(() => { clR.current = color; }, [color]);
  useEffect(() => { wdR.current = width; }, [width]);
  useEffect(() => { selR.current = selTb; }, [selTb]);
  useEffect(() => { edR.current  = editTb; }, [editTb]);

  // Focus input when editTb changes
  useEffect(() => {
    if (editTb) setTimeout(() => inpR.current[editTb]?.focus(), 80);
  }, [editTb]);

  useEffect(() => {
    if (!id) return;
    getLecture(id).then(l => {
      if (!l) return;
      const p = l.pages[0] as any;
      if (!p) return;
      ssR.current = p.strokes  || [];
      shR.current = p.shapes   || [];
      tbR.current = p.textBoxes || [];
      setStrokes([...ssR.current]);
      setShapes([...shR.current]);
      setTbs([...tbR.current]);
      setTmpl(p.type || 'grid');
      setBgKey(p.canvasBgKey || 'navy');
      setPageId(p.id);
    });
  }, [id]);

  const save = useCallback(() => {
    setSaved(false);
    if (tmr.current) clearTimeout(tmr.current);
    tmr.current = setTimeout(async () => {
      if (!id || !pageId) return;
      const l = await getLecture(id);
      if (!l) return;
      await updateLecture(id, {
        pages: l.pages.map((p: LecturePage) =>
          p.id === pageId
            ? { ...p, strokes: ssR.current, shapes: shR.current, textBoxes: tbR.current }
            : p
        ),
      });
      setSaved(true);
    }, 1400);
  }, [id, pageId]);

  const saveMeta = useCallback(async (t: PageTemplate, bk: string) => {
    if (!id || !pageId) return;
    const l = await getLecture(id);
    if (!l) return;
    await updateLecture(id, {
      pages: l.pages.map((p: LecturePage) =>
        p.id === pageId ? { ...p, type: t, canvasBgKey: bk } : p
      ),
    });
  }, [id, pageId]);

  // ── PanResponder — ALL modes go through here ──────────────────────
  const pan = useRef(PanResponder.create({
    // Only activate PanResponder when we're NOT actively editing a text box
    onStartShouldSetPanResponder: () => !edR.current,
    onMoveShouldSetPanResponder:  () => !edR.current && mR.current !== 'text',

    onPanResponderGrant: (e) => {
      const { locationX: lx, locationY: ly } = e.nativeEvent;

      if (mR.current === 'text') {
        // Hit-test: is the tap on an existing text box?
        const hit = tbR.current.find(tb =>
          lx >= tb.x - 8 && lx <= tb.x + tb.width + 8 &&
          ly >= tb.y - 8 && ly <= tb.y + tb.height + 50
        );
        if (hit) {
          // Select + enter edit
          setSelTb(hit.id);
          setEditTb(hit.id);
        } else {
          // Deselect if something was selected, OR create a new box
          if (selR.current) {
            setSelTb(null);
            setEditTb(null);
          } else {
            const nb: TextBox = {
              id: uid(), text: '', x: lx, y: ly,
              width: 210, height: 44, fontSize: 16, color: clR.current,
            };
            tbR.current = [...tbR.current, nb];
            setTbs([...tbR.current]);
            undo.current.push({ k: 'tb_add', tb: nb });
            setSelTb(nb.id);
            setEditTb(nb.id);
            save();
          }
        }
        return;
      }

      if (mR.current === 'draw') setCurPts([lx, ly]);
      else if (mR.current === 'shape') { ss0.current = { x: lx, y: ly }; setPreview(null); }
    },

    onPanResponderMove: (e) => {
      const { locationX: lx, locationY: ly } = e.nativeEvent;
      if (mR.current === 'draw') setCurPts(prev => [...prev, lx, ly]);
      else if (mR.current === 'shape' && ss0.current)
        setPreview({ id:'_', type: stR.current, x1: ss0.current.x, y1: ss0.current.y, x2: lx, y2: ly, color: clR.current, strokeWidth: wdR.current, filled: false });
    },

    onPanResponderRelease: (e) => {
      const { locationX: lx, locationY: ly } = e.nativeEvent;

      if (mR.current === 'draw') {
        setCurPts(prev => {
          if (prev.length >= 4) {
            const t = dtR.current;
            if (t === 'eraser') {
              ssR.current = ssR.current.slice(0, -1);
            } else {
              const ns: Stroke = {
                id: uid(), points: prev,
                color: t === 'highlighter' ? clR.current + '66' : clR.current,
                width: t === 'highlighter' ? 14 : wdR.current,
                tool: t,
              };
              ssR.current = [...ssR.current, ns];
              undo.current.push({ k: 'stroke', s: ns });
            }
            setStrokes([...ssR.current]);
            save();
          }
          return [];
        });
      } else if (mR.current === 'shape' && ss0.current) {
        const s = ss0.current;
        if (Math.abs(lx-s.x) > 5 || Math.abs(ly-s.y) > 5) {
          const ns: CanvasShape = {
            id: uid(), type: stR.current,
            x1: s.x, y1: s.y, x2: lx, y2: ly,
            color: clR.current, strokeWidth: wdR.current, filled: false,
          };
          shR.current = [...shR.current, ns];
          setShapes([...shR.current]);
          undo.current.push({ k: 'shape', s: ns });
          save();
        }
        ss0.current = null;
        setPreview(null);
      }
    },
  })).current;

  // ── Actions ───────────────────────────────────────────────────────
  const doUndo = () => {
    Haptics.selectionAsync();
    const e = undo.current.pop();
    if (!e) return;
    if (e.k === 'stroke') {
      ssR.current = ssR.current.filter(x => x.id !== e.s.id);
      setStrokes([...ssR.current]);
    } else if (e.k === 'shape') {
      shR.current = shR.current.filter(x => x.id !== e.s.id);
      setShapes([...shR.current]);
    } else if (e.k === 'tb_add') {
      tbR.current = tbR.current.filter(x => x.id !== e.tb.id);
      setTbs([...tbR.current]);
      if (selTb === e.tb.id) { setSelTb(null); setEditTb(null); }
    } else if (e.k === 'tb_del') {
      tbR.current = [...tbR.current, e.tb];
      setTbs([...tbR.current]);
    }
    save();
  };

  const deleteTb = useCallback((tbId: string) => {
    const tb = tbR.current.find(x => x.id === tbId);
    if (tb) undo.current.push({ k: 'tb_del', tb });
    tbR.current = tbR.current.filter(x => x.id !== tbId);
    setTbs([...tbR.current]);
    setSelTb(null); setEditTb(null);
    save(); Haptics.selectionAsync();
  }, [save]);

  const updateTb = useCallback((tbId: string, text: string) => {
    tbR.current = tbR.current.map(x => x.id === tbId ? { ...x, text } : x);
    setTbs([...tbR.current]);
    save();
  }, [save]);

  const moveTb = useCallback((tbId: string, dx: number, dy: number) => {
    tbR.current = tbR.current.map(x => x.id === tbId ? { ...x, x: x.x+dx, y: x.y+dy } : x);
    setTbs([...tbR.current]);
    save();
  }, [save]);

  const clearAll = () => Alert.alert('مسح الكل', 'مسح جميع الرسومات؟', [
    { text: 'إلغاء', style: 'cancel' },
    { text: 'مسح', style: 'destructive', onPress: () => {
      ssR.current=[]; shR.current=[]; tbR.current=[];
      setStrokes([]); setShapes([]); setTbs([]);
      setSelTb(null); setEditTb(null); undo.current=[];
      save(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }},
  ]);

  const analyzeCanvas = async () => {
    setAiOpen(true); setAiText(''); setAiLoad(true);
    try {
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const svgEl = document.querySelector('[data-canvas-svg]') as SVGSVGElement|null;
        if (svgEl) {
          const blob = new Blob([new XMLSerializer().serializeToString(svgEl)], { type: 'image/svg+xml' });
          const url  = URL.createObjectURL(blob);
          const cvs  = document.createElement('canvas');
          cvs.width=SCR_W; cvs.height=canH;
          const ctx  = cvs.getContext('2d')!;
          ctx.fillStyle = activeBg; ctx.fillRect(0,0,SCR_W,canH);
          await new Promise<void>(res => { const img=new window.Image(); img.onload=()=>{ctx.drawImage(img,0,0);URL.revokeObjectURL(url);res();}; img.onerror=()=>res(); img.src=url; });
          const b64 = cvs.toDataURL('image/jpeg',.85).split(',')[1];
          if (b64) { setAiText(await analyzeHandwriting(b64)); setAiLoad(false); return; }
        }
      }
      setAiText('ارسم شيئاً ثم اضغط تحليل مرة أخرى.');
    } catch { setAiText('حدث خطأ. سيتم إعادة المحاولة لاحقاً.'); }
    finally { setAiLoad(false); }
  };

  const addToTranscript = async () => {
    if (!id||!aiText) return;
    const l = await getLecture(id);
    if (!l) return;
    await updateLecture(id, { transcript: l.transcript ? `${l.transcript}\n\n${aiText}` : aiText });
    setAiOpen(false); Alert.alert('تمّ ✓','تمت الإضافة إلى نص المحاضرة');
  };

  const activeBg = BACKGROUNDS.find(b=>b.key===bgKey)?.color ?? '#0D1321';
  const darkBg   = ['navy','black','chalk','teal','gray'].includes(bgKey);
  const tmplFg   = darkBg ? '#FFFFFF' : '#000000';
  const canH     = SCR_H - insets.top - (Platform.OS==='web' ? 172 : 148);

  return (
    <View style={[st.root, { paddingTop: insets.top, backgroundColor: colors.background }]}>

      {/* Header */}
      <View style={[st.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.ib}>
          <Ionicons name="chevron-back" size={22} color={colors.foreground}/>
        </TouchableOpacity>
        <Text style={[st.htitle, { color: colors.foreground }]}>لوحة الكتابة</Text>
        <View style={{ flexDirection:'row', gap:8, alignItems:'center' }}>
          <TouchableOpacity style={[st.ib, { backgroundColor:colors.card, borderWidth:1, borderColor:colors.border }]} onPress={()=>setShowTmpl(true)}>
            <Ionicons name="grid-outline" size={17} color={colors.muted}/>
          </TouchableOpacity>
          <TouchableOpacity style={[st.ib, { backgroundColor:colors.card, borderWidth:1, borderColor:colors.border }]} onPress={analyzeCanvas}>
            <Ionicons name="sparkles-outline" size={17} color={colors.accent}/>
          </TouchableOpacity>
          {saved
            ? <Ionicons name="checkmark-circle" size={16} color={colors.accent}/>
            : <Text style={{ fontFamily:'Tajawal_400Regular', fontSize:11, color:colors.muted }}>حفظ...</Text>
          }
        </View>
      </View>

      {/* Toolbar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={[st.bar, { backgroundColor:colors.surface, borderBottomColor:colors.border }]}
        contentContainerStyle={st.barC}
      >
        {/* Draw tools */}
        {(['pen','pencil','highlighter','eraser'] as DrawTool[]).map(t => (
          <TouchableOpacity key={t}
            style={[st.tb, { backgroundColor:colors.card, borderColor:colors.border },
              mode==='draw'&&dtool===t&&{ borderColor:colors.primary, backgroundColor:colors.primary+'22' }]}
            onPress={()=>{ setMode('draw'); setDtool(t); setShowSh(false); setSelTb(null); setEditTb(null); Haptics.selectionAsync(); }}
          >
            <Ionicons name={t==='pen'?'create':t==='pencil'?'pencil':t==='highlighter'?'brush':'square'} size={17}
              color={mode==='draw'&&dtool===t?colors.primary:colors.mutedForeground}/>
          </TouchableOpacity>
        ))}
        <View style={[st.sep, { backgroundColor:colors.border }]}/>
        {/* Shape */}
        <TouchableOpacity
          style={[st.tb, { backgroundColor:colors.card, borderColor:colors.border },
            mode==='shape'&&{ borderColor:colors.primary, backgroundColor:colors.primary+'22' }]}
          onPress={()=>{ setMode('shape'); setShowSh(!showSh); setShowClr(false); setSelTb(null); setEditTb(null); Haptics.selectionAsync(); }}
        >
          <Ionicons name="shapes-outline" size={17} color={mode==='shape'?colors.primary:colors.mutedForeground}/>
        </TouchableOpacity>
        {/* Text */}
        <TouchableOpacity
          style={[st.tb, { backgroundColor:colors.card, borderColor:colors.border },
            mode==='text'&&{ borderColor:colors.accent, backgroundColor:colors.accent+'22' }]}
          onPress={()=>{ setMode('text'); setShowSh(false); setShowClr(false); Haptics.selectionAsync(); }}
        >
          <Ionicons name="text" size={17} color={mode==='text'?colors.accent:colors.mutedForeground}/>
        </TouchableOpacity>
        <View style={[st.sep, { backgroundColor:colors.border }]}/>
        {/* Colour */}
        <TouchableOpacity onPress={()=>{ setShowClr(!showClr); setShowSh(false); }}>
          <View style={{ width:28, height:28, borderRadius:14, backgroundColor:color, borderWidth:2.5, borderColor:colors.surfaceElevated }}/>
        </TouchableOpacity>
        {/* Widths */}
        {[1.5,2.5,4].map(w => (
          <TouchableOpacity key={w}
            style={[st.tb, { backgroundColor:colors.card, borderColor:width===w?colors.primary:colors.border },
              width===w&&{ backgroundColor:colors.primary+'18' }]}
            onPress={()=>{ setWidth(w); Haptics.selectionAsync(); }}
          >
            <View style={{ width:w*3.5, height:w*3.5, borderRadius:w*3.5, backgroundColor:colors.foreground }}/>
          </TouchableOpacity>
        ))}
        <View style={[st.sep, { backgroundColor:colors.border }]}/>
        {/* Undo */}
        <TouchableOpacity style={[st.tb, { backgroundColor:colors.card, borderColor:colors.border }]} onPress={doUndo}>
          <Ionicons name="arrow-undo" size={17} color={colors.mutedForeground}/>
        </TouchableOpacity>
        {/* Clear */}
        <TouchableOpacity style={[st.tb, { backgroundColor:colors.card, borderColor:colors.border }]} onPress={clearAll}>
          <Ionicons name="trash-outline" size={17} color={colors.accentDanger}/>
        </TouchableOpacity>
        {/* Delete selected tb */}
        {selTb && (
          <>
            <View style={[st.sep, { backgroundColor:colors.border }]}/>
            <TouchableOpacity
              style={[st.tb, { backgroundColor:colors.accentDanger+'22', borderColor:colors.accentDanger }]}
              onPress={()=>deleteTb(selTb)}
            >
              <Ionicons name="trash" size={17} color={colors.accentDanger}/>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Colour palette */}
      {showClr && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={[st.pal, { backgroundColor:colors.surfaceElevated, borderBottomColor:colors.border }]}
          contentContainerStyle={st.palC}
        >
          {COLORS.map(c=>(
            <TouchableOpacity key={c} onPress={()=>{ setColor(c); setShowClr(false); }}>
              <View style={[st.dot, { backgroundColor:c }, color===c&&{ borderWidth:3, borderColor:colors.primary }]}/>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      {/* Shape picker */}
      {showSh && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={[st.pal, { backgroundColor:colors.surfaceElevated, borderBottomColor:colors.border }]}
          contentContainerStyle={st.palC}
        >
          {SHAPES.map(sh=>(
            <TouchableOpacity key={sh.t}
              style={[st.shbtn, { backgroundColor:colors.card, borderColor:stool===sh.t?colors.primary:colors.border },
                stool===sh.t&&{ backgroundColor:colors.primary+'18' }]}
              onPress={()=>{ setStool(sh.t); setShowSh(false); Haptics.selectionAsync(); }}
            >
              <Ionicons name={sh.icon as any} size={20} color={stool===sh.t?colors.primary:colors.mutedForeground}/>
              <Text style={{ fontFamily:'Tajawal_400Regular', fontSize:10, color:stool===sh.t?colors.primary:colors.mutedForeground }}>{sh.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Mode hints */}
      {mode==='text' && (
        <View style={[st.hint, { backgroundColor:colors.accent+'14' }]}>
          <Ionicons name="information-circle-outline" size={13} color={colors.accent}/>
          <Text style={[st.hintT, { color:colors.accent }]}>
            {editTb ? '✏️ تعديل نشط — اكتب الآن'
              : selTb ? '📌 محدد — اضغط ✕ في الشريط للحذف أو اضغط الخانة مجدداً للتعديل'
              : '👆 اضغط على اللوحة لإنشاء مربع نص'}
          </Text>
        </View>
      )}
      {mode==='shape' && (
        <View style={[st.hint, { backgroundColor:colors.primary+'12' }]}>
          <Ionicons name="information-circle-outline" size={13} color={colors.primary}/>
          <Text style={[st.hintT, { color:colors.primary }]}>اسحب لرسم {SHAPES.find(x=>x.t===stool)?.label}</Text>
        </View>
      )}

      {/* ── Canvas ── */}
      <View style={{ height: canH }}>

        {/* Drawing surface */}
        <View
          style={{ flex:1, backgroundColor: activeBg, overflow:'hidden' }}
          {...pan.panHandlers}
        >
          <Svg
            style={StyleSheet.absoluteFill}
            width={SCR_W}
            height={canH}
            {...(Platform.OS==='web' ? { 'data-canvas-svg':'true' } as any : {})}
          >
            <Template type={tmpl} w={SCR_W} h={canH} fg={tmplFg}/>
            {strokes.map(s=>(
              <Path key={s.id} d={toPath(s.points)} stroke={s.color}
                strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            ))}
            {curPts.length>=4 && (
              <Path d={toPath(curPts)}
                stroke={dtool==='highlighter'?color+'66':color}
                strokeWidth={dtool==='highlighter'?14:width}
                strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            )}
            {shapes.map(s=><ShapeSvg key={s.id} s={s}/>)}
            {preview && <ShapeSvg s={preview} preview/>}
          </Svg>
        </View>

        {/* Text-box overlay */}
        <View style={[StyleSheet.absoluteFill, { pointerEvents: 'box-none' } as any]}>
          {tbs.map(tb => (
            <TBView
              key={tb.id}
              tb={tb}
              isSel={selTb===tb.id}
              isEd={editTb===tb.id}
              mode={mode}
              colors={colors}
              getRef={(r)=>{ inpR.current[tb.id]=r; }}
              onTap={()=>{ setSelTb(tb.id); setEditTb(tb.id); }}
              onBlur={()=>setEditTb(null)}
              onChange={(t)=>updateTb(tb.id,t)}
              onDelete={()=>deleteTb(tb.id)}
              onMove={(dx,dy)=>moveTb(tb.id,dx,dy)}
            />
          ))}
        </View>

      </View>

      {/* Template modal */}
      <Modal visible={showTmpl} transparent animationType="slide">
        <View style={st.overlay}>
          <View style={[st.sheet, { backgroundColor:colors.surfaceElevated, borderTopColor:colors.border }]}>
            <View style={st.shRow}>
              <Text style={[st.shTitle, { color:colors.foreground }]}>نموذج الصفحة</Text>
              <TouchableOpacity onPress={()=>setShowTmpl(false)}>
                <Ionicons name="close" size={22} color={colors.foreground}/>
              </TouchableOpacity>
            </View>
            <Text style={[st.slabel, { color:colors.muted }]}>خلفية اللوحة</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap:12, paddingBottom:4 }}>
              {BACKGROUNDS.map(bg=>(
                <TouchableOpacity key={bg.key} onPress={()=>{ setBgKey(bg.key); saveMeta(tmpl,bg.key); Haptics.selectionAsync(); }} style={{ alignItems:'center', gap:4 }}>
                  <View style={{ width:44, height:44, borderRadius:12, backgroundColor:bg.color, borderWidth:bgKey===bg.key?3:1.5, borderColor:bgKey===bg.key?colors.primary:colors.border }}/>
                  <Text style={{ fontFamily:'Tajawal_400Regular', fontSize:10, color:colors.muted }}>{bg.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={[st.slabel, { color:colors.muted, marginTop:10 }]}>نمط الخطوط</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight:250 }}>
              <View style={st.tgrid}>
                {TEMPLATES.map(x=>(
                  <TouchableOpacity key={x.t}
                    style={[st.tcard, { backgroundColor:colors.card, borderColor:tmpl===x.t?colors.primary:colors.border },
                      tmpl===x.t&&{ backgroundColor:colors.primary+'12' }]}
                    onPress={()=>{ setTmpl(x.t); saveMeta(x.t,bgKey); Haptics.selectionAsync(); }}
                  >
                    <Ionicons name={x.icon as any} size={26} color={tmpl===x.t?colors.primary:colors.muted}/>
                    <Text style={{ fontFamily:'Tajawal_500Medium', fontSize:11, color:tmpl===x.t?colors.primary:colors.muted }}>{x.label}</Text>
                    {tmpl===x.t && <Ionicons name="checkmark-circle" size={12} color={colors.primary} style={{ position:'absolute', top:4, right:4 }}/>}
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* AI modal */}
      <Modal visible={aiOpen} transparent animationType="slide">
        <View style={st.overlay}>
          <View style={[st.sheet, { backgroundColor:colors.surfaceElevated, borderTopColor:colors.border }]}>
            <View style={st.shRow}>
              <View>
                <Text style={[st.shTitle, { color:colors.foreground }]}>تحليل اللوحة</Text>
                <Text style={{ fontFamily:'Tajawal_400Regular', fontSize:11, color:colors.muted }}>{AI_PROVIDER_INFO.label()}</Text>
              </View>
              <TouchableOpacity onPress={()=>setAiOpen(false)}>
                <Ionicons name="close" size={22} color={colors.foreground}/>
              </TouchableOpacity>
            </View>
            {aiLoad
              ? <View style={{ alignItems:'center', padding:28, gap:12 }}><ActivityIndicator size="large" color={colors.primary}/><Text style={{ fontFamily:'Tajawal_400Regular', fontSize:14, color:colors.muted }}>يحلّل...</Text></View>
              : <>
                  <ScrollView style={{ maxHeight:260 }}>
                    <Text style={{ fontFamily:'Tajawal_400Regular', fontSize:14, color:colors.foreground, lineHeight:24, textAlign:'right' }}>{aiText}</Text>
                  </ScrollView>
                  {!!aiText && (
                    <TouchableOpacity style={[st.abtn, { backgroundColor:colors.primary }]} onPress={addToTranscript}>
                      <Ionicons name="add-circle-outline" size={18} color="#fff"/>
                      <Text style={{ fontFamily:'Tajawal_700Bold', fontSize:15, color:'#fff' }}>إضافة إلى نص المحاضرة</Text>
                    </TouchableOpacity>
                  )}
                </>
            }
          </View>
        </View>
      </Modal>

    </View>
  );
}

// ── TextBox component ─────────────────────────────────────────────────
interface TBProps {
  tb: TextBox; isSel: boolean; isEd: boolean; mode: Mode;
  colors: any; getRef: (r: TextInput|null)=>void;
  onTap:()=>void; onBlur:()=>void; onChange:(t:string)=>void;
  onDelete:()=>void; onMove:(dx:number,dy:number)=>void;
}

function TBView({ tb, isSel, isEd, mode, colors, getRef, onTap, onBlur, onChange, onDelete, onMove }: TBProps) {
  const lp = useRef<{x:number;y:number}|null>(null);

  const dpr = useRef(PanResponder.create({
    onStartShouldSetPanResponder: ()=>true,
    onMoveShouldSetPanResponder:  ()=>true,
    onPanResponderGrant: e=>{ lp.current={x:e.nativeEvent.pageX,y:e.nativeEvent.pageY}; },
    onPanResponderMove: e=>{ if(lp.current){onMove(e.nativeEvent.pageX-lp.current.x,e.nativeEvent.pageY-lp.current.y);lp.current={x:e.nativeEvent.pageX,y:e.nativeEvent.pageY};} },
    onPanResponderRelease: ()=>{ lp.current=null; },
  })).current;

  // In draw/shape mode: text-only display, no events
  if (mode !== 'text') {
    return (
      <View style={{ position:'absolute', left:tb.x, top:tb.y, width:tb.width, padding:6, minHeight:tb.height, pointerEvents:'none' } as any}>
        {!!tb.text && <Text style={{ fontFamily:'Tajawal_400Regular', fontSize:tb.fontSize, color:tb.color, textAlign:'right' }}>{tb.text}</Text>}
      </View>
    );
  }

  return (
    <View
      style={{
        position: 'absolute', left: tb.x, top: tb.y, width: tb.width,
        minHeight: tb.height,
        borderWidth: isSel ? 2 : 1,
        borderColor: isSel ? colors.primary : colors.primary+'44',
        borderRadius: 9,
        borderStyle: isSel ? 'solid' : 'dashed',
        backgroundColor: isSel ? colors.surface+'EE' : colors.surface+'22',
      }}
    >
      {/* Quick delete badge — always visible in text mode */}
      <TouchableOpacity
        onPress={onDelete}
        style={{
          position:'absolute', top:-11, right:-11, zIndex:20,
          width:22, height:22, borderRadius:11,
          backgroundColor: colors.accentDanger,
          alignItems:'center', justifyContent:'center',
        }}
      >
        <Ionicons name="close" size={13} color="#fff"/>
      </TouchableOpacity>

      {/* Controls bar — only when selected */}
      {isSel && (
        <View style={{ flexDirection:'row', gap:4, padding:4, alignItems:'center' }}>
          <View {...dpr.panHandlers}
            style={{ padding:5, backgroundColor:colors.surfaceElevated, borderRadius:6 }}>
            <Ionicons name="move-outline" size={12} color={colors.muted}/>
          </View>
          <Text style={{ fontFamily:'Tajawal_400Regular', fontSize:10, color:colors.primary, flex:1, textAlign:'center' }}>
            {isEd ? '✏️ تعديل نشط' : 'اضغط للتعديل'}
          </Text>
          <TouchableOpacity onPress={onDelete}
            style={{ padding:5, backgroundColor:colors.accentDanger+'22', borderRadius:6 }}>
            <Ionicons name="trash-outline" size={12} color={colors.accentDanger}/>
          </TouchableOpacity>
        </View>
      )}

      {/* The actual text input */}
      <TouchableOpacity activeOpacity={0.85} onPress={onTap}>
        <TextInput
          ref={getRef}
          value={tb.text}
          onChangeText={onChange}
          onFocus={onTap}
          onBlur={onBlur}
          multiline
          editable={isEd}
          autoFocus={isEd}
          placeholder={isSel ? 'اكتب هنا...' : tb.text ? '' : '...'}
          placeholderTextColor={colors.mutedForeground}
          style={{
            fontFamily: 'Tajawal_400Regular',
            fontSize: tb.fontSize,
            color: tb.color,
            padding: 6,
            minHeight: 32,
            textAlign: 'right',
            ...(!isEd ? { pointerEvents: 'none' } as any : {}),
          }}
        />
      </TouchableOpacity>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  root:   { flex:1 },
  header: { flexDirection:'row', alignItems:'center', paddingHorizontal:14, paddingVertical:10, borderBottomWidth:1 },
  htitle: { flex:1, fontFamily:'Tajawal_700Bold', fontSize:18 },
  ib:     { padding:6, borderRadius:9 },
  bar:    { maxHeight:54, borderBottomWidth:1 },
  barC:   { flexDirection:'row', alignItems:'center', gap:4, paddingHorizontal:10, paddingVertical:8 },
  tb:     { width:36, height:36, borderRadius:9, alignItems:'center', justifyContent:'center', borderWidth:1 },
  sep:    { width:1, height:24, marginHorizontal:2 },
  pal:    { maxHeight:50, borderBottomWidth:1 },
  palC:   { flexDirection:'row', alignItems:'center', gap:10, paddingHorizontal:12, paddingVertical:10 },
  dot:    { width:28, height:28, borderRadius:14 },
  shbtn:  { alignItems:'center', gap:2, padding:8, borderRadius:10, borderWidth:1, minWidth:54 },
  hint:   { flexDirection:'row', alignItems:'center', gap:6, paddingHorizontal:12, paddingVertical:5 },
  hintT:  { fontFamily:'Tajawal_400Regular', fontSize:12, flex:1 },
  overlay:{ flex:1, backgroundColor:'rgba(0,0,0,0.72)', justifyContent:'flex-end' },
  sheet:  { borderTopLeftRadius:24, borderTopRightRadius:24, padding:20, gap:14, borderTopWidth:1 },
  shRow:  { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  shTitle:{ fontFamily:'Tajawal_700Bold', fontSize:17 },
  slabel: { fontFamily:'Tajawal_500Medium', fontSize:12 },
  tgrid:  { flexDirection:'row', flexWrap:'wrap', gap:8 },
  tcard:  { width:80, alignItems:'center', gap:5, padding:10, borderRadius:12, borderWidth:1 },
  abtn:   { flexDirection:'row', alignItems:'center', gap:8, borderRadius:14, padding:14, justifyContent:'center', marginTop:6 },
});
