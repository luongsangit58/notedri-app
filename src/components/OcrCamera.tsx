import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, TextInput,
  Image, ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { FontAwesome5 } from '@expo/vector-icons';
import { colors } from '../utils/colors';

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

type Step = 'pick' | 'processing' | 'confirm';
type OcrStatus = 'found' | 'partial' | 'manual';

export default function OcrCamera({ visible, onClose, onResult, onReceiptResult, mode = 'odo', hint }: Props) {
  const [step, setStep] = useState<Step>('pick');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [ocrValue, setOcrValue] = useState('');
  const [soLitValue, setSoLitValue] = useState('');
  const [ocrStatus, setOcrStatus] = useState<OcrStatus>('manual');

  const reset = () => {
    setStep('pick');
    setImageUri(null);
    setOcrValue('');
    setSoLitValue('');
    setOcrStatus('manual');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const pickImage = async (useCamera: boolean) => {
    const picked = useCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.9 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.9 });

    if (picked.canceled || !picked.assets[0]) return;

    const processed = await ImageManipulator.manipulateAsync(
      picked.assets[0].uri,
      [{ resize: { width: 1200 } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
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
  };

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
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' }}>
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 }}>

          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600', marginBottom: 8 }}>
            {hint ?? (mode === 'receipt' ? 'Chụp hoá đơn xăng' : 'Chụp đồng hồ xe')}
          </Text>

          {step === 'pick' && (
            <>
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 20 }}>
                {mode === 'receipt'
                  ? 'Chụp toàn bộ hoá đơn - app tự đọc số lít và tổng tiền.'
                  : 'Căn vùng số ODO vào giữa khung - app tự đọc số km.'}
              </Text>
              <View style={{ gap: 12 }}>
                <TouchableOpacity
                  onPress={() => pickImage(true)}
                  style={{ backgroundColor: colors.primary, padding: 14, borderRadius: 10, alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <FontAwesome5 name="camera" size={14} color="#fff" solid />
                    <Text style={{ color: '#fff', fontWeight: '600' }}>Chụp ảnh</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => pickImage(false)}
                  style={{ backgroundColor: colors.card, padding: 14, borderRadius: 10, alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <FontAwesome5 name="images" size={14} color={colors.text} solid />
                    <Text style={{ color: colors.text, fontWeight: '600' }}>Chọn từ thư viện</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </>
          )}

          {step === 'processing' && (
            <View style={{ alignItems: 'center', paddingVertical: 36, gap: 16 }}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ color: colors.textSecondary }}>Đang đọc số từ ảnh...</Text>
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
                    ? 'Đọc được từ ảnh - kiểm tra trước khi xác nhận'
                    : ocrStatus === 'partial'
                    ? 'Đọc được một phần - vui lòng kiểm tra và bổ sung'
                    : 'Không đọc được - vui lòng nhập thủ công'}
                </Text>
              </View>

              {mode === 'receipt' ? (
                <>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 4 }}>Tổng tiền (đ)</Text>
                  <TextInput
                    value={ocrValue}
                    onChangeText={setOcrValue}
                    keyboardType="numeric"
                    placeholder="Nhập nếu không đọc được..."
                    placeholderTextColor={colors.textSecondary}
                    style={[inputStyle, { fontSize: 22, fontWeight: '700' }]}
                  />
                  <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 4 }}>Số lít</Text>
                  <TextInput
                    value={soLitValue}
                    onChangeText={setSoLitValue}
                    keyboardType="decimal-pad"
                    placeholder="Nhập nếu không đọc được..."
                    placeholderTextColor={colors.textSecondary}
                    style={[inputStyle, { fontSize: 22, fontWeight: '700', marginBottom: 16 }]}
                  />
                </>
              ) : (
                <>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 4 }}>Số ODO (km)</Text>
                  <TextInput
                    value={ocrValue}
                    onChangeText={setOcrValue}
                    keyboardType="numeric"
                    placeholder="Nhập nếu không đọc được..."
                    placeholderTextColor={colors.textSecondary}
                    style={[inputStyle, { fontSize: 28, fontWeight: '800', textAlign: 'center', letterSpacing: 2, marginBottom: 16 }]}
                  />
                </>
              )}

              <TouchableOpacity
                onPress={handleConfirm}
                style={{ backgroundColor: colors.primary, padding: 14, borderRadius: 10, alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Xác nhận</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setStep('pick')} style={{ alignItems: 'center', padding: 8 }}>
                <Text style={{ color: colors.textSecondary }}>Chụp lại</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity onPress={handleClose} style={{ marginTop: 4, alignItems: 'center', padding: 8 }}>
            <Text style={{ color: colors.textSecondary }}>Huỷ</Text>
          </TouchableOpacity>

        </View>
      </View>
    </Modal>
  );
}
