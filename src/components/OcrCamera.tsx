import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Modal, TextInput,
  Image, ActivityIndicator, Alert, Linking,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { CameraView, useCameraPermissions } from 'expo-camera';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../utils/theme';
import { useT } from '../i18n';

export type OcrMode = 'odo' | 'receipt';

export interface ReceiptData {
  tongTien: string;
  soLit: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  mode?: OcrMode;
  onResult: (text: string) => void;
  onReceiptResult?: (data: ReceiptData) => void;
  hint?: string;
}

function extractOdo(blocks: { text: string }[]): string {
  // Merge spaces inside each block independently, then join — avoids merging cross-block
  const normalize = (s: string) => {
    let t = s;
    // Remove spaces between digits (up to 6 passes for "0 9 0 0 0 0")
    for (let i = 0; i < 6; i++) t = t.replace(/(\d)[ \t]+(\d)/g, '$1$2');
    return t;
  };
  const fullText = blocks.map(b => normalize(b.text)).join('\n');

  // Pass 1: 5-6 digit sequence not adjacent to other digits
  // (?<!\d)/(?!\d) instead of \b — so "090000km" also matches
  const pass1 = fullText.match(/(?<!\d)\d{5,6}(?!\d)/g) ?? [];
  if (pass1.length > 0) {
    return [...pass1].sort((a, b) => parseInt(b) - parseInt(a))[0];
  }

  // Pass 2: OCR confuses O (letter) with 0 on LCD displays — replace and retry
  const deOed = fullText.replace(/[Oo]/g, '0');
  const pass2 = deOed.match(/(?<!\d)\d{5,6}(?!\d)/g) ?? [];
  if (pass2.length > 0) {
    return [...pass2].sort((a, b) => parseInt(b) - parseInt(a))[0];
  }

  return '';
}

function extractReceiptData(blocks: { text: string }[]): ReceiptData {
  const fullText = blocks.map(b => b.text).join('\n');

  // Total amount: largest number with thousands separator (>10.000 VND)
  const moneyMatches = fullText.match(/\b\d{1,3}[.,]\d{3}([.,]\d{3})?\b/g) ?? [];
  const amounts = moneyMatches
    .map(m => parseInt(m.replace(/[.,]/g, '')))
    .filter(n => n > 10000);
  const tongTien = amounts.length > 0
    ? [...amounts].sort((a, b) => b - a)[0].toString()
    : '';

  // Liters: decimal next to L/lít keyword
  const literMatch = fullText.match(/(\d{1,2}[.,]\d{1,3})\s*[Ll](?:it|ít|ite?)?\b/);
  let soLit = '';
  if (literMatch) {
    soLit = literMatch[1].replace(',', '.');
  } else {
    // Fallback: any decimal in 1-100 range
    const decimals = (fullText.match(/\b\d{1,2}[.,]\d{1,3}\b/g) ?? [])
      .map(m => parseFloat(m.replace(',', '.')))
      .filter(n => n >= 1 && n <= 100);
    if (decimals.length > 0) soLit = decimals[0].toFixed(2);
  }

  return { tongTien, soLit };
}

type Step = 'pick' | 'live' | 'processing' | 'confirm';
type OcrStatus = 'found' | 'partial' | 'manual';

export default function OcrCamera({ visible, onClose, onResult, onReceiptResult, mode = 'odo', hint }: Props) {
  const colors = useColors();
  const t = useT();
  const [step, setStep] = useState<Step>('pick');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [ocrValue, setOcrValue] = useState('');
  const [soLitValue, setSoLitValue] = useState('');
  const [ocrStatus, setOcrStatus] = useState<OcrStatus>('manual');

  // Live scan
  const [permission, requestPermission] = useCameraPermissions();
  const [liveValue, setLiveValue] = useState('');
  const [liveTimeout, setLiveTimeout] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const scanningRef = useRef(false);
  const lastValueRef = useRef('');
  const stableCountRef = useRef(0);

  const reset = () => {
    scanningRef.current = false;
    setStep('pick');
    setImageUri(null);
    setOcrValue('');
    setSoLitValue('');
    setOcrStatus('manual');
    setLiveValue('');
    setLiveTimeout(false);
    lastValueRef.current = '';
    stableCountRef.current = 0;
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const startLive = async () => {
    if (!permission?.granted) {
      const r = await requestPermission();
      if (!r.granted) {
        Alert.alert(
          t('ocr.camera_perm_title'),
          t('ocr.camera_perm_body'),
          [
            { text: t('ocr.close'), style: 'cancel' },
            { text: t('ocr.open_settings'), onPress: () => Linking.openSettings() },
          ],
        );
        return;
      }
    }
    setLiveValue('');
    setLiveTimeout(false);
    lastValueRef.current = '';
    stableCountRef.current = 0;
    setStep('live');
  };

  // Live OCR loop: snap a low-res frame ~every cycle, recognize, show detected
  // number live. Auto-locks when the same value is read twice in a row.
  useEffect(() => {
    if (step !== 'live') return;
    scanningRef.current = true;
    let cancelled = false;

    const startedAt = Date.now();
    const MAX_SCAN_MS = 45_000; // máy yếu/OCR khó: tự dừng, gợi ý chụp ảnh
    let slowDevice = false;

    const loop = async () => {
      // small delay so the preview is ready before first shot
      await new Promise((r) => setTimeout(r, 600));
      while (scanningRef.current && !cancelled) {
        // Quét quá lâu mà không khoá được -> dừng để khỏi nóng máy/hao pin
        if (Date.now() - startedAt > MAX_SCAN_MS) {
          scanningRef.current = false;
          setLiveTimeout(true);
          break;
        }
        try {
          const cam = cameraRef.current;
          if (cam) {
            const t0 = Date.now();
            const pic = await cam.takePictureAsync({ quality: 0.4, shutterSound: false });
            if (!scanningRef.current || cancelled) break;
            if (pic?.uri) {
              const result = await TextRecognition.recognize(pic.uri);
              const odo = extractOdo(result.blocks);
              if (cancelled) break;
              // Máy chậm (1 vòng > 1.5s) -> giãn nhịp để đỡ giật/nóng
              if (Date.now() - t0 > 1500) slowDevice = true;
              setLiveValue(odo);
              if (odo && odo === lastValueRef.current) {
                stableCountRef.current += 1;
                if (stableCountRef.current >= 2) {
                  // Stable read - lock it in
                  scanningRef.current = false;
                  setImageUri(pic.uri);
                  setOcrValue(odo);
                  setOcrStatus('found');
                  setStep('confirm');
                  break;
                }
              } else {
                lastValueRef.current = odo;
                stableCountRef.current = odo ? 1 : 0;
              }
            }
          }
        } catch {
          /* transient frame error - keep scanning */
        }
        await new Promise((r) => setTimeout(r, slowDevice ? 700 : 250));
      }
    };
    loop();

    return () => { cancelled = true; scanningRef.current = false; };
  }, [step]);

  const useLiveValue = () => {
    scanningRef.current = false;
    setOcrValue(liveValue);
    setOcrStatus(liveValue ? 'found' : 'manual');
    setStep('confirm');
  };

  // Safety: fully reset whenever the sheet is hidden, so re-opening starts clean
  // (otherwise step stays 'live' and the camera loop won't re-arm -> frozen preview).
  useEffect(() => {
    if (!visible) reset();
  }, [visible]);

  const pickImage = useCallback(async (useCamera: boolean) => {
    const picked = useCamera
      ? await ImagePicker.launchCameraAsync({ quality: 1.0 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 1.0 });

    if (picked.canceled || !picked.assets[0]) return;

    const asset = picked.assets[0];
    // For ODO: keep original resolution (no resize) at max quality so digits are sharp
    // For receipt: cap at 1600px wide since text is larger and we save memory
    const ops = mode === 'odo'
      ? []
      : [{ resize: { width: 1600 } } as const];
    const processed = await ImageManipulator.manipulateAsync(
      asset.uri,
      ops,
      { compress: mode === 'odo' ? 1.0 : 0.92, format: ImageManipulator.SaveFormat.JPEG },
    );

    setImageUri(processed.uri);
    setStep('processing');

    try {
      const result = await TextRecognition.recognize(processed.uri);
      if (mode === 'odo') {
        const odo = extractOdo(result.blocks);
        setOcrValue(odo);
        setOcrStatus(odo ? 'found' : 'manual');
      } else {
        const { tongTien, soLit } = extractReceiptData(result.blocks);
        setOcrValue(tongTien);
        setSoLitValue(soLit);
        if (tongTien && soLit) setOcrStatus('found');
        else if (tongTien || soLit) setOcrStatus('partial');
        else setOcrStatus('manual');
      }
    } catch {
      setOcrStatus('manual');
    }

    setStep('confirm');
  }, [mode]);

  const handleConfirm = () => {
    if (mode === 'receipt' && onReceiptResult) {
      onReceiptResult({ tongTien: ocrValue, soLit: soLitValue });
    } else {
      onResult(ocrValue);
    }
    reset();
    onClose();
  };

  const inputStyle = {
    backgroundColor: colors.background,
    color: colors.text,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' }}>
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 }}>

          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600', marginBottom: 8 }}>
            {hint ?? (mode === 'receipt' ? t('ocr.title_receipt') : t('ocr.title_odo'))}
          </Text>

          {step === 'pick' && (
            <>
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 8 }}>
                {mode === 'receipt'
                  ? t('ocr.pick_desc_receipt')
                  : t('ocr.pick_desc_odo')}
              </Text>
              {mode === 'odo' && (
                <View style={{ backgroundColor: colors.background, borderRadius: 8, padding: 10, marginBottom: 12 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                    {t('ocr.tip_odo')}
                  </Text>
                </View>
              )}
              <View style={{ gap: 12 }}>
                {mode === 'odo' && (
                  <TouchableOpacity
                    onPress={startLive}
                    style={{ backgroundColor: colors.primary, padding: 14, borderRadius: 10, alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <FontAwesome5 name="bullseye" size={14} color="#fff" solid />
                      <Text style={{ color: '#fff', fontWeight: '700' }}>{t('ocr.scan_live')}</Text>
                    </View>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => pickImage(true)}
                  style={{ backgroundColor: mode === 'odo' ? colors.card : colors.primary, padding: 14, borderRadius: 10, alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <FontAwesome5 name="camera" size={14} color={mode === 'odo' ? colors.text : '#fff'} solid />
                    <Text style={{ color: mode === 'odo' ? colors.text : '#fff', fontWeight: '600' }}>{t('ocr.take_photo')}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => pickImage(false)}
                  style={{ backgroundColor: colors.card, padding: 14, borderRadius: 10, alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <FontAwesome5 name="images" size={14} color={colors.text} solid />
                    <Text style={{ color: colors.text, fontWeight: '600' }}>{t('ocr.pick_library')}</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </>
          )}

          {step === 'live' && (
            <View>
              <View style={{ height: 280, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000', marginBottom: 12 }}>
                <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" animateShutter={false} />
                {/* Khung canh + overlay số đang nhận */}
                <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{
                    width: '78%', height: 70, borderWidth: 2, borderRadius: 8,
                    borderColor: liveValue ? '#16A34A' : '#ffffffaa',
                  }} />
                </View>
                <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingVertical: 10, alignItems: 'center', backgroundColor: '#00000088' }}>
                  {liveValue ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <FontAwesome5 name="check-circle" size={16} color="#22c55e" solid />
                      <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: 2 }}>{liveValue}</Text>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={{ color: '#fff', fontSize: 13 }}>{t('ocr.live_aim')}</Text>
                    </View>
                  )}
                </View>
              </View>

              <Text style={{ color: liveTimeout ? colors.warning : colors.textSecondary, fontSize: 12, textAlign: 'center', marginBottom: 12 }}>
                {liveTimeout
                  ? t('ocr.live_timeout')
                  : t('ocr.live_hint')}
              </Text>

              <TouchableOpacity
                onPress={useLiveValue}
                disabled={!liveValue}
                style={{
                  backgroundColor: liveValue ? colors.primary : colors.card,
                  padding: 14, borderRadius: 10, alignItems: 'center', marginBottom: 8,
                }}>
                <Text style={{ color: liveValue ? '#fff' : colors.textSecondary, fontWeight: '700' }}>
                  {liveValue ? t('ocr.use_value', { value: liveValue }) : t('ocr.no_value_yet')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { scanningRef.current = false; setStep('pick'); }} style={{ alignItems: 'center', padding: 8 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t('ocr.back_to_photo')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 'processing' && (
            <View style={{ alignItems: 'center', paddingVertical: 36, gap: 16 }}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ color: colors.textSecondary }}>{t('ocr.processing')}</Text>
            </View>
          )}

          {step === 'confirm' && (
            <>
              {imageUri && (
                <Image
                  source={{ uri: imageUri }}
                  style={{ width: '100%', height: 160, borderRadius: 10, marginBottom: 10, resizeMode: 'contain', backgroundColor: colors.background }}
                />
              )}
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12,
                paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
                backgroundColor: ocrStatus === 'found' ? '#16A34A18' : ocrStatus === 'partial' ? '#F5900018' : '#88888818',
              }}>
                <FontAwesome5
                  name={ocrStatus === 'found' ? 'check-circle' : ocrStatus === 'partial' ? 'exclamation-circle' : 'keyboard'}
                  size={13}
                  color={ocrStatus === 'found' ? '#16A34A' : ocrStatus === 'partial' ? '#F59000' : '#888'}
                  solid
                />
                <Text style={{ fontSize: 12, color: ocrStatus === 'found' ? '#16A34A' : ocrStatus === 'partial' ? '#F59000' : '#888' }}>
                  {ocrStatus === 'found'
                    ? t('ocr.status_found')
                    : ocrStatus === 'partial'
                    ? t('ocr.status_partial')
                    : t('ocr.status_manual')}
                </Text>
              </View>

              {mode === 'receipt' ? (
                <>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 4 }}>{t('ocr.label_total')}</Text>
                  <TextInput
                    value={ocrValue}
                    onChangeText={setOcrValue}
                    keyboardType="numeric"
                    placeholder={t('ocr.input_placeholder')}
                    placeholderTextColor={colors.textSecondary}
                    style={[inputStyle, { fontSize: 22, fontWeight: '700' }]}
                  />
                  <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 4 }}>{t('ocr.label_liters')}</Text>
                  <TextInput
                    value={soLitValue}
                    onChangeText={setSoLitValue}
                    keyboardType="decimal-pad"
                    placeholder={t('ocr.input_placeholder')}
                    placeholderTextColor={colors.textSecondary}
                    style={[inputStyle, { fontSize: 22, fontWeight: '700', marginBottom: 16 }]}
                  />
                </>
              ) : (
                <>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 4 }}>{t('ocr.label_odo')}</Text>
                  <TextInput
                    value={ocrValue}
                    onChangeText={setOcrValue}
                    keyboardType="numeric"
                    placeholder={t('ocr.input_placeholder')}
                    placeholderTextColor={colors.textSecondary}
                    style={[inputStyle, { fontSize: 28, fontWeight: '800', textAlign: 'center', letterSpacing: 2, marginBottom: 16 }]}
                  />
                </>
              )}

              <TouchableOpacity
                onPress={handleConfirm}
                style={{ backgroundColor: colors.primary, padding: 14, borderRadius: 10, alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>{t('common.confirm')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setStep('pick')} style={{ alignItems: 'center', padding: 8 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                  {ocrStatus === 'manual' && mode === 'odo'
                    ? t('ocr.retake_closer')
                    : t('ocr.retake')}
                </Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity onPress={handleClose} style={{ marginTop: 4, alignItems: 'center', padding: 8 }}>
            <Text style={{ color: colors.textSecondary }}>{t('common.cancel')}</Text>
          </TouchableOpacity>

        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
