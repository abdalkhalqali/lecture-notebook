import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Platform, Image,
  FlatList, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from '@/lib/haptics';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { useColors } from '@/hooks/useColors';
import { Lecture, LectureAttachment, updateLecture, getLecture, QuestionAnswer } from '@/lib/storage';
import {
  summarizeLecture, extractKeyPoints, generateQuestions,
  suggestTags, aiChat, analyzeWhiteboardImage, analyzeDocument, analyzeImageAttachment,
} from '@/lib/ai';

type Tab = 'notes' | 'transcript' | 'ai' | 'files';

function getFileIcon(mimeType: string): { name: string; color: string } {
  if (mimeType.startsWith('image/')) return { name: 'image', color: '#10B981' };
  if (mimeType.includes('pdf')) return { name: 'document', color: '#EF4444' };
  if (mimeType.includes('word') || mimeType.includes('document')) return { name: 'document-text', color: '#3B82F6' };
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return { name: 'easel', color: '#F59E0B' };
  if (mimeType.includes('sheet') || mimeType.includes('excel') || mimeType.includes('csv')) return { name: 'grid', color: '#059669' };
  if (mimeType.includes('text')) return { name: 'document-text', color: '#6366F1' };
  return { name: 'attach', color: '#8B5CF6' };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

let speechRecognition: any = null;

function getSpeechRecognition() {
  if (Platform.OS !== 'web') return null;
  if (typeof window === 'undefined') return null;
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  return SR ? new SR() : null;
}

export default function LectureScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [tab, setTab] = useState<Tab>('notes');
  const [loading, setLoading] = useState(true);

  // Recording
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const durationTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // AI
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAction, setAiAction] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  // Speech-to-text
  const [isListening, setIsListening] = useState(false);
  const [sttSupported] = useState(() => {
    if (Platform.OS !== 'web') return false;
    if (typeof window === 'undefined') return false;
    return !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition;
  });

  // Image analysis modal
  const [analysisModal, setAnalysisModal] = useState(false);
  const [analysisResult, setAnalysisResult] = useState('');
  const [analysisLoading, setAnalysisLoading] = useState(false);

  // File attachments
  const [fileUploading, setFileUploading] = useState(false);
  const [fileAiModal, setFileAiModal] = useState<LectureAttachment | null>(null);
  const [fileAiLoading, setFileAiLoading] = useState(false);
  const [fileAiResult, setFileAiResult] = useState<{
    summary: string; keyPoints: string[]; questions: QuestionAnswer[]; tags: string[];
  } | null>(null);
  const [fileViewerModal, setFileViewerModal] = useState<LectureAttachment | null>(null);

  useEffect(() => {
    if (id) getLecture(id).then(l => { setLecture(l); setLoading(false); });
    return () => {
      if (durationTimer.current) clearInterval(durationTimer.current);
      sound?.unloadAsync();
      if (speechRecognition) { try { speechRecognition.stop(); } catch {} }
    };
  }, [id]);

  const save = useCallback(async (updates: Partial<Lecture>) => {
    if (!lecture) return;
    const updated = { ...lecture, ...updates, updatedAt: Date.now() };
    setLecture(updated);
    await updateLecture(lecture.id, updates);
  }, [lecture]);

  // ── Recording ──────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('إذن الميكروفون', 'نحتاج إذن الميكروفون لتسجيل المحاضرة');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      setRecording(rec);
      setIsRecording(true);
      setRecordDuration(0);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      durationTimer.current = setInterval(() => setRecordDuration(d => d + 1), 1000);
    } catch {
      Alert.alert('خطأ', 'تعذّر بدء التسجيل');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    if (durationTimer.current) clearInterval(durationTimer.current);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      setIsRecording(false);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (uri) {
        await save({ audioUri: uri, audioDuration: Math.round(recordDuration) });
        setTab('transcript');
      }
    } catch {
      setIsRecording(false);
    }
  };

  const playAudio = async () => {
    if (!lecture?.audioUri) return;
    if (sound) {
      if (isPlaying) { await sound.pauseAsync(); setIsPlaying(false); }
      else { await sound.playAsync(); setIsPlaying(true); }
      return;
    }
    const { sound: s } = await Audio.Sound.createAsync(
      { uri: lecture.audioUri }, { shouldPlay: true }
    );
    s.setOnPlaybackStatusUpdate(status => {
      if (status.isLoaded && status.didJustFinish) { setIsPlaying(false); setSound(null); }
    });
    setSound(s);
    setIsPlaying(true);
  };

  // ── Camera / Images ────────────────────────────────────────────────
  const capturePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
        });
        if (!result.canceled && result.assets[0]) {
          const uri = result.assets[0].uri;
          await save({ imageUris: [...(lecture?.imageUris ?? []), uri] });
        }
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });
      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        await save({ imageUris: [...(lecture?.imageUris ?? []), uri] });
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        await save({ imageUris: [...(lecture?.imageUris ?? []), result.assets[0].uri] });
      }
    }
  };

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true,
    });
    if (!result.canceled) {
      const uris = result.assets.map(a => a.uri);
      await save({ imageUris: [...(lecture?.imageUris ?? []), ...uris] });
    }
  };

  const removeImage = (uri: string) => {
    Alert.alert('حذف الصورة', 'هل تريد حذف هذه الصورة؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف', style: 'destructive', onPress: () => {
          save({ imageUris: (lecture?.imageUris ?? []).filter(u => u !== uri) });
        },
      },
    ]);
  };

  const analyzeImage = async (uri: string) => {
    setAnalysisModal(true);
    setAnalysisResult('');
    setAnalysisLoading(true);
    try {
      let base64 = '';
      if (Platform.OS === 'web') {
        const resp = await fetch(uri);
        const blob = await resp.blob();
        base64 = await new Promise<string>(resolve => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const dataUrl = reader.result as string;
            resolve(dataUrl.split(',')[1] ?? '');
          };
          reader.readAsDataURL(blob);
        });
      } else {
        const FileSystem = require('expo-file-system');
        base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      }
      const text = await analyzeWhiteboardImage(base64);
      setAnalysisResult(text);
    } catch {
      setAnalysisResult('تعذّر تحليل الصورة. تحقق من مفتاح الذكاء الاصطناعي.');
    } finally {
      setAnalysisLoading(false);
    }
  };

  const addAnalysisToTranscript = () => {
    if (!analysisResult) return;
    const current = lecture?.transcript ?? '';
    save({ transcript: current ? `${current}\n\n${analysisResult}` : analysisResult });
    setAnalysisModal(false);
    setTab('transcript');
  };

  // ── File Attachments ───────────────────────────────────────────────
  const pickFile = () => {
    if (Platform.OS !== 'web') {
      Alert.alert('رفع الملفات', 'رفع الملفات متاح حالياً على المتصفح فقط');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '*/*';
    input.multiple = true;
    input.onchange = async (e: any) => {
      const files: FileList = e.target.files;
      if (!files || files.length === 0) return;
      setFileUploading(true);
      try {
        const newAttachments: LectureAttachment[] = [];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (file.size > 10 * 1024 * 1024) {
            Alert.alert('الملف كبير', `"${file.name}" أكبر من 10MB. جرّب ملفاً أصغر.`);
            continue;
          }
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          let textContent: string | undefined;
          if (file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.md') || file.name.endsWith('.csv')) {
            textContent = await new Promise<string>((resolve, reject) => {
              const r = new FileReader();
              r.onload = () => resolve(r.result as string);
              r.onerror = reject;
              r.readAsText(file, 'UTF-8');
            });
          }
          newAttachments.push({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 6) + i,
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            size: file.size,
            uri: dataUrl,
            textContent,
            createdAt: Date.now(),
          });
        }
        if (newAttachments.length > 0) {
          const updated = [...(lecture?.attachments ?? []), ...newAttachments];
          await save({ attachments: updated });
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch {
        Alert.alert('خطأ', 'تعذّر رفع الملف');
      } finally {
        setFileUploading(false);
      }
    };
    input.click();
  };

  const removeAttachment = (attId: string) => {
    Alert.alert('حذف الملف', 'هل تريد حذف هذا الملف من المحاضرة؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف', style: 'destructive', onPress: () => {
          const updated = (lecture?.attachments ?? []).filter(a => a.id !== attId);
          save({ attachments: updated });
        },
      },
    ]);
  };

  const openFileAnalysis = async (att: LectureAttachment) => {
    setFileAiModal(att);
    setFileAiResult(null);
    setFileAiLoading(true);
    try {
      if (att.mimeType.startsWith('image/')) {
        const base64 = att.uri.includes(',') ? att.uri.split(',')[1] : att.uri;
        const text = await analyzeImageAttachment(base64, att.mimeType);
        setFileAiResult({
          summary: text, keyPoints: [], questions: [], tags: [],
        });
      } else if (att.textContent) {
        const result = await analyzeDocument(att.textContent, att.name);
        setFileAiResult(result);
      } else {
        const base64 = att.uri.includes(',') ? att.uri.split(',')[1] : att.uri;
        let text = '';
        try {
          text = atob(base64).slice(0, 3000);
        } catch {}
        if (text.trim()) {
          const result = await analyzeDocument(text, att.name);
          setFileAiResult(result);
        } else {
          setFileAiResult({
            summary: `تعذّر استخراج النص من "${att.name}" تلقائياً. يمكنك نسخ المحتوى من الملف ولصقه في تبويب "النص" ثم استخدام الذكاء الاصطناعي هناك.`,
            keyPoints: [], questions: [], tags: [],
          });
        }
      }
    } catch {
      setFileAiResult({ summary: 'تعذّر تحليل الملف. تحقق من الاتصال وحاول مرة أخرى.', keyPoints: [], questions: [], tags: [] });
    } finally {
      setFileAiLoading(false);
    }
  };

  const openFileViewer = (att: LectureAttachment) => {
    if (Platform.OS === 'web') {
      if (att.mimeType.startsWith('image/') || att.mimeType === 'application/pdf' || att.mimeType.startsWith('text/')) {
        setFileViewerModal(att);
      } else {
        const a = document.createElement('a');
        a.href = att.uri;
        a.download = att.name;
        a.click();
      }
    } else {
      Alert.alert('عرض الملف', 'عرض الملفات متاح على المتصفح');
    }
  };

  const addFileResultToLecture = () => {
    if (!fileAiResult) return;
    const updates: Partial<Lecture> = {};
    if (fileAiResult.summary) updates.summary = fileAiResult.summary;
    if (fileAiResult.keyPoints.length > 0) updates.keyPoints = fileAiResult.keyPoints;
    if (fileAiResult.questions.length > 0) updates.questions = fileAiResult.questions;
    if (fileAiResult.tags.length > 0) updates.tags = fileAiResult.tags;
    save(updates);
    setFileAiModal(null);
    setTab('ai');
    Alert.alert('تم', 'تمت إضافة نتائج التحليل إلى تبويب الذكاء الاصطناعي');
  };

  // ── Speech-to-text ─────────────────────────────────────────────────
  const toggleSpeechToText = () => {
    if (!sttSupported) {
      Alert.alert('غير مدعوم', 'التحويل الصوتي متاح فقط على المتصفح');
      return;
    }
    if (isListening) {
      try { speechRecognition?.stop(); } catch {}
      setIsListening(false);
      return;
    }
    try {
      speechRecognition = getSpeechRecognition();
      if (!speechRecognition) return;
      speechRecognition.lang = 'ar-SA';
      speechRecognition.continuous = true;
      speechRecognition.interimResults = false;
      speechRecognition.onresult = (event: any) => {
        let text = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          text += event.results[i][0].transcript + ' ';
        }
        const current = lecture?.transcript ?? '';
        save({ transcript: current ? `${current} ${text.trim()}` : text.trim() });
      };
      speechRecognition.onerror = () => setIsListening(false);
      speechRecognition.onend = () => setIsListening(false);
      speechRecognition.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
    }
  };

  // ── AI Actions ─────────────────────────────────────────────────────
  const runAI = async (action: 'summarize' | 'keypoints' | 'questions' | 'tags') => {
    const text = lecture?.transcript || '';
    if (!text.trim()) {
      Alert.alert('لا يوجد نص', 'أضف نصاً أو سجّل محاضرة أولاً');
      return;
    }
    setAiLoading(true);
    setAiAction(action);
    try {
      if (action === 'summarize') {
        const summary = await summarizeLecture(text);
        await save({ summary });
      } else if (action === 'keypoints') {
        const keyPoints = await extractKeyPoints(text);
        await save({ keyPoints });
      } else if (action === 'questions') {
        const questions = await generateQuestions(text);
        await save({ questions });
      } else if (action === 'tags') {
        const tags = await suggestTags(text);
        await save({ tags });
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('خطأ', 'تعذّر الاتصال بالذكاء الاصطناعي');
    } finally {
      setAiLoading(false);
      setAiAction('');
    }
  };

  const sendChat = async () => {
    if (!chatInput.trim() || !lecture?.transcript) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setChatLoading(true);
    try {
      const reply = await aiChat(userMsg, lecture.transcript);
      setChatMessages(prev => [...prev, { role: 'ai', text: reply }]);
    } catch {
      setChatMessages(prev => [...prev, { role: 'ai', text: 'تعذّر الرد. تحقق من الاتصال.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  const fmtDuration = (sec: number) =>
    `${Math.floor(sec / 60).toString().padStart(2, '0')}:${(sec % 60).toString().padStart(2, '0')}`;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!lecture) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: 'Tajawal_400Regular', color: colors.muted }}>المحاضرة غير موجودة</Text>
      </View>
    );
  }

  const s = styles(colors);
  const images = lecture.imageUris ?? [];

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{lecture.title}</Text>
        <TouchableOpacity onPress={capturePhoto} style={s.headerIconBtn}>
          <Ionicons name="camera" size={20} color={colors.muted} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push(`/lecture/canvas/${lecture.id}`)} style={s.headerIconBtn}>
          <Ionicons name="pencil" size={20} color={colors.accent} />
        </TouchableOpacity>
      </View>

      {/* Recording Bar */}
      <View style={s.recordBar}>
        {isRecording ? (
          <>
            <View style={s.recDot} />
            <Text style={s.recTime}>{fmtDuration(recordDuration)}</Text>
            <Text style={s.recLabel}>جاري التسجيل...</Text>
            <TouchableOpacity style={s.recStopBtn} onPress={stopRecording}>
              <Ionicons name="stop" size={18} color="#fff" />
            </TouchableOpacity>
          </>
        ) : lecture.audioUri ? (
          <>
            <TouchableOpacity style={s.playBtn} onPress={playAudio}>
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={18} color="#fff" />
            </TouchableOpacity>
            <View style={s.waveform}>
              {Array.from({ length: 20 }).map((_, i) => (
                <View
                  key={i}
                  style={[s.waveBar, {
                    height: 4 + ((i * 7 + 3) % 17),
                    opacity: isPlaying ? 1 : 0.4,
                  }]}
                />
              ))}
            </View>
            <Text style={s.recTime}>{fmtDuration(lecture.audioDuration ?? 0)}</Text>
            <TouchableOpacity style={s.recStartBtn} onPress={startRecording}>
              <Ionicons name="mic" size={16} color="#fff" />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity style={s.recStartBtn} onPress={startRecording}>
              <Ionicons name="mic" size={18} color="#fff" />
              <Text style={s.recStartText}>بدء التسجيل</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Tabs */}
      <View style={s.tabBar}>
        {(['notes', 'transcript', 'ai', 'files'] as Tab[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[s.tabBtn, tab === t && s.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>
              {t === 'notes' ? 'ملاحظات' : t === 'transcript' ? 'النص' : t === 'ai' ? 'الذكاء' : 'ملفات'}
            </Text>
            {t === 'notes' && images.length > 0 && (
              <View style={s.tabBadge}><Text style={s.tabBadgeText}>{images.length}</Text></View>
            )}
            {t === 'files' && (lecture?.attachments?.length ?? 0) > 0 && (
              <View style={s.tabBadge}><Text style={s.tabBadgeText}>{lecture.attachments!.length}</Text></View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* ── NOTES TAB ── */}
      {tab === 'notes' && (
        <ScrollView style={s.content} contentContainerStyle={{ padding: 16, gap: 14 }}>
          {/* Images section */}
          {images.length > 0 && (
            <View>
              <Text style={s.sectionLabel}>الصور ({images.length})</Text>
              <FlatList
                horizontal
                data={images}
                keyExtractor={i => i}
                showsHorizontalScrollIndicator={false}
                style={{ marginTop: 8 }}
                renderItem={({ item }) => (
                  <View style={s.thumbContainer}>
                    <Image source={{ uri: item }} style={s.thumb} />
                    <View style={s.thumbActions}>
                      <TouchableOpacity style={s.thumbBtn} onPress={() => analyzeImage(item)}>
                        <Ionicons name="scan" size={14} color={colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity style={s.thumbBtn} onPress={() => removeImage(item)}>
                        <Ionicons name="trash" size={14} color={colors.accentDanger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              />
            </View>
          )}

          {/* Add media buttons */}
          <View style={s.mediaButtons}>
            <TouchableOpacity style={s.mediaBtn} onPress={capturePhoto}>
              <Ionicons name="camera" size={18} color={colors.primary} />
              <Text style={s.mediaBtnText}>كاميرا</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.mediaBtn} onPress={pickFromGallery}>
              <Ionicons name="images" size={18} color={colors.primary} />
              <Text style={s.mediaBtnText}>معرض</Text>
            </TouchableOpacity>
          </View>

          {/* Text notes */}
          <TextInput
            style={s.notesInput}
            multiline
            placeholder="اكتب ملاحظاتك هنا..."
            placeholderTextColor={colors.mutedForeground}
            value={lecture.pages[0]?.textBoxes[0]?.text ?? ''}
            onChangeText={text => {
              const pages = [...lecture.pages];
              if (pages[0]) {
                if (pages[0].textBoxes.length === 0) {
                  pages[0].textBoxes = [{
                    id: 'tb1', text, x: 0, y: 0,
                    width: 300, height: 100, fontSize: 15, color: colors.foreground,
                  }];
                } else {
                  pages[0].textBoxes[0] = { ...pages[0].textBoxes[0], text };
                }
              }
              save({ pages });
            }}
            textAlignVertical="top"
            textAlign="right"
          />
        </ScrollView>
      )}

      {/* ── TRANSCRIPT TAB ── */}
      {tab === 'transcript' && (
        <ScrollView style={s.content} contentContainerStyle={{ padding: 16, gap: 12 }}>
          <View style={s.transcriptHeader}>
            <Text style={s.sectionLabel}>نص المحاضرة</Text>
            {sttSupported && (
              <TouchableOpacity
                style={[s.sttBtn, isListening && s.sttBtnActive]}
                onPress={toggleSpeechToText}
              >
                <Ionicons
                  name={isListening ? 'stop-circle' : 'mic'}
                  size={16}
                  color={isListening ? '#fff' : colors.primary}
                />
                <Text style={[s.sttBtnText, isListening && { color: '#fff' }]}>
                  {isListening ? 'إيقاف' : 'تحدّث'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          {isListening && (
            <View style={s.listeningBanner}>
              <View style={s.listeningDot} />
              <Text style={s.listeningText}>يستمع... تحدث بوضوح بالعربية</Text>
            </View>
          )}
          <TextInput
            style={s.transcriptInput}
            multiline
            placeholder="أضف نص المحاضرة يدوياً أو اضغط 'تحدّث' للإملاء الصوتي..."
            placeholderTextColor={colors.mutedForeground}
            value={lecture.transcript ?? ''}
            onChangeText={text => save({ transcript: text })}
            textAlignVertical="top"
            textAlign="right"
          />
        </ScrollView>
      )}

      {/* ── AI TAB ── */}
      {tab === 'ai' && (
        <View style={s.aiContainer}>
          <View style={s.aiActions}>
            {[
              { key: 'summarize', icon: 'document-text', label: 'ملخص' },
              { key: 'keypoints', icon: 'list', label: 'نقاط رئيسية' },
              { key: 'questions', icon: 'help-circle', label: 'أسئلة + إجابات' },
              { key: 'tags', icon: 'pricetag', label: 'كلمات مفتاحية' },
            ].map(a => (
              <TouchableOpacity
                key={a.key}
                style={[s.aiActionBtn, aiLoading && aiAction === a.key && { opacity: 0.5 }]}
                onPress={() => runAI(a.key as any)}
                disabled={aiLoading}
              >
                {aiLoading && aiAction === a.key
                  ? <ActivityIndicator size={14} color={colors.primary} />
                  : <Ionicons name={a.icon as any} size={14} color={colors.primary} />
                }
                <Text style={s.aiActionText}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView style={s.aiResults} contentContainerStyle={{ padding: 14, gap: 12 }}>
            {lecture.summary && (
              <View style={s.aiCard}>
                <Text style={s.aiCardTitle}>الملخص</Text>
                <Text style={s.aiCardText}>{lecture.summary}</Text>
              </View>
            )}
            {lecture.keyPoints && lecture.keyPoints.length > 0 && (
              <View style={s.aiCard}>
                <Text style={s.aiCardTitle}>النقاط الرئيسية</Text>
                {lecture.keyPoints.map((kp, i) => (
                  <Text key={i} style={s.aiPoint}>• {kp}</Text>
                ))}
              </View>
            )}
            {lecture.questions && lecture.questions.length > 0 && (
              <View style={s.aiCard}>
                <Text style={s.aiCardTitle}>أسئلة متوقعة للاختبار</Text>
                {lecture.questions.map((qa: QuestionAnswer, i: number) => (
                  <View key={i} style={s.qaItem}>
                    <View style={s.qaQuestion}>
                      <Text style={s.qaNum}>{i + 1}</Text>
                      <Text style={s.qaText}>{qa.question}</Text>
                    </View>
                    <View style={s.qaAnswer}>
                      <Ionicons name="checkmark-circle" size={14} color={colors.accent} />
                      <Text style={s.qaAnswerText}>{qa.answer}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
            {lecture.tags && lecture.tags.length > 0 && (
              <View style={s.aiCard}>
                <Text style={s.aiCardTitle}>كلمات مفتاحية</Text>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {lecture.tags.map(t => (
                    <View key={t} style={s.tag}><Text style={s.tagText}>{t}</Text></View>
                  ))}
                </View>
              </View>
            )}

            <View style={s.aiCard}>
              <Text style={s.aiCardTitle}>اسأل عن المحاضرة</Text>
              {chatMessages.map((m, i) => (
                <View key={i} style={[s.chatBubble, m.role === 'user' ? s.chatUser : s.chatAI]}>
                  <Text style={[s.chatText, m.role === 'user' ? s.chatTextUser : s.chatTextAI]}>
                    {m.text}
                  </Text>
                </View>
              ))}
              {chatLoading && <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 8 }} />}
              <View style={s.chatInputRow}>
                <TextInput
                  style={s.chatInput}
                  placeholder="اسأل سؤالاً..."
                  placeholderTextColor={colors.mutedForeground}
                  value={chatInput}
                  onChangeText={setChatInput}
                  textAlign="right"
                />
                <TouchableOpacity style={s.chatSendBtn} onPress={sendChat} disabled={chatLoading}>
                  <Ionicons name="send" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      )}

      {/* ── FILES TAB ── */}
      {tab === 'files' && (
        <View style={{ flex: 1 }}>
          {/* Upload bar */}
          <View style={s.fileUploadBar}>
            <TouchableOpacity
              style={[s.fileUploadBtn, fileUploading && { opacity: 0.5 }]}
              onPress={pickFile}
              disabled={fileUploading}
            >
              {fileUploading
                ? <ActivityIndicator size={16} color="#fff" />
                : <Ionicons name="attach" size={18} color="#fff" />
              }
              <Text style={s.fileUploadBtnText}>{fileUploading ? 'جاري الرفع...' : 'إرفاق ملف'}</Text>
            </TouchableOpacity>
            <Text style={s.fileUploadHint}>PDF، صور، نصوص، بوربوينت...</Text>
          </View>

          {/* File list */}
          {(lecture.attachments ?? []).length === 0 ? (
            <View style={s.fileEmptyState}>
              <Ionicons name="folder-open-outline" size={52} color={colors.muted} />
              <Text style={s.fileEmptyTitle}>لا توجد ملفات مرفقة</Text>
              <Text style={s.fileEmptyHint}>أرفق ملفات PDF أو صور أو نصوص لتحليلها بالذكاء الاصطناعي</Text>
            </View>
          ) : (
            <ScrollView style={s.content} contentContainerStyle={{ padding: 14, gap: 10 }}>
              {(lecture.attachments ?? []).map(att => {
                const icon = getFileIcon(att.mimeType);
                return (
                  <View key={att.id} style={s.fileCard}>
                    <View style={[s.fileIconBox, { backgroundColor: icon.color + '20' }]}>
                      <Ionicons name={icon.name as any} size={26} color={icon.color} />
                    </View>
                    <View style={s.fileInfo}>
                      <Text style={s.fileName} numberOfLines={1}>{att.name}</Text>
                      <Text style={s.fileMeta}>{formatFileSize(att.size)} · {att.mimeType.split('/')[1] ?? att.mimeType}</Text>
                    </View>
                    <View style={s.fileActions}>
                      <TouchableOpacity
                        style={[s.fileActionBtn, { backgroundColor: colors.accent + '18' }]}
                        onPress={() => openFileViewer(att)}
                      >
                        <Ionicons name="eye-outline" size={15} color={colors.accent} />
                        <Text style={[s.fileActionText, { color: colors.accent }]}>عرض</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.fileActionBtn, { backgroundColor: colors.primary + '18' }]}
                        onPress={() => openFileAnalysis(att)}
                      >
                        <Ionicons name="sparkles" size={15} color={colors.primary} />
                        <Text style={[s.fileActionText, { color: colors.primary }]}>تحليل</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.fileActionBtn, { backgroundColor: colors.accentDanger + '15' }]}
                        onPress={() => removeAttachment(att.id)}
                      >
                        <Ionicons name="trash-outline" size={15} color={colors.accentDanger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

      <View style={{ height: insets.bottom + (Platform.OS === 'web' ? 34 : 0) }} />

      {/* File AI Analysis Modal */}
      <Modal visible={!!fileAiModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { maxHeight: '85%' }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle} numberOfLines={1}>
                تحليل: {fileAiModal?.name ?? ''}
              </Text>
              <TouchableOpacity onPress={() => setFileAiModal(null)}>
                <Ionicons name="close" size={22} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            {fileAiLoading ? (
              <View style={{ alignItems: 'center', padding: 40, gap: 12 }}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={s.modalHint}>يحلّل الذكاء الاصطناعي الملف...</Text>
              </View>
            ) : fileAiResult ? (
              <ScrollView style={{ maxHeight: 400 }} contentContainerStyle={{ gap: 12 }}>
                {!!fileAiResult.summary && (
                  <View>
                    <Text style={[s.modalTitle, { fontSize: 13, marginBottom: 4 }]}>الملخص</Text>
                    <Text style={s.modalText}>{fileAiResult.summary}</Text>
                  </View>
                )}
                {fileAiResult.keyPoints.length > 0 && (
                  <View>
                    <Text style={[s.modalTitle, { fontSize: 13, marginBottom: 4 }]}>النقاط الرئيسية</Text>
                    {fileAiResult.keyPoints.map((kp, i) => (
                      <Text key={i} style={[s.modalText, { marginBottom: 2 }]}>• {kp}</Text>
                    ))}
                  </View>
                )}
                {fileAiResult.questions.length > 0 && (
                  <View>
                    <Text style={[s.modalTitle, { fontSize: 13, marginBottom: 4 }]}>أسئلة متوقعة</Text>
                    {fileAiResult.questions.map((qa, i) => (
                      <View key={i} style={{ marginBottom: 6 }}>
                        <Text style={[s.modalText, { fontFamily: 'Tajawal_700Bold' }]}>س: {qa.question}</Text>
                        <Text style={[s.modalText, { color: colors.muted }]}>ج: {qa.answer}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {fileAiResult.tags.length > 0 && (
                  <View>
                    <Text style={[s.modalTitle, { fontSize: 13, marginBottom: 4 }]}>كلمات مفتاحية</Text>
                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                      {fileAiResult.tags.map(t => (
                        <View key={t} style={s.tag}><Text style={s.tagText}>{t}</Text></View>
                      ))}
                    </View>
                  </View>
                )}
              </ScrollView>
            ) : null}
            {fileAiResult && (
              <TouchableOpacity style={s.modalAction} onPress={addFileResultToLecture}>
                <Ionicons name="add-circle" size={18} color="#fff" />
                <Text style={s.modalActionText}>إضافة النتائج إلى المحاضرة</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* File Viewer Modal */}
      <Modal visible={!!fileViewerModal} transparent animationType="fade">
        <View style={[s.modalOverlay, { justifyContent: 'center', padding: 16 }]}>
          <View style={[s.modalSheet, { borderRadius: 18, maxHeight: '90%' }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle} numberOfLines={1}>{fileViewerModal?.name}</Text>
              <TouchableOpacity onPress={() => setFileViewerModal(null)}>
                <Ionicons name="close" size={22} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            {fileViewerModal?.mimeType.startsWith('image/') ? (
              <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ alignItems: 'center', padding: 8 }}>
                <Image
                  source={{ uri: fileViewerModal.uri }}
                  style={{ width: '100%', height: 420, borderRadius: 10 }}
                  resizeMode="contain"
                />
              </ScrollView>
            ) : fileViewerModal?.mimeType === 'application/pdf' ? (
              <View style={{ height: 460, borderRadius: 10, overflow: 'hidden' }}>
                {Platform.OS === 'web' && (
                  <iframe
                    src={fileViewerModal.uri}
                    style={{ width: '100%', height: '100%', border: 'none', borderRadius: 10 }}
                    title={fileViewerModal.name}
                  />
                )}
              </View>
            ) : fileViewerModal?.textContent ? (
              <ScrollView style={{ maxHeight: 400 }} contentContainerStyle={{ padding: 4 }}>
                <Text style={s.modalText}>{fileViewerModal.textContent}</Text>
              </ScrollView>
            ) : (
              <View style={{ alignItems: 'center', padding: 30, gap: 10 }}>
                <Ionicons name="document-outline" size={48} color={colors.muted} />
                <Text style={s.modalHint}>لا يمكن عرض هذا النوع من الملفات مباشرة</Text>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 8 }}>
              {fileViewerModal && (
                <TouchableOpacity
                  style={[s.modalAction, { flex: 1, backgroundColor: colors.primary }]}
                  onPress={() => {
                    setFileViewerModal(null);
                    if (fileViewerModal) openFileAnalysis(fileViewerModal);
                  }}
                >
                  <Ionicons name="sparkles" size={16} color="#fff" />
                  <Text style={s.modalActionText}>تحليل بالذكاء</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Image Analysis Modal */}
      <Modal visible={analysisModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>تحليل الصورة بالذكاء الاصطناعي</Text>
              <TouchableOpacity onPress={() => setAnalysisModal(false)}>
                <Ionicons name="close" size={22} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            {analysisLoading ? (
              <View style={{ alignItems: 'center', padding: 40, gap: 12 }}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={s.modalHint}>يحلّل الصورة...</Text>
              </View>
            ) : (
              <>
                <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ padding: 4 }}>
                  <Text style={s.modalText}>{analysisResult}</Text>
                </ScrollView>
                {!!analysisResult && (
                  <TouchableOpacity style={s.modalAction} onPress={addAnalysisToTranscript}>
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

const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: c.border,
  },
  backBtn: { padding: 4, marginRight: 6 },
  headerTitle: { flex: 1, fontFamily: 'Tajawal_700Bold', fontSize: 18, color: c.foreground },
  headerIconBtn: {
    padding: 7, backgroundColor: c.surface, borderRadius: 9,
    borderWidth: 1, borderColor: c.border, marginLeft: 6,
  },
  recordBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, backgroundColor: c.surface,
    borderBottomWidth: 1, borderBottomColor: c.border,
  },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.recordingRed },
  recTime: { fontFamily: 'Tajawal_700Bold', fontSize: 14, color: c.foreground, minWidth: 40 },
  recLabel: { flex: 1, fontFamily: 'Tajawal_400Regular', fontSize: 13, color: c.muted },
  recStopBtn: { backgroundColor: c.recordingRed, borderRadius: 8, padding: 8 },
  recStartBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: c.recordingRed, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
  },
  recStartText: { fontFamily: 'Tajawal_500Medium', fontSize: 13, color: '#fff' },
  playBtn: { backgroundColor: c.primary, borderRadius: 8, padding: 8 },
  waveform: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: 28 },
  waveBar: { width: 3, backgroundColor: c.waveform, borderRadius: 2 },
  tabBar: {
    flexDirection: 'row', backgroundColor: c.surface,
    borderBottomWidth: 1, borderBottomColor: c.border,
  },
  tabBtn: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
    flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  tabActive: { borderBottomColor: c.primary },
  tabText: { fontFamily: 'Tajawal_500Medium', fontSize: 13, color: c.muted },
  tabTextActive: { color: c.primary },
  tabBadge: {
    backgroundColor: c.primary, borderRadius: 8,
    paddingHorizontal: 5, paddingVertical: 1, minWidth: 16, alignItems: 'center',
  },
  tabBadgeText: { fontFamily: 'Tajawal_700Bold', fontSize: 10, color: '#fff' },
  content: { flex: 1 },
  sectionLabel: { fontFamily: 'Tajawal_700Bold', fontSize: 13, color: c.muted },
  thumbContainer: { marginRight: 10 },
  thumb: { width: 100, height: 80, borderRadius: 10, backgroundColor: c.surface },
  thumbActions: { flexDirection: 'row', gap: 6, marginTop: 4, justifyContent: 'center' },
  thumbBtn: {
    backgroundColor: c.surfaceElevated, borderRadius: 6,
    padding: 5, borderWidth: 1, borderColor: c.border,
  },
  mediaButtons: { flexDirection: 'row', gap: 10 },
  mediaBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: c.primary + '15', borderRadius: 10,
    paddingVertical: 10, borderWidth: 1, borderColor: c.primary + '30',
  },
  mediaBtnText: { fontFamily: 'Tajawal_500Medium', fontSize: 13, color: c.primary },
  notesInput: {
    fontFamily: 'Tajawal_400Regular', fontSize: 15, color: c.foreground,
    lineHeight: 26, minHeight: 200,
  },
  transcriptHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  sttBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: c.primary + '15', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: c.primary + '30',
  },
  sttBtnActive: { backgroundColor: c.recordingRed, borderColor: c.recordingRed },
  sttBtnText: { fontFamily: 'Tajawal_500Medium', fontSize: 12, color: c.primary },
  listeningBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: c.recordingRed + '20', borderRadius: 10,
    padding: 10, borderWidth: 1, borderColor: c.recordingRed + '40',
  },
  listeningDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.recordingRed },
  listeningText: { fontFamily: 'Tajawal_400Regular', fontSize: 13, color: c.recordingRed },
  transcriptInput: {
    fontFamily: 'Tajawal_400Regular', fontSize: 15, color: c.foreground,
    lineHeight: 26, backgroundColor: c.card, borderRadius: 12,
    padding: 14, minHeight: 200, borderWidth: 1, borderColor: c.border,
  },
  aiContainer: { flex: 1 },
  aiActions: {
    flexDirection: 'row', gap: 8, padding: 12, flexWrap: 'wrap',
    backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
  },
  aiActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: c.primary + '15', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: c.primary + '30',
  },
  aiActionText: { fontFamily: 'Tajawal_500Medium', fontSize: 12, color: c.primary },
  aiResults: { flex: 1 },
  aiCard: {
    backgroundColor: c.card, borderRadius: 14, padding: 14, gap: 8,
    borderWidth: 1, borderColor: c.border,
  },
  aiCardTitle: { fontFamily: 'Tajawal_700Bold', fontSize: 14, color: c.primary },
  aiCardText: { fontFamily: 'Tajawal_400Regular', fontSize: 14, color: c.foreground, lineHeight: 22 },
  aiPoint: { fontFamily: 'Tajawal_400Regular', fontSize: 14, color: c.foreground, lineHeight: 24 },
  qaItem: { gap: 4, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.border + '50' },
  qaQuestion: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  qaNum: {
    fontFamily: 'Tajawal_700Bold', fontSize: 12, color: '#fff',
    backgroundColor: c.primary, borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 1, marginTop: 2,
  },
  qaText: { flex: 1, fontFamily: 'Tajawal_500Medium', fontSize: 13, color: c.foreground, lineHeight: 20 },
  qaAnswer: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', paddingLeft: 26 },
  qaAnswerText: { flex: 1, fontFamily: 'Tajawal_400Regular', fontSize: 13, color: c.muted, lineHeight: 20 },
  tag: { backgroundColor: c.primary + '20', borderRadius: 7, paddingHorizontal: 9, paddingVertical: 3 },
  tagText: { fontFamily: 'Tajawal_400Regular', fontSize: 12, color: c.primary },
  chatBubble: { borderRadius: 12, padding: 10, maxWidth: '85%' },
  chatUser: { alignSelf: 'flex-end', backgroundColor: c.primary },
  chatAI: { alignSelf: 'flex-start', backgroundColor: c.surfaceElevated },
  chatText: { fontFamily: 'Tajawal_400Regular', fontSize: 13, lineHeight: 20 },
  chatTextUser: { color: '#fff' },
  chatTextAI: { color: c.foreground },
  chatInputRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  chatInput: {
    flex: 1, backgroundColor: c.surface, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    fontFamily: 'Tajawal_400Regular', fontSize: 13, color: c.foreground,
    borderWidth: 1, borderColor: c.border,
  },
  chatSendBtn: {
    backgroundColor: c.primary, borderRadius: 10, padding: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: c.surfaceElevated, borderTopLeftRadius: 20,
    borderTopRightRadius: 20, padding: 20, gap: 14,
    borderTopWidth: 1, borderColor: c.border,
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
    backgroundColor: c.primary, borderRadius: 12,
    padding: 12, justifyContent: 'center',
  },
  modalActionText: { fontFamily: 'Tajawal_700Bold', fontSize: 14, color: '#fff' },

  // ── Files ──────────────────────────────────────────────────────────
  fileUploadBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, backgroundColor: c.surface,
    borderBottomWidth: 1, borderBottomColor: c.border,
  },
  fileUploadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: c.primary, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 9,
  },
  fileUploadBtnText: { fontFamily: 'Tajawal_700Bold', fontSize: 13, color: '#fff' },
  fileUploadHint: { flex: 1, fontFamily: 'Tajawal_400Regular', fontSize: 12, color: c.muted },
  fileEmptyState: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40,
  },
  fileEmptyTitle: { fontFamily: 'Tajawal_700Bold', fontSize: 16, color: c.foreground },
  fileEmptyHint: {
    fontFamily: 'Tajawal_400Regular', fontSize: 13, color: c.muted,
    textAlign: 'center', lineHeight: 20,
  },
  fileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: c.card, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: c.border,
  },
  fileIconBox: {
    width: 48, height: 48, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  fileInfo: { flex: 1, gap: 3 },
  fileName: { fontFamily: 'Tajawal_700Bold', fontSize: 14, color: c.foreground },
  fileMeta: { fontFamily: 'Tajawal_400Regular', fontSize: 12, color: c.muted },
  fileActions: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  fileActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6,
  },
  fileActionText: { fontFamily: 'Tajawal_500Medium', fontSize: 12 },
});
